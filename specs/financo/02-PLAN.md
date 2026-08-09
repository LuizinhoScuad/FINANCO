---
programa: financo
tipo: plan
versao: 4.0
criado: 2026-08-09
revisado: 2026-08-09
herda: ../00-CONSTITUTION.md
referencia: 01-SPEC.md
---

# PLAN — Financo v4

> **Revisão v4 (09/08/2026).** O reembolso voltou, agora **sobre** Transações
> (ver [SPEC](01-SPEC.md)). As fases 6 e 7 seguem revogadas — o desenho é outro.
> Decisões novas: D12 (pedido é lançamento marcado), D13 (consulta de grupo em
> vez de coleção de topo) e D14 (Relatórios no menu de todos).

Como a [SPEC](01-SPEC.md) será construída. Este documento traz a arquitetura
alvo, as decisões técnicas com seus porquês e o encadeamento das fases. O
detalhe executável de cada fase vive em [`fases/`](fases/).

## Arquitetura alvo

```
specs/                       00-CONSTITUTION.md
  financo/                   01-SPEC.md · 02-PLAN.md · fases/FASE-0..9-*.md
.claude/
  skills/                    auditar-financo/ · observador-financo/
  agents/                    guardiao-financo.md
scripts/                     scan-financo.mjs · bootstrap-admin.mjs
outputs/
  relatorios/                saídas do Guardião — NÃO versionado (Art. 4)
  lessons-learned.md         aprendizado do Guardião — versionado

firestore.rules              regras versionadas (hoje só existem no console)
storage.rules
middleware.ts

app/
  (app)/
    dashboard|transacoes|relatorios|contas|categorias|orcamentos/
      transacoes/                                         CAMINHO ÚNICO de lançamento
      relatorios/                                         TODOS — pedidos + PDF/XLSX
    admin/aprovacoes/                                     gestor — fila e lotes
    admin/usuarios/                                       gestor — acesso
  error.tsx · not-found.tsx
  api/auth/session|export|import|health/

actions/                     server actions FINAS — só orquestram
  transactions · accounts · categories · budgets
  reembolsos · admin-users

lib/
  core/                      regra de negócio e acesso a dados, tipados
    repositories/*.repo.ts
    money.ts                 aritmética monetária (pura, testável)
    aprovacao.ts             máquina de estados do reembolso (pura, testável)
    exports/cliente.ts       PDF e XLSX gerados no navegador
  guardrails/                proteções — Art. 1, 2 e 6
    transactions.ts          runTransaction / writeBatch
    backup.ts                snapshot antes de sobrescrever
    validate.ts              schemas Zod centralizados
    result.ts                Result<T> — fim do erro engolido
  auth.ts · firebase-*.ts · utils.ts

tests/                       vitest — permanente (Art. 7)
.github/workflows/ci.yml
```

**Regra de camada:** tela e rota nunca falam com o banco. Sempre
`tela → action → core/guardrails → banco`. É o que impede que uma correção de
interface reintroduza uma escrita insegura.

**Morre no caminho:** `lib/db.ts` (o shim que imita o Prisma, tipado como `any`
e que lê coleções inteiras em memória) — deletado ao fim da Fase 4.

## Decisões técnicas

| # | Decisão | Por quê |
|---|---|---|
| D1 | Constituição própria no repositório, sem link para sistema externo | O repositório vai para o GitHub; referência a caminho local quebraria a autocontenção das fases (Art. 8) |
| D2 | Repositórios tipados por entidade no lugar do shim `db: any` | Consertar o shim perpetuaria uma API falsa que finge ser Prisma; repositórios usam consulta nativa com filtro e limite, e `runTransaction` sai natural |
| ~~D3~~ | ~~`expenses` em coleção de topo~~ | **Revogada na v3** — o módulo saiu. Todo dado vive sob `users/{uid}/` |
| ~~D4~~ | ~~Máquina de estados em `expense-status.ts`~~ | **Revogada na v3** — arquivo removido |
| ~~D5~~ | ~~Lote de pagamento (`paymentBatches`)~~ | **Revogada na v3** — não há mais pagamento a fechar |
| D6 | Papel em custom claim + status em documento | Claim é barato e chega às regras do banco sem leitura extra; o documento permite ao admin gerenciar e faz o bloqueio valer antes de a sessão expirar |
| D7 | `xlsx` → `exceljs`; PDF com `jspdf` | `xlsx@0.18.5` do npm tem vulnerabilidades conhecidas sem correção publicada |
| D7b | Exportação PDF **e** XLSX em toda tela que exporta, gerada no navegador | Funciona igual no celular e no computador; no celular o PDF abre direto e vai para o WhatsApp. Sem custo de servidor (RNF-10) |
| D8 | `vitest` | Leve, TypeScript nativo, sem configuração. O alvo prioritário é função pura — não precisa de emulador |
| D9 | Guardião como skill no próprio repositório | Viaja com o código e é versionado. Relatórios ficam fora do Git por conterem dado real (Art. 4) |
| ~~D10~~ | ~~Centavos no módulo de ressarcimento~~ | **Revogada na v3.** Lançamentos seguem em reais por continuidade (Art. 10); `money.ts` continua sendo a fonte única da aritmética, e as conversões para centavos ficam disponíveis |
| D11 | Um único caminho de lançamento (Transações) | Duas telas para a mesma coisa dividem o dado, dobram a manutenção e confundem quem usa. Funcionalidade nova reforça Transações em vez de nascer ao lado |
| D12 | O pedido de reembolso é um lançamento com `reembolso: true`, não uma entidade separada | Preserva D11: quem lança já pediu, no mesmo gesto. Evita o dado do mesmo gasto viver em dois lugares e sair de sincronia |
| D13 | Consulta de grupo (`collectionGroup`) para a visão do gestor, em vez de mover tudo para coleção de topo | A alternativa exigiria migrar os lançamentos existentes de `users/{uid}/transactions` para a raiz — operação destrutiva sobre dado real, para ganhar um índice a menos. O custo é um índice de grupo; o benefício é nenhuma migração (Art. 10, RNF-11) |
| D14 | Relatórios no menu principal, para todo mundo | Quem precisa do relatório no celular é quem está na rua, não só o gestor. O papel muda o alcance da consulta no servidor, não a existência da tela |
| D15 | Situação em `aprovacao`, separada de `status` | `status` já significa pago/pendente no controle pessoal. Reaproveitar o campo faria dois conceitos disputarem o mesmo nome — a confusão que a v3 acabou de eliminar |

## Harness de orquestração

Quem faz o quê ao longo da execução:

| Papel | Responsabilidade | Como se manifesta |
|---|---|---|
| **Executor de fase** | Implementa uma fase por sessão, lendo só o que a fase manda ler | Sessão do Claude Code sobre `fases/FASE-N-*.md` |
| **Guardião** | Verifica integridade dos dados; observa, classifica, nunca age (Art. 9) | `scripts/scan-financo.mjs` + skills `auditar-financo` e `observador-financo` |
| **Auditor de segurança** | Revisa o código contra os riscos conhecidos antes do go-live | Auditoria na Fase 9, com correção obrigatória de crítico e alto |
| **Aprovador humano** | Decide o que entra, confirma toda operação destrutiva (Art. 1) | Luiz |

**Protocolo de sessão.** Toda fase abre com árvore de trabalho limpa, carrega
`00-CONSTITUTION.md` + `01-SPEC.md` + o próprio arquivo de fase, executa os
passos na ordem, e só fecha com typecheck e build verdes, critérios de aceite
verificados de fato e commit feito. O que não pôde ser verificado é declarado
como não verificado (Art. 3), nunca presumido.

## Sequência de fases

```
0 ─ Higiene ✔ ──> 1 ─ Fundação SDD ✔
                        │
                        v
                  2 ─ Segurança ──> 3 ─ Cadastro e aprovação
                        │
                        v
                  4 ─ Integridade ──> 5 ─ Backup e erros
                        │
                        ├──────────────> 8 ─ Guardião
                        │                     (pode iniciar após a 4)
                        v
                  9 ─ Testes, CI, auditoria e go-live

              (6 e 7 — ressarcimento — revogadas na v3)
```

**Segurança e integridade antes de funcionalidade.** Ninguém é convidado antes
da Fase 3; nenhum dinheiro é registrado antes da Fase 4 estar concluída. O
Guardião vem depois que existe o que vigiar.

| Fase | Entrega | Estado |
|---|---|---|
| [0](fases/FASE-0-HIGIENE.md) | Checkpoint, limpeza, configs de deploy, health check real | ✅ concluída |
| [1](fases/FASE-1-FUNDACAO-SDD.md) | Constituição, SPEC, PLAN, arquivos de fase | ✅ concluída |
| [2](fases/FASE-2-SEGURANCA.md) | Regras versionadas, papéis, middleware, primeiro admin | pendente |
| [3](fases/FASE-3-CADASTRO-APROVACAO.md) | Auto-cadastro com aprovação, painel de usuários | pendente |
| [4](fases/FASE-4-INTEGRIDADE-DADOS.md) | Operações atômicas, repositórios tipados, fim do `db: any` | pendente |
| [5](fases/FASE-5-BACKUP-E-ERROS.md) | Importação segura, exportação paginada, erro visível | pendente |
| ~~[6](fases/FASE-6-RESSARCIMENTO.md)~~ | ~~Modelo, regras e fluxo do colaborador~~ | 🚫 revogada na v3 — código removido |
| ~~[7](fases/FASE-7-ADMIN-LOTES-RELATORIOS.md)~~ | ~~Aprovação, lotes, relatórios~~ | 🚫 revogada na v3 — código removido |
| [8](fases/FASE-8-GUARDIAO.md) | Verificação de integridade, observador, aprendizado | pendente |
| [9](fases/FASE-9-QUALIDADE-GO-LIVE.md) | Testes, integração contínua, auditoria, piloto | pendente |

As fases 6 e 7 chegaram a ser implementadas e foram desfeitas na revisão v3. Os
arquivos delas continuam em `fases/` como registro histórico — não são trabalho
a fazer.

## Riscos

| Risco | Mitigação |
|---|---|
| Publicar regras novas derrubar o uso atual | Salvar as regras vigentes antes; testar imediatamente após publicar; reversão documentada na Fase 2 |
| Refatorar a camada de dados corromper dado existente | O formato dos documentos não muda, só o caminho de acesso; migração action a action com verificação entre cada; backup completo antes de começar |
| Dado órfão do módulo antigo remanescente no Firestore | `expenses` e `expenseCategories` não são mais lidas nem escritas, e o padrão `deny` as fecha ao cliente. A remoção definitiva é decisão do Luiz, feita à parte (Art. 1) |
| Consulta de grupo sem índice publicado falhar em produção | Os índices estão em `firestore.indexes.json` e precisam ser publicados junto com o deploy; a falha do Firestore é explícita ("requires an index"), não silenciosa |
| Gestor enxergar lançamento particular de colaborador | É comportamento pedido e decidido (RF-49), não acidente. Mitigação é combinar com a equipe, e o aviso ao promover alguém a admin diz isso em letras claras |
| Alguém reintroduzir uma segunda tela de lançamento | D11 e o critério de aceite "existe uma única tela de lançamento"; os RF revogados estão listados na SPEC justamente para não voltarem |
| Usuário bloqueado continuar ativo até a sessão expirar | Ação sensível revalida o status no documento, não confia só no cookie |
| Sessão de trabalho estourar o contexto | Cada arquivo de fase declara a lista fechada do que ler; a Fase 4 já está prevista como duas sessões |
| Guardião escrever no banco por acidente | Script sem nenhum método de escrita, verificável por busca textual; credencial fora do repositório |
