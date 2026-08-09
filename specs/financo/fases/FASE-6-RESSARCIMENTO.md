---
programa: financo
tipo: fase
fase: 6
titulo: Ressarcimento — modelo, regras e fluxo do colaborador
status: concluida
concluida_em: 2026-08-09
depende_de: [2, 3, 4]
herda: ../../00-CONSTITUTION.md
---

# FASE 6 — Ressarcimento: modelo e fluxo do colaborador

**Objetivo:** o colaborador registra uma despesa de rua pelo celular em menos de
30 segundos. Atende RF-06 a RF-13.

## Ler apenas

- `types/index.ts`
- `app/(app)/transacoes/TransacoesClient.tsx` — **somente** o trecho de OCR e
  upload de recibo, que será reaproveitado
- `lib/firebase-storage.ts`
- `lib/core/repositories/users.repo.ts` (molde de repositório, Fase 3)
- `firestore.rules`
- `components/layout/BottomNav.tsx`
- `lib/guardrails/result.ts`

## Modelo de dados

**`expenses`** — coleção de topo, com `userId` (D3):

| Campo | Observação |
|---|---|
| `userId`, `userName` | dono; nome desnormalizado para o relatório do admin |
| `amountCents` | inteiro, em centavos (D10) |
| `date`, `categoryId`, `description` | |
| `receiptPath` | **nulo é permitido** — a foto é opcional (RF-07) |
| `status` | ver máquina de estados |
| `rejectionReason` | obrigatório quando rejeitada |
| `approvedBy`, `approvedAt` | |
| `paymentBatchId`, `reimbursedAt` | preenchidos no fechamento de lote (Fase 7) |
| `createdAt`, `updatedAt` | |

A marca "sem comprovante" é **derivada** de `receiptPath == null` — não é campo
próprio, para não haver dois lugares dizendo a mesma coisa.

**`expenseCategories`** — coleção de topo, mantida pelo admin (RF-09, RF-20).
Semear com: Alimentação, Transporte, Estacionamento, Pedágio, Combustível,
Hospedagem, Outros. Desativar usa `active: false` — **nunca excluir**, senão o
histórico perde a referência.

## Máquina de estados (D4)

```
RASCUNHO ──> ENVIADA ──> APROVADA ──> RESSARCIDA   (só via lote, Fase 7)
                  │
                  └────> REJEITADA ──> ENVIADA     (corrige e reenvia)
```

`APROVADA` e `RESSARCIDA` são imutáveis fora dessas transições (RF-12).

Implementar em `lib/core/expense-status.ts` como **função pura** — a mesma regra
serve à action, à regra do banco e ao teste da Fase 9.

## Passos

1. **Tipos** em `types/index.ts`: `Expense`, `ExpenseCategory`, `ExpenseStatus`.
2. **`lib/core/expense-status.ts`** — `canTransition(de, para, papel)` e a lista
   de transições válidas.
3. **Repositórios** `expenses.repo.ts` e `expense-categories.repo.ts`, com a
   semeadura das categorias padrão.
4. **`actions/expenses.ts`** — `createDraft`, `update`, `submit`, `remove`.
   Só o dono; só em `RASCUNHO` ou `REJEITADA`. Envio **sem foto é permitido**,
   com aviso na confirmação (RF-07). Upload para
   `receipts/{uid}/expenses/{expenseId}.{ext}`.
5. **Regras do Firestore** para `expenses`:
   - criar: `userId == request.auth.uid` e status inicial `RASCUNHO` ou `ENVIADA`
   - ler: dono **ou** admin
   - atualizar (dono): só em `RASCUNHO`/`REJEITADA`, e proibido tocar em
     `status`, `approvedBy`, `approvedAt`, `paymentBatchId`
   - transições de aprovação: só admin
   - `expenseCategories`: leitura para ativo, escrita só admin
6. **Telas** em `app/(app)/despesas/`:
   - `nova/` — mobile primeiro: câmera → OCR pré-preenche valor e data → categoria
     → enviar. Falha de OCR **nunca bloqueia** (RF-08); falha de upload não apaga
     o que foi digitado (RNF-02)
   - listagem "minhas despesas" — status colorido, marca "sem comprovante",
     motivo de rejeição, ação de corrigir e reenviar
   - botões de exportar PDF e XLSX (a implementação do módulo é da Fase 7;
     aqui pode ficar o ponto de entrada)
7. **Navegação** — item Despesas no menu inferior e na barra lateral.

## Matriz de verificação (testar caso a caso)

| Estado | Dono pode editar | Dono pode excluir | Admin decide |
|---|---|---|---|
| RASCUNHO | sim | sim | não |
| ENVIADA | **não** | não | sim |
| APROVADA | **não** | não | só fechar lote |
| REJEITADA | sim | sim | não |
| RESSARCIDA | **não** | não | não |

## Critérios de aceite

Verificar com duas contas reais, uma delas pelo celular:

- [ ] Registrar despesa com foto pelo celular leva menos de 30 segundos
- [ ] Registrar **sem** foto funciona e a despesa aparece marcada "sem comprovante"
- [ ] Falha de OCR não impede o envio
- [ ] Colaborador A não vê despesa de B — testado **também** pelo acesso direto ao identificador, não só pela tela
- [ ] Despesa enviada não pode mais ser editada pelo dono
- [ ] Rejeitada volta a ser editável e mostra o motivo
- [ ] Colaborador não consegue alterar o próprio status para aprovada — recusado pela action **e** pela regra do banco
- [ ] Categoria desativada some do formulário mas continua aparecendo no histórico
- [ ] Typecheck e build verdes; commit feito
