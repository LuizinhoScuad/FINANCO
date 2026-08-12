---
programa: financo
tipo: fase
fase: 10
titulo: Dia de calendário, tela de Aprovados e filtros de relatório
status: concluida
concluida_em: 2026-08-12
depende_de: [7]
herda: ../../00-CONSTITUTION.md
---

# FASE 10 — O dia que se digita é o dia que se vê

**Objetivo:** parar de perder lançamento no relatório, dar uma tela própria ao
dinheiro aprovado e transformar o filtro de Relatórios em algo que responde
perguntas em vez de exigir duas datas digitadas.

Nasceu de um relato do Luiz (12/08/2026): *"no relatório aprovados a pagar, os
valores finais estão ignorando um lançamento de R$ 37,00"* e *"os filtros não
estão funcionando corretamente para cada usuário diferente"*.

## Ler apenas

- `src/lib/core/datas.ts`
- `src/lib/utils.ts`
- `src/actions/reembolsos.ts`
- `src/app/(app)/relatorios/RelatoriosClient.tsx`
- `src/app/(app)/aprovados/`
- `tests/datas.test.ts`

## O diagnóstico

A data de um lançamento não é um instante, é um dia do calendário. Ela era
gravada com `new Date("2026-08-01")` — que o JavaScript lê como **meia-noite em
UTC**. Daí em diante, três leituras diferentes da mesma marca:

| Onde | Como lia | 01/08 virava |
|---|---|---|
| Servidor (Cloud Run, UTC) | `Intl` no fuso do processo | 01/08 |
| Navegador no Brasil (UTC-3) | `Intl` no fuso do navegador | **31/07** |
| Filtro de período | `new Date("2026-08-01T00:00:00")` no fuso de quem executa | 01/08 no servidor, 01/08 **03:00Z** na máquina local |

Consequência prática: quem filtrava pelo que via na tela pedia julho para um
lançamento que o banco guardou em agosto — o lançamento sumia da lista e, com
ele, o valor sumia dos totais. Um lançamento de R$ 37,00 na virada do mês
desaparecia da conta sem deixar rastro. E como a fronteira dependia do fuso de
quem executava, o mesmo filtro dava resultados diferentes no servidor e na
máquina de desenvolvimento — a impressão de "filtro que não funciona".

## O que foi feito

### 1. `src/lib/core/datas.ts` — fonte única da regra de data

- dia de calendário é gravado ao **meio-dia UTC** (11 horas de folga para cada
  lado: nenhum fuso de UTC-11 a UTC+11 muda o dia);
- fronteiras de período (`inicioDoDia`, `fimDoDia`, `intervaloDoMes`) são
  **sempre UTC** — independem de onde o código roda;
- `formatDate` exibe dia de calendário **em UTC**; `formatDateTime` (novo) é
  para carimbo de acontecimento (pago em, aprovado em), onde o instante importa
  e o fuso de quem lê é o certo;
- `hojeNoCampo()` usa o relógio local: `toISOString()` devolvia o dia seguinte
  para quem lançasse um gasto depois das 21h no Brasil.

**Sem migração de dados** (Art. 10): o histórico gravado à meia-noite UTC cai no
mesmo dia quando lido em UTC e fica dentro das novas fronteiras. Provado em
`tests/datas.test.ts`.

### 2. `/aprovados` — tela e item de menu

A pergunta "quanto a empresa deve hoje" dependia de acertar um filtro. Agora é
uma tela: total a pagar, quebra por pessoa com subtotal, dias de espera do mais
antigo, aviso de comprovante faltando e fechamento de pagamento com prévia
(Art. 1) e período deduzido dos próprios pedidos. O alcance é decidido no
servidor pelo papel (Art. 5). Entra na lateral e no menu do celular, com
contador azul.

### 3. Relatórios — filtro que responde perguntas

- período com atalhos (tudo, este mês, mês passado, últimos 30/90 dias, este
  ano) e é o **único** filtro que vai ao servidor;
- situação em marcadores **múltiplos**, mais o atalho "só o que falta receber";
- pessoa, busca livre, comprovante e ordenação filtram **na tela**, na hora —
  mesma resposta para qualquer pessoa, sem ida ao banco;
- totais **por situação** (aguardando · aprovados a pagar · já pagos ·
  rejeitados) em vez de um balde "a receber" que misturava rejeitado com
  aprovado;
- a tela diz, em texto, **quantos pedidos e quanto em dinheiro o filtro está
  escondendo**. É a garantia de que nenhum valor some em silêncio de novo;
- a exportação leva exatamente o que está na tela.

## Critérios de aceite

| # | Critério | Como foi verificado |
|---|---|---|
| 1 | O dia digitado é o dia exibido, no servidor e no navegador | `tests/datas.test.ts` — 15 testes |
| 2 | Lançamento do primeiro e do último dia entra no período | `tests/datas.test.ts` |
| 3 | Histórico à meia-noite UTC continua dentro do período, sem migração | `tests/datas.test.ts` |
| 4 | `/aprovados` monta e respeita o papel | `npm run build` · leitura de `page.tsx` |
| 5 | Portões verdes | estrutura · 58 testes · typecheck · lint · build |
| 6 | Comportamento com dados reais | **NÃO VERIFICADO** — sem `.env` nesta sessão, nada foi rodado contra o Firestore (Art. 3) |

## Pendente para a próxima sessão

- Rodar `npm run test:fumaca`, `npm run test:responsivo` e `npm run scan` com
  credenciais, e conferir na tela que o lançamento de R$ 37,00 passou a somar.
- O menu do celular do gestor foi para seis itens; a sonda de responsivo é quem
  diz se o rótulo cabe em 375px.
