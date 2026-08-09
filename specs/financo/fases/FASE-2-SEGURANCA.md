---
programa: financo
tipo: fase
fase: 2
titulo: Segurança base — regras versionadas, papéis e middleware
status: concluida
concluida_em: 2026-08-09
depende_de: [0, 1]
herda: ../../00-CONSTITUTION.md
---

# FASE 2 — Segurança base

> ## ✅ Concluída em 2026-08-09
>
> **Achado grave durante a execução:** as regras do Storage eram a regra
> temporária padrão do Firebase — `allow read, write: if request.time <
> timestamp.date(2026, 5, 12)`. Consequências: até 12/05/2026 qualquer pessoa na
> internet podia ler, gravar e apagar todos os recibos, sem login; depois dessa
> data a condição virou falsa e o **envio de recibos estava quebrado havia quase
> três meses** sem ninguém perceber. Publicar `storage.rules` corrigiu os dois
> problemas de uma vez.
>
> **Achado bom:** o Firestore já estava com `allow read, write: if false` e o
> cliente nunca o acessa (verificado: nenhum import de `firebase/firestore` no
> código do navegador). Manter a negação total é mais forte que escrever regras
> permissivas — não há regra para errar. Documentado no próprio arquivo.
>
> **Decisão de sequência:** o bootstrap do admin rodou **antes** da publicação
> das regras, para reduzir a janela sem upload.
>
> **Verificado com token real** (não só por inspeção): conta liberada abre sessão
> (HTTP 200); conta não liberada é barrada (HTTP 403). Token inválido devolve
> 401, corpo malformado devolve 400 — nada de 500. Rota protegida sem cookie
> redireciona ao login; `/aguardando` responde sem laço.
>
> Commit: `Fase 2 (SDD): segurança base`

**Objetivo:** fechar o perímetro **antes** de qualquer colaborador ser
convidado. Hoje o cadastro é aberto a qualquer pessoa com o endereço, não existe
papel, e as regras do banco vivem só no console — invisíveis ao repositório e
sem histórico.

> ⚠️ Esta fase publica regras de segurança em produção. Art. 1: salvar as regras
> vigentes e obter confirmação do Luiz **antes** de publicar.

## Ler apenas

- `lib/auth.ts`
- `lib/firebase-admin.ts`
- `lib/firebase-storage.ts`
- `app/api/auth/session/route.ts`
- `app/login/LoginClient.tsx`
- `firebase.json`
- `app/(app)/layout.tsx`

## Passos

### 1. Salvar as regras atuais (antes de tudo)

No console do Firebase, copiar as regras vigentes do Firestore e do Storage para
`outputs/relatorios/rules-backup-console.txt`. Sem isso não há reversão.

### 2. `firestore.rules`

Negar por padrão. Funções auxiliares lendo o custom claim:

- `isSignedIn()`, `isActive()` (claim `status == "ACTIVE"`), `isAdmin()`
- `users/{uid}` — dono lê o próprio; **escrita de `role` e `status` negada ao
  cliente** (só via Admin SDK no servidor)
- `users/{uid}/{colecao}/{doc}` — leitura e escrita só do dono e só se ativo
- `expenses` e `expenseCategories` — deixar preparado e fechado; a regra
  completa é da Fase 6

### 3. `storage.rules`

- `receipts/{uid}/**` — escrita só do dono ativo, `contentType` de imagem,
  tamanho abaixo de 10 MB; leitura do dono e do admin
- Todo o resto negado

Isto importa mais do que parece: o upload de recibo acontece **direto do
navegador**, então esta regra é a única barreira real (Art. 5).

### 4. `firebase.json`

Registrar `firestore.rules` e `storage.rules`. Publicar com
`firebase deploy --only firestore:rules,storage` — **após confirmação do Luiz**.

### 5. `lib/auth.ts`

- `getSessionUser()` → `{ uid, role, status }` a partir dos claims do cookie
- `requireCurrentUserId()` → `redirect("/login?expirada=1")` em vez de lançar
  erro cru (hoje a sessão expirada quebra a tela)
- `requireAdmin()` → redireciona quem não é admin
- Ação sensível revalida `status` no documento, não só no claim (D6): é o que
  faz o bloqueio valer antes de a sessão de 5 dias expirar

### 6. `middleware.ts`

Sem cookie de sessão → `/login`. Validação profunda continua no servidor; o
middleware só evita a viagem inútil.

### 7. `scripts/bootstrap-admin.mjs`

Recebe um e-mail, define o claim `role: ADMIN` + `status: ACTIVE` e cria o
documento `users/{uid}` correspondente. É a **migração do usuário existente**
(Art. 10) — o Luiz precisa continuar usando o app sem interrupção.

Após rodar: forçar novo login, porque o cookie antigo não carrega o claim novo.

### 8. Bloqueio na criação de sessão

`app/api/auth/session/route.ts` recusa criar sessão quando `status != "ACTIVE"`,
devolvendo o estado para a tela mostrar "aguardando aprovação" (a tela em si é
da Fase 3).

## Riscos

| Risco | Mitigação |
|---|---|
| Regra nova derrubar o uso do Luiz | Backup do console salvo antes; testar CRUD pessoal imediatamente depois de publicar; reverter republicando o backup |
| Claim ausente no cookie vigente | Forçar novo login após o bootstrap |
| Upload de recibo parar de funcionar | Testar envio de foto logo após publicar as regras do Storage |

## Critérios de aceite

- [ ] `firestore.rules` e `storage.rules` no repositório e publicados **a partir dele**
- [ ] Backup das regras anteriores salvo antes da publicação
- [ ] Luiz é `ADMIN` / `ACTIVE` e usa o app normalmente — contas, transações, upload de recibo
- [ ] Usuário sem documento ou sem claim não acessa nada
- [ ] Sessão expirada leva ao login com aviso, sem tela quebrada
- [ ] Tentativa de gravar `role` ou `status` pelo cliente é recusada pela regra
- [ ] Typecheck e build verdes; commit feito
