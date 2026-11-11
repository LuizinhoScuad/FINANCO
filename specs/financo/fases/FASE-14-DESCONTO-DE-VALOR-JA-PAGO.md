---
programa: financo
tipo: fase
fase: 14
titulo: Desconto de valor já pago — o pedido negativo que abate do próximo lote
status: implementada
implementada_em: 2026-11-11
depende_de: [12]
herda: ../../00-CONSTITUTION.md
---

# FASE 14 — O que já foi pago a mais volta pelo próximo pagamento

**Objetivo:** dar ao administrador um jeito de acertar, dentro do sistema, um
valor pago a mais ou em duplicidade quando o dinheiro já está na conta da
pessoa — sem estornar nada e sem mexer no que já foi fechado.

Nasceu de um pedido do Luciano, administrador, trazido pelo Luiz (11/11/2026):
*"percebeu lançamentos onde ele já efetuou o pagamento e gostaria que o
sistema permitisse que ele mesmo fizesse um lançamento para outra pessoa,
porém, um lançamento negativo. Isso serviria para deixar no mês corrente o
valor negativo do que já foi pago anteriormente e não há como estornar, pois,
o usuário já recebeu o dinheiro"*.

## Ler apenas

- `src/types/index.ts` · `src/lib/core/money.ts` · `src/lib/core/aprovacao.ts`
- `src/lib/core/repositories/transactions.repo.ts` (`paraLancamento`, `paraGravacao`, `criarLancamento`, `atualizarLancamento`, `excluirLancamento`, `alternarStatus`, `despesasPorCategoria`, `previaDeFechamento`, `fecharLote`)
- `src/actions/transactions.ts` (`Lancamento`, `escopoParaLancar`, `createTransaction`, `verificarDuplicidade`)
- `src/app/(app)/transacoes/TransacoesClient.tsx` (bloco "Lançar para", `handleCreate`, linhas da lista)
- `src/app/(app)/admin/aprovacoes/AprovacoesClient.tsx` · `aprovados/AprovadosClient.tsx` · `relatorios/RelatoriosClient.tsx` (as linhas e `linhas()`)
- `src/lib/core/exports/cliente.ts` (`LinhaPedido`)
- `tests/duplicidade.test.ts` (molde)

## O problema concreto

A Fase 12 deu o estorno: remove o lançamento e desfaz o saldo. Serve quando a
duplicidade é vista **antes** de pagar. Quando é vista **depois**, o estorno
de um item pago registra "valor a compensar" no lote, mas o acerto em si ficava
por fora, na cabeça de quem paga. O Luciano queria o acerto **dentro** do
sistema: um lançamento negativo no mês corrente, que o próximo pagamento da
pessoa já saísse com o abatimento.

Dois princípios guiaram o desenho:

- **Um caminho só (D11).** O desconto nasce no mesmo formulário de
  Transações, atrás do "Lançar para" que já existe. É uma caixa a mais, não
  uma tela.
- **O sinal mora no valor (D22).** Gravar `amount` negativo faz toda soma
  existente — prévia, lote, Aprovados, Relatórios, PDF, XLSX — abater sem que
  ninguém precise lembrar de um `if`. A alternativa (campo de sinal à parte)
  é exatamente o tipo de invariante que se esquece em silêncio (Art. 2).

## Passos

### 1. Specs primeiro
SPEC v4.4 — RF-73 a RF-77, RNF-14, critério de aceite; PLAN v4.4 — D22, fase
na tabela, dois riscos; este arquivo.

### 2. `src/types/index.ts`
`Transaction.desconto: boolean` (ausente = `false`, RNF-14).

### 3. `src/lib/core/desconto.ts` — módulo puro (novo)
`valorDeDesconto(digitado)` (sempre negativo, em reais arredondados),
`ehDesconto`, `rotuloDeDesconto`, `loteFechaComTotal(cents)` (recusa negativo,
aceita zero). Sem `firebase-admin`.

### 4. Repositório
`paraLancamento`/`paraGravacao` leem e gravam `desconto`. `criarLancamento`
força `status: "PENDING"` em desconto e não ajusta saldo. `criarParcelamento`
recusa desconto. `atualizarLancamento`, `excluirLancamento` e `alternarStatus`
recusam desconto — só o estorno o alcança. `despesasPorCategoria` o ignora.
`fecharLote` recusa total negativo (`loteFechaComTotal`).

### 5. Action
`Lancamento` ganha `desconto`; `createTransaction` exige administrador **e**
`paraUid` de outra pessoa, e então impõe: valor negativo, `EXPENSE`,
`reembolso: true`, `status: "PENDING"`, sem parcelas (RF-77).
`verificarDuplicidade` usa o mesmo sinal.

### 6. Telas
Transações: caixa "Desconto de valor já pago" dentro do bloco "Lançar para";
marcada, força reembolso, tipo despesa e desliga parcelar; a lista mostra o
selo "desconto" e o valor negativo. Fila, Aprovados e Relatórios: selo
"desconto · já pago antes" no lugar de "sem comprovante"; PDF e XLSX prefixam
a descrição com "DESCONTO —"; os totais abatem sozinhos.

### 7. Testes
`tests/desconto.test.ts` (novo).

## Riscos

| Risco | Tratamento |
|---|---|
| Valor negativo chegar ao saldo da conta | `PENDING` forçado na criação; alternar, editar e excluir recusados no repositório |
| Negativo entrar no painel pessoal | `despesasPorCategoria` ignora `desconto`; `resumoDoMes` só soma efetivados |
| Lote fechar devendo | `fecharLote` recusa total < 0; zero é aceito |
| Colaborador criar desconto para si ou para outro | A action exige `ADMIN` e `paraUid` de terceiro; forjado, recebe recusa tipada |
| Marcador de duplicidade confundir desconto com o pedido original | O desconto tem sinal oposto, logo centavos diferentes: nunca é gêmeo do pedido que compensa |

## Critérios de aceite

| # | Critério | Como foi verificado |
|---|---|---|
| 1 | `valorDeDesconto` devolve sempre negativo, arredondado; zero e negativo digitados são recusados | ✅ `tests/desconto.test.ts` |
| 2 | Lote com total negativo é recusado; zero e positivo passam | ✅ `tests/desconto.test.ts` |
| 3 | Portões verdes | ✅ estrutura · testes · typecheck · lint · build |
| 4 | Admin cria desconto em nome de colaborador; aparece negativo na fila; aprovado; lote seguinte fecha abatido (37 + 120,40 − 50 = 107,40; 2 pedidos + 1 desconto, todos marcados atendidos) | ✅ `npm run test:simulacao` — chama `createTransaction`, `listarFilaDeAprovacao`, `decidirPedido`, `previaDeFechamento`, `fecharLote` reais sobre um Firestore em memória (17 passos) |
| 5 | Colaborador não cria desconto (para si nem forjando `paraUid`), não edita, não exclui nem alterna; admin não cria para si; "Efetivada" e "Receita" forjados são sobrescritos; saldo da conta fica em zero do começo ao fim | ✅ `npm run test:simulacao` |
| 6 | Desconto maior que os pedidos recusa o fechamento sem marcar nada; o gestor o remove por estorno; desconto já abatido num lote não é estornável | ✅ `npm run test:simulacao` |
| 7 | Desconto fica fora das despesas por categoria e do resumo do mês; o segundo desconto igual no dia é apontado como gêmeo | ✅ `npm run test:simulacao` |

**O que a simulação não prova (Art. 3):** regras de segurança, índices do
Firestore e concorrência real — isso é o `npm run test:integracao` com `.env`
preenchido, e a tela no celular. O `.env` desta máquina continua vazio e não
há Java para o emulador oficial.

## Pendente para a próxima sessão

- Instalar o Java nesta máquina (pedido do Luiz, 11/11/2026) para o emulador
  oficial do Firestore poder rodar; depois, `npm run test:integracao`.
- Conferir na tela, no celular: a caixa "Desconto de valor já pago", o selo
  na fila/Aprovados/Relatórios e a linha "DESCONTO —" no PDF.
