---
programa: financo
tipo: fase
fase: 4
titulo: Integridade de dados — operações atômicas e camada tipada
status: pendente
depende_de: [0]
sessoes_previstas: 2
herda: ../../00-CONSTITUTION.md
---

# FASE 4 — Integridade de dados

**Objetivo:** eliminar a corrupção silenciosa de saldo e a camada de dados sem
tipo. É a fase mais delicada do plano — mexe no que já está em produção.

> ⚠️ **Antes de começar:** baixar um backup completo dos dados pelo `/api/export`
> e guardar fora do repositório. Art. 1 e Art. 10.

## O problema concreto

`actions/transactions.ts` mantém o saldo da conta com escritas independentes:

```
1. reverte o saldo antigo
2. grava a transação
3. aplica o saldo novo
```

Falha entre 1 e 3 — timeout, queda, aba fechada — deixa o saldo permanentemente
errado, sem log e sem aviso. O mesmo padrão está em criar, excluir e alternar
status. Não existe uma única transação atômica no projeto. Dois cliques rápidos
no mesmo botão contam o valor duas vezes.

Junto disso, `lib/db.ts` é exportado como `any`, imita a interface do Prisma e
carrega **coleções inteiras** para filtrar em memória.

## Ler apenas

- `lib/db.ts`
- `actions/transactions.ts`
- `actions/accounts.ts`
- `actions/categories.ts`
- `actions/budgets.ts`
- `types/index.ts`
- `firestore.indexes.json`

## Passos

### Sessão A — fundação e transações

1. **`lib/guardrails/result.ts`** — `Result<T> = { ok: true; data: T } | { ok: false; error: string }`.
   Toda action passa a devolver isso; erro deixa de ser engolido (Art. 6).

2. **`lib/guardrails/transactions.ts`** — auxiliares sobre `runTransaction` e
   `writeBatch`, para que nenhuma action monte isso na mão.

3. **`lib/core/money.ts`** — soma, subtração e formatação. Base para os centavos
   do módulo de ressarcimento (D10).

4. **`lib/core/repositories/transactions.repo.ts`** e `accounts.repo.ts` —
   tipados, com `where`, `orderBy` e `limit` **nativos** (os índices em
   `firestore.indexes.json` já existem e hoje não são usados por ninguém).

5. **Refatorar `actions/transactions.ts`:**
   - criar, atualizar, excluir e alternar status usando `runTransaction` — ler o
     saldo e gravar transação e saldo novo **na mesma operação** (Art. 2)
   - parcelamento com `writeBatch` e `installmentGroupId` determinístico, para
     que reenviar o formulário não duplique as parcelas
   - retornar `Result<T>`

### Sessão B — demais entidades e remoção do shim

6. **`categories.repo.ts` e `budgets.repo.ts`**; migrar `actions/categories.ts`
   e `actions/budgets.ts`. `budget.upsert` passa a ser atômico (hoje lê tudo,
   procura e decide — duas abas criam orçamento duplicado).

7. **Semeadura inicial transacional** — hoje um cache em memória tenta evitar
   duplicação, mas cada instância do servidor tem o seu; em partida simultânea
   as categorias padrão podem ser criadas duas vezes. Trocar por sinalizador
   `seeded` no documento do usuário, gravado na mesma transação.

8. **Excluir `lib/db.ts`.** A fase só termina quando `grep -r "lib/db"` no
   código não retorna nada.

## Riscos

| Risco | Mitigação |
|---|---|
| Refatoração corromper dado em produção | O formato dos documentos **não muda** — só o caminho de acesso. Migrar uma action por vez, com build verde e teste manual entre cada |
| Perder funcionalidade sutil do shim | Antes de excluir, listar tudo que `lib/db.ts` expõe e confirmar cobertura pelos repositórios |
| Sessão estourar o contexto | Dividida em A e B; se A já ficar longa, fechar com commit e abrir B em sessão nova |

## Critérios de aceite

- [ ] `grep -r "lib/db"` no código não retorna nada; o arquivo foi excluído
- [ ] Nenhum `any` nas camadas `core` e `guardrails`
- [ ] Duplo clique em salvar não duplica lançamento nem corrompe saldo — **testado de fato**
- [ ] Criar, editar, excluir e alternar status refletem no saldo corretamente
- [ ] Parcelamento em 3× cria exatamente 3 lançamentos; reenviar o formulário não gera 6
- [ ] Nenhuma consulta carrega coleção inteira (RNF-03)
- [ ] Dados anteriores do Luiz intactos, conferidos na tela
- [ ] Typecheck e build verdes; commit feito
