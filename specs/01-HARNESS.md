---
programa: financo
tipo: harness
versao: 1.0
criado: 2026-08-09
herda: 00-CONSTITUTION.md
---

# HARNESS — onde cada coisa mora e como o trabalho acontece

A [Constituição](00-CONSTITUTION.md) diz o que não se pode violar. A
[SPEC](financo/01-SPEC.md) diz o que construir. O [PLAN](financo/02-PLAN.md) diz
como. **Este documento diz onde as coisas ficam** — e é verificável por máquina:
`npm run verificar:estrutura`.

Existe por um motivo concreto. Numa sessão de agosto de 2026, o trabalho
produziu scripts soltos em `scripts/tmp/`, um teste que deixou usuário fantasma
no banco, e arquivos de configuração espalhados pela raiz. Nada disso quebrou o
app, mas cada um deles é uma armadilha esperando a próxima pessoa. Regra escrita
e não verificada é decoração; por isso cada regra aqui tem um teste.

---

## 1. Mapa do repositório

```
specs/                        GOVERNO — spec antes de código
  00-CONSTITUTION.md          10 artigos invioláveis (vale para tudo)
  01-HARNESS.md               este arquivo (vale para tudo)
  financo/                    documentos DO programa
    01-SPEC.md                o quê e por quê
    02-PLAN.md                o como
    fases/                    uma fase por arquivo, autocontida

app/                          telas e rotas (Next.js App Router)
  (app)/                      área autenticada
  api/                        rotas de API
actions/                      server actions FINAS — só orquestram
lib/
  core/                       regra de negócio e acesso a dados, tipados
    repositories/             uma porta por entidade
    aprovacao.ts · money.ts   funções puras, testáveis sem banco
    exports/                  PDF e XLSX gerados no navegador
  guardrails/                 proteções — Art. 1, 2 e 6
components/                   componentes de tela reutilizáveis
types/                        contratos compartilhados

tests/                        PORTÃO — função pura, sem rede (`npm test`)
  *.test.ts                   dinheiro, máquina de estados, validação
  integracao/                 FORA do portão — tocam o Firestore real
    *.test.ts                 ciclo real, rodado pelo vitest
    sondas/                   verificações de linha de comando (.mjs)
    apoio/                    credenciais e stubs dos testes

scripts/                      ferramentas de linha de comando
  guardiao/                   varredura e a prova de que ela não escreve
  dados/                      backup, migração, simulação, limpeza
  dev/                        estrutura do repositório e atalho local
firebase/                     regras e índices versionados
docs/                         PROGRESSO.md — diário de bordo
outputs/                      saídas do Guardião (relatórios NÃO versionados)
```

**Regra de camada, inegociável:** `tela → action → lib/core + lib/guardrails →
banco`. Tela e rota nunca falam com o banco direto. É o que impede uma correção
de interface de reintroduzir uma escrita insegura.

---

## 2. O que fica na raiz — e por quê

A raiz parece cheia, e boa parte disso **não é bagunça: é exigência de
ferramenta.** Mover quebraria o build.

| Arquivo | Por que precisa estar na raiz |
|---|---|
| `package.json` · `package-lock.json` | npm resolve dependências a partir daqui |
| `next.config.ts` · `next-env.d.ts` | convenção do Next.js, não configurável |
| `middleware.ts` | o Next só reconhece na raiz (ou em `src/`) |
| `tsconfig.json` | raiz do projeto TypeScript |
| `eslint.config.mjs` · `postcss.config.mjs` · `vitest.config.mts` | descoberta automática pela ferramenta |
| `firebase.json` · `.firebaserc` | a CLI do Firebase procura aqui |
| `apphosting.yaml` | lido pelo Firebase App Hosting no deploy |
| `.env` · `.env.example` · `.gitignore` | convenção universal |
| `README.md` · `CLAUDE.md` | porta de entrada humana e do assistente |

**Tudo o que não está nessa lista tem pasta.** Foi por isso que, em 09/08/2026,
`firestore.rules`, `firestore.indexes.json` e `storage.rules` foram para
`firebase/` (com os caminhos atualizados em `firebase.json`) e
`iniciar_financo.bat` foi para `scripts/`.

O `verificar:estrutura` falha se aparecer arquivo novo solto na raiz. Se for
legítimo, adicione-o à lista permitida **no script** — o gesto de editar a lista
é o que força a decisão consciente.

---

## 3. Testes: dois níveis, propósitos diferentes

| | `tests/*.test.ts` | `tests/integracao/` |
|---|---|---|
| Roda com | `npm test` | `npm run test:integracao` |
| Toca banco? | **Nunca** | Sim, o Firestore real |
| Precisa credencial? | Não | Sim (`.env`) |
| Está no portão de CI? | **Sim** | Não |
| Duração | milissegundos | segundos |

O portão precisa ser rápido e rodar sem segredo, senão vira obstáculo e alguém
o desliga. Por isso `tests/integracao/**` está explicitamente excluído do
`vitest.config.mts` da raiz.

**Toda semeadura de teste usa o prefixo `zzz-teste-`** — em Firestore *e* no
Firebase Auth — e é apagada ao fim, com conferência. Esta regra nasceu de um
teste que apagou o documento mas esqueceu a conta de autenticação: sobrou um
usuário fantasma no painel do administrador, visível e impossível de liberar.

Se algo escapar: `node scripts/limpar-residuo-teste.mjs`.

### Arsenal de verificação

| Comando | O que prova |
|---|---|
| `npm test` | Regra de negócio pura: dinheiro, máquina de estados, validação |
| `npm run typecheck` | Contratos entre camadas |
| `npm run lint` | Padrão de código |
| `npm run build` | Compila e todas as rotas montam |
| `npm run verificar:estrutura` | O repositório continua no formato deste documento |
| `npm run test:integracao` | O ciclo real contra o Firestore |
| `npm run test:fumaca` | As telas carregam autenticadas, e o isolamento entre pessoas vale |
| `npm run test:consultas` | Toda consulta tem índice publicado |
| `npm run test:responsivo` | Nenhuma tela transborda nem exige arrastar de lado no celular |
| `npm run capturar:celular` | Fotografa as telas num viewport de celular |
| `npm run indices:estado` | Estado de construção de cada índice do Firestore |
| `npm run conferir:backup` | O que mudou no banco desde o último backup |
| `npm run scan:verificar` | O Guardião não escreve (Art. 9) |
| `npm run scan` | Integridade dos dados reais |

**Tudo por `npm run`.** Ninguém precisa decorar caminho de script — e mover um
arquivo de pasta não quebra o hábito de ninguém.

---

## 4. Scripts: nenhum arquivo solto, nenhum `tmp/`

Todo script em `scripts/` precisa de: **cabeçalho dizendo o que faz e por que
existe**, e — se escreve — **prévia antes de gravar** e caminho de **desfazer**
(Art. 1).

| Script | Papel | Escreve? |
|---|---|---|
| `guardiao/scan.mjs` | Varredura de integridade | Não (verificável por busca textual) |
| `guardiao/verificar.mjs` | Prova que o Guardião não escreve | Não |
| `dados/backup.mjs` | Cópia completa antes de operação destrutiva | Não (só lê) |
| `dados/bootstrap-admin.mjs` | Primeiro administrador | Sim |
| `dados/migrar-para-reembolso.mjs` | Migração de histórico | Sim — com prévia e `--desfazer` |
| `dados/simular-reembolso.mjs` | Dados de simulação para testar o fluxo | Sim — com `--limpar` |
| `dados/limpar-residuo-teste.mjs` | Remove semeadura `zzz-teste-*` esquecida | Sim |
| `dev/verificar-estrutura.mjs` | Faz valer este documento | Não |
| `dev/iniciar_financo.bat` | Sobe o app local e abre o navegador | Não |

**Proibido:** `scripts/tmp/`, `tmp_*.mjs`, script de uso único deixado para trás.
Trabalho descartável vai para o diretório temporário da sessão, fora do
repositório. O `verificar:estrutura` falha se encontrar qualquer um deles.

---

## 5. Protocolo de sessão

**Abre** com árvore de trabalho limpa. Carrega **apenas**
`00-CONSTITUTION.md` + `financo/01-SPEC.md` + o arquivo da fase. Cada arquivo de
fase declara a lista fechada do que ler — é isso que segura o contexto.

**Fecha** com, nesta ordem, sem pular etapa:

1. `npm run verificar:estrutura` — o repositório continua íntegro
2. `npm test` · `npm run typecheck` · `npm run lint` · `npm run build`
3. Critérios de aceite verificados **de fato**, não presumidos (Art. 3)
4. Nenhum resíduo `zzz-teste-*` no banco
5. `docs/PROGRESSO.md` atualizado com a hora real do sistema
6. Commit

O que não pôde ser verificado é **declarado como não verificado**. Nunca
presumido.

### Quando a spec e o código discordam

A spec ganha — ou muda. Mudou o rumo? **Reescreva a SPEC na mesma sessão**, com
o número da versão e a data, e marque como revogado o que saiu. Requisito
revogado fica listado, não apagado: é assim que ninguém o reintroduz por engano
lendo uma fase antiga. Foi o que se fez nas revisões v3 e v4.

### Mudança de esquema no banco

Campo novo em documento existente **nunca** é migração automática de deploy.
O código lê a ausência do campo como um padrão seguro, e a migração — se for
desejada — é ato deliberado: script próprio, backup antes, prévia antes de
gravar, desfazer disponível (Art. 1, Art. 10).

---

## 6. Consulta nova exige índice publicado

Consulta com filtro composto ou `collectionGroup` **não funciona** sem índice, e
a falha aparece só em execução. Ao escrever uma consulta nova:

1. Declare o índice em `firebase/firestore.indexes.json`
2. Publique: `firebase deploy --only firestore:indexes`
3. **Espere ficar pronto** — a construção é assíncrona e leva minutos
4. Prove com `npm run test:consultas`

Duas armadilhas já encontradas, ambas custaram tempo:

- Duas igualdades em `collectionGroup` **não** aceitam índice composto — o
  Firestore exige índice de campo único com escopo de grupo, declarado em
  `fieldOverrides`. Ele recusa o composto com "this index is not necessary".
- Um índice inválido **derruba o lote inteiro**. Um `(date, __name__)` obsoleto
  ficou anos no arquivo impedindo qualquer publicação, sem ninguém notar.

Contador de badge e enfeite de tela **nunca** derrubam a página: `app/(app)/layout.tsx`
embrulha todas as telas, e uma consulta sem índice ali tiraria o app do ar por
causa de um número ao lado do menu. Falhou, vale zero e o motivo vai para o log.
