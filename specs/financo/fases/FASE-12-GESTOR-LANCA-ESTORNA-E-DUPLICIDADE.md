---
programa: financo
tipo: fase
fase: 12
titulo: O gestor lança em nome de alguém, estorna com motivo, e o sistema alerta duplicidade
status: implementada
implementada_em: 2026-11-03
depende_de: [11]
herda: ../../00-CONSTITUTION.md
observacao: >
  Implementada com os portões de código verdes (100 testes, typecheck, lint,
  build, estrutura). NÃO validada na tela: o `.env` desta máquina (Scuadra)
  tem NEXT_PUBLIC_FIREBASE_API_KEY e FIREBASE_PRIVATE_KEY vazios — o login
  local falha com auth/invalid-api-key antes de qualquer tela (Art. 3).
---

# FASE 12 — O que a apuração descobre, o gestor resolve na hora

**Objetivo:** dar ao administrador os dois gestos que faltavam na apuração —
lançar o gasto que o operador esqueceu e estornar o que foi lançado em dobro —
e fazer o sistema avisar a duplicidade antes que ela chegue ao pagamento.

Nasceu de um pedido do Luiz (03/11/2026): *"os administradores terem opção de
fazer lançamentos para algum usuário específico [...] e também a opção de
excluir algum lançamento feito por outro usuário. Há casos que foram feitos
lançamentos em duplicidade e no momento de pagar, constatamos, isso requer o
estorno [...] alertar o usuário que eventual lançamento já foi feito, seja pelo
mesmo valor, local, data"*.

Decisões tomadas com ele na mesma sessão: o estorno vale **inclusive para o
já pago**; o lançamento feito pelo gestor **nasce aguardando aprovação** como
qualquer outro; duplicidade é **mesma pessoa + mesmo valor + mesma data**.

## Ler apenas

- `src/types/index.ts` · `src/lib/auth.ts` · `src/lib/core/firestore.ts`
- `src/lib/core/aprovacao.ts` · `src/lib/core/datas.ts` · `src/lib/core/money.ts`
- `src/lib/core/repositories/transactions.repo.ts` · `src/lib/core/repositories/users.repo.ts`
- `src/actions/transactions.ts` · `src/actions/reembolsos.ts`
- `src/lib/guardrails/transactions.ts` · `src/lib/guardrails/result.ts`
- `src/lib/core/exports/cliente.ts` (comprovante de lote)
- `src/app/(app)/transacoes/page.tsx` · `TransacoesClient.tsx`
- `src/app/(app)/admin/aprovacoes/AprovacoesClient.tsx`
- `src/app/(app)/aprovados/page.tsx` · `AprovadosClient.tsx`
- `src/app/(app)/relatorios/RelatoriosClient.tsx` (lista de lotes)
- `tests/aprovacao.test.ts` · `tests/datas.test.ts` (molde)

## O problema concreto

O ciclo do reembolso tem um ponto de verdade: a apuração, quando o gestor soma
o que vai pagar. É ali que aparecem os dois defeitos de registro:

1. **O gasto que ninguém lançou.** O operador esqueceu. O gestor sabe do gasto,
   tem o comprovante na mão, mas a única porta de lançamento (Transações)
   escreve na subcoleção de quem está logado — ele só conseguiria lançar para
   si. Restava pedir à pessoa que voltasse ao app.
2. **O gasto lançado duas vezes.** Dois pedidos iguais, um ao lado do outro,
   aprovados em bloco. A regra RF-43 trancava o aprovado para **todo mundo**,
   gestor incluído — correto para proteger lastro de pagamento, mas sem válvula
   para o caso de erro. E se o par só fosse notado depois do lote fechado, não
   havia nada a fazer além de anotar por fora.

Dois princípios guiaram o desenho:

- **Uma porta só continua valendo (D11).** Lançar em nome de alguém é um
  seletor dentro do formulário existente, não uma tela nova. Quem decide de
  quem é a subcoleção é o servidor, pelo papel.
- **Estornar não reescreve o passado (Art. 3).** O lançamento sai, mas fica a
  cópia; o lote pago mantém o total que de fato saiu do caixa e ganha, ao
  lado, o valor estornado a compensar.

## Passos

### 1. Specs primeiro
SPEC v4.2 — RF-64 a RF-71, RNF-13, exceções em RF-38 e RF-43, critérios de
aceite; PLAN v4.2 — D18, D19, D20, fase na tabela, dois riscos; este arquivo.

### 2. `src/types/index.ts`
`Transaction` ganha `lancadoPor` e `lancadoPorNome` (nulos = o próprio dono).
`PaymentBatch` ganha `estornadoCents` e `estornos: EstornoNoLote[]`. Novo
`Estorno` (a cópia em `estornos/{id}`), com o documento original inteiro em
`original`.

### 3. `src/lib/core/duplicidade.ts` — módulo puro (novo)
`saoGemeos(a, b)` (mesmo dia UTC, mesmos centavos), `semelhantes(candidato,
lista)` e `marcarDuplicidades(lista)` (devolve o conjunto de ids que têm gêmeo
**na mesma pessoa**). Sem `firebase-admin`.

### 4. `src/lib/core/aprovacao.ts`
`podeEstornar` (sempre, pelo administrador) e `estornoAposPagamento` (só
RESSARCIDA — é o que exige mexer no lote). Fonte única da regra.

### 5. `src/lib/core/firestore.ts`
`escopoProntoDe(uid)`: o escopo semeado de **outra** pessoa. Só quem já
confirmou o papel chama isto.

### 6. `src/lib/core/repositories/transactions.repo.ts`
`criarLancamento` e `criarParcelamento` passam a aceitar o escopo (padrão: o
da sessão) e gravam `lancadoPor`. `listarSemelhantes(esc, valor, dia)` consulta
só o dia. `estornarLancamento(dono, id, ator, motivo)` numa transação:
lê lançamento, conta e (se pago) lote; grava a cópia, desfaz o saldo, atualiza
o lote (`expenseCount − 1`, `estornadoCents +`, `estornos` ∪) e apaga o
original. `listarEstornos`. `paraLote` lê os campos novos com padrão seguro.

### 7. Actions
`transactions.ts`: `createTransaction` lê `paraUid`; se for outra pessoa,
exige `ADMIN` e devolve recusa tipada se não for; `verificarDuplicidade(fd)`
com a mesma regra de escopo; `getContasECategoriasDe(uid)` para o seletor.
`estornos.ts` (novo): `estornarLancamento(dono, id, motivo)` e `getEstornos()`,
ambos sob `requireAdmin`.

### 8. Telas
Transações: seletor "Lançar para" (só admin), troca de contas/categorias ao
escolher a pessoa, aviso de duplicidade antes de salvar com "salvar mesmo
assim", selo "lançado por". Aprovações: botão Estornar com motivo e marcador de
gêmeo. Aprovados: Estornar em A pagar e em Pagos (com aviso de compensação),
marcador de gêmeo, lista de estornos. Relatórios: lote mostra o estornado.
Comprovante em PDF: bloco "Estornos após o pagamento" e "Valor a compensar".

### 9. Testes
`tests/duplicidade.test.ts` (novo) e o bloco de estorno em
`tests/aprovacao.test.ts`.

## Riscos

| Risco | Tratamento |
|---|---|
| Colaborador forjar `paraUid` | O escopo só troca após confirmar `role === "ADMIN"`; do contrário, recusa tipada |
| Conta/categoria do administrador parar na subcoleção de outro | O formulário recarrega contas e categorias **da pessoa escolhida**; o servidor grava no escopo dela, então uma referência estranha só poderia vir de forjamento — e a conta é lida dentro da transação, que falha se não existir |
| Estorno de pago deixar lote e comprovante divergentes | O estornado fica ao lado do total, nunca no lugar; comprovante lê os dois |
| Estorno repetido (duplo clique) | A segunda tentativa não encontra o documento e falha com "Lançamento não encontrado" — nada é escrito |
| Duplicidade alertar demais | Critério estreito (pessoa + centavos + dia). O aviso nunca bloqueia |
| Saldo da conta de quem foi estornado | Desfeito na mesma transação, como `excluirLancamento` já faz; conta removida é tolerada |

## Critérios de aceite

| # | Critério | Como foi verificado |
|---|---|---|
| 1 | Dois lançamentos com mesmo valor e mesma data são gêmeos; dia diferente ou centavo diferente, não; pessoas diferentes nunca | ✅ `tests/duplicidade.test.ts` |
| 2 | Estorno é permitido em todo estado; só o pago exige mexer no lote | ✅ `tests/aprovacao.test.ts` |
| 3 | Portões verdes | ✅ estrutura íntegra · 100 testes · typecheck · lint (0 erros) · build com todas as rotas |
| 4 | Admin lança em nome de colaborador com a conta e a categoria dele; o selo "lançado por" aparece; colaborador forjando o campo é recusado | ⚠️ **NÃO VERIFICADO** — exige Firestore e duas contas |
| 5 | Estorno de pedido pago: lançamento some, saldo volta, cópia na lista, comprovante com valor a compensar e total pago intacto | ⚠️ **NÃO VERIFICADO** — exige Firestore |
| 6 | Aviso de duplicidade ao salvar e marcador na fila | ⚠️ **NÃO VERIFICADO** na tela — exige Firestore |

## Pendente para a próxima sessão

- Verificar 4 a 6 com credenciais e duas contas (uma de colaborador).
- Decidir se a pessoa estornada deve ser avisada dentro do app (hoje o gestor
  avisa por fora; a cópia existe para auditoria).
- Script de reversão de estorno (`dados/reverter-estorno.mjs`) se a necessidade
  aparecer — a cópia em `estornos/` já guarda o documento inteiro.
