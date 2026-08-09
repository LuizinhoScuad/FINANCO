---
programa: financo
tipo: fase
fase: 3
titulo: Cadastro com aprovação e painel de usuários
status: concluida
concluida_em: 2026-08-09
depende_de: [2]
herda: ../../00-CONSTITUTION.md
---

# FASE 3 — Cadastro com aprovação e painel de usuários

> ## ✅ Concluída em 2026-08-09
>
> **Verificado com sessões reais de cada papel**, não por inspeção: admin abre o
> painel (200); colaborador é desviado para o painel comum (307 → /dashboard);
> colaborador usa o app normalmente (200); sem sessão não chega ao painel
> (307 → /login).
>
> **Decisões tomadas na execução:**
> - `revokeRefreshTokens` ao bloquear — sem isso o cookie de 5 dias já emitido
>   continuaria valendo.
> - Ordem de escrita em `definirPapelEStatus`: primeiro os claims (o que barra
>   de fato), depois o documento. Se a segunda falhar, sobra um painel
>   desatualizado — chato, mas seguro. O inverso deixaria alguém com acesso real
>   e aparência de bloqueado.
> - `listarUsuarios` parte do Firebase Auth, não do Firestore: conta criada com
>   o cadastro interrompido no meio continua visível ao administrador em vez de
>   sumir do painel.
> - Travas contra trancar a porta com a chave dentro: ninguém bloqueia ou
>   rebaixa a si mesmo, e o último administrador ativo não pode ser removido.
> - No celular, com área administrativa, o menu inferior mostra 4 telas em vez
>   de 5, para os alvos de toque não encolherem.
>
> **Corrigido durante a execução:** `/admin` faltava no `matcher` do middleware.
>
> Commit: `Fase 3 (SDD): cadastro com aprovação e painel de usuários`

**Objetivo:** a equipe entra pela porta da frente — cada pessoa se cadastra, e
só o Luiz decide quem passa. Atende RF-01 a RF-04.

## Ler apenas

- `app/login/LoginClient.tsx`
- `app/api/auth/session/route.ts`
- `lib/auth.ts` (como ficou na Fase 2)
- `actions/accounts.ts` (padrão de server action do projeto)
- `app/(app)/layout.tsx`
- `components/layout/Sidebar.tsx` e `BottomNav.tsx`

## Passos

### 1. Cadastro cria conta pendente

`LoginClient.tsx`: ao criar conta, além do usuário no Firebase Auth, gravar
`users/{uid}` com `{ name, email, role: "COLABORADOR", status: "PENDING", createdAt }`
via server action (o cliente não pode escrever esses campos — Fase 2).

Após cadastrar, **não** entra: vai para a tela de espera.

### 2. Tela de espera

`app/aguardando/page.tsx` — **fora** do grupo `(app)`, senão o redirecionamento
do layout autenticado cria laço infinito. Mensagem simples: cadastro recebido,
aguarde liberação.

### 3. `actions/admin-users.ts`

Todas as ações com `requireAdmin()`:

- `listUsers()` — lista com nome, e-mail, papel, status, data
- `approveUser(uid)` — claim `role: COLABORADOR` + `status: ACTIVE`, grava
  `approvedBy` e `approvedAt`
- `blockUser(uid)` / `unblockUser(uid)` — alterna `status`
- `promoteToAdmin(uid)` — reservado ao Luiz, com confirmação (Art. 1)

Toda ação retorna `Result<T>` para a tela conseguir mostrar erro (Art. 6).

### 4. Repositório de usuários

`lib/core/repositories/users.repo.ts` — tipado, sem `any`. Este é o primeiro
repositório do projeto e serve de molde para os da Fase 4.

### 5. Painel de usuários

`app/(app)/admin/usuarios/` — lista com status colorido e botões de aprovar,
bloquear e desbloquear. Contador de pendentes no topo.

### 6. Navegação por papel

`Sidebar.tsx` e `BottomNav.tsx` só mostram a área administrativa para `ADMIN`.
Isso é conveniência, **não** é segurança — quem garante é o `requireAdmin()`
(Art. 5).

## Riscos

| Risco | Mitigação |
|---|---|
| Usuário pendente preso em laço de redirecionamento | Tela de espera fora do grupo `(app)`; testar o caminho completo com conta nova |
| Admin se bloquear sozinho | `blockUser` recusa quando o alvo é o próprio usuário ou o último admin ativo |
| Colaborador aprovado não enxergar a mudança | Aviso na tela de espera de que é preciso entrar novamente |

## Critérios de aceite

Verificar com **duas contas reais** (Luiz + conta de teste):

- [ ] Conta nova fica pendente e não acessa nenhuma tela do sistema
- [ ] Pendente aparece no painel do admin
- [ ] Após aprovação e novo login, o colaborador entra normalmente
- [ ] Bloqueado perde o acesso na ação seguinte, sem esperar a sessão expirar
- [ ] Colaborador não vê a área administrativa no menu **e** recebe recusa ao acessar a rota direto
- [ ] Admin não consegue bloquear a si mesmo
- [ ] Erro de qualquer ação aparece na tela em português
- [ ] Typecheck e build verdes; commit feito
