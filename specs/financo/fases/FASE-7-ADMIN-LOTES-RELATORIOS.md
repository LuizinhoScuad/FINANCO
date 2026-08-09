---
programa: financo
tipo: fase
fase: 7
titulo: Painel do admin — aprovação, lotes de pagamento e relatórios
status: revogada
revogada_em: 2026-08-09
concluida_em: 2026-08-09
depende_de: [6]
herda: ../../00-CONSTITUTION.md
---

> ## 🚫 FASE REVOGADA — 09/08/2026
>
> O módulo de ressarcimento foi **retirado do produto** e todo o código desta
> fase foi removido do repositório. Na prática ele criava uma segunda porta de
> lançamento, concorrente e confusa com a de Transações.
>
> Este arquivo permanece apenas como **registro histórico**. Não execute nada
> aqui. O caminho único de lançamento é `app/(app)/transacoes/`.
>
> Ver: [`../01-SPEC.md`](../01-SPEC.md#requisitos-revogados-v2) · [`../02-PLAN.md`](../02-PLAN.md)

# FASE 7 — Aprovação, lotes e relatórios

**Objetivo:** fechar o ciclo do dinheiro — aprovar, pagar em lote e ter o
comprovante. Atende RF-14 a RF-21 e RF-24.

## Ler apenas

- `actions/expenses.ts`
- `lib/core/expense-status.ts`
- `lib/core/repositories/expenses.repo.ts`
- `app/api/export/route.ts` (padrão de exportação existente)
- `app/(app)/transacoes/TransacoesClient.tsx` — **somente** a função de exportar
  XLSX, que será substituída pelo módulo novo
- `firestore.indexes.json`
- `firestore.rules`

## Modelo do lote (D5)

**`paymentBatches`** — um lote por pessoa por fechamento:

| Campo | Observação |
|---|---|
| `userId`, `userName` | de quem é o lote |
| `periodStart`, `periodEnd` | período fechado |
| `totalCents`, `expenseCount` | conferência |
| `status` | `ABERTO` \| `PAGO` |
| `paidAt`, `createdBy`, `createdAt` | |

Fechar o lote grava o documento **e** carimba `paymentBatchId`,
`status: RESSARCIDA` e `reimbursedAt` em todas as despesas — tudo num
`writeBatch` (Art. 2). Nunca em laço: falhar no meio deixaria metade paga.

## Passos

1. **Ações do admin** em `actions/expenses.ts`, todas com `requireAdmin()` e
   validação pela máquina de estados:
   - `approve(id)`
   - `reject(id, motivo)` — motivo obrigatório (RF-15)
   - `closeBatch({ userId, periodStart, periodEnd })` — cria o lote e marca as
     aprovadas; mostra prévia com total e quantidade **antes** de confirmar (Art. 1)

2. **`app/(app)/admin/aprovacoes/`** — fila de enviadas, com o recibo à vista
   (miniatura que abre em tamanho cheio), marca "sem comprovante" em destaque, e
   aprovar/rejeitar sem sair da lista.

3. **`app/(app)/admin/relatorios/`** — filtros por pessoa, período e status;
   totais por pessoa e por categoria; ação de fechar lote; histórico de lotes
   fechados com comprovante em PDF (RF-17).

4. **Módulo de exportação** `lib/core/exports/` (D7b):
   - `xlsx-report.ts` com **exceljs** — a troca do `xlsx` acontece aqui (D7)
   - `pdf-report.ts` com `jspdf` + `jspdf-autotable` — cabeçalho Scuadra/Financo,
     período, tabela, totais por categoria e status
   - Aplicar em **todas** as telas que exportam, incluindo o retrofit das
     **Transações pessoais**, que hoje só têm XLSX (RF-24)
   - Gerado no navegador, sem custo de servidor (RNF-10); no celular o PDF abre
     direto e pode ir para o WhatsApp

5. **Indicadores de pendência** (RF-21): contador de enviadas no menu do admin;
   de rejeitadas no menu do colaborador.

6. **Índices** em `firestore.indexes.json`: `expenses` por `(status, createdAt)`
   e por `(userId, status, date)`. Publicar e confirmar que as consultas não
   caem em varredura.

7. **Regras** — `paymentBatches`: leitura do dono e do admin; escrita só admin.

## Riscos

| Risco | Mitigação |
|---|---|
| Fechamento parcial deixar metade das despesas paga | `writeBatch` atômico; nunca laço sequencial |
| Fechar lote errado (pessoa ou período) | Prévia obrigatória com nome, período, quantidade e total antes de confirmar |
| Consulta do admin ficar lenta | Índices publicados antes de testar |

## Critérios de aceite

- [ ] Ciclo completo demonstrável: registrar → aprovar → fechar lote → PDF e XLSX
      com totais **conferidos na mão**
- [ ] Rejeição sem motivo é recusada; com motivo, volta ao colaborador
- [ ] Fechar lote mostra prévia (pessoa, período, quantidade, total) antes de confirmar
- [ ] Após o fechamento, todas as despesas do lote estão ressarcidas — nenhuma sobra
- [ ] Comprovante do lote em PDF abre no celular
- [ ] Transações pessoais passam a exportar PDF além de XLSX
- [ ] Dependência `xlsx` removida do projeto
- [ ] Exportação funciona no celular **e** no computador
- [ ] Typecheck e build verdes; commit feito
