---
programa: financo
tipo: fase
fase: 11
titulo: Dados para reembolso — portão obrigatório, comprovante e painel
status: implementada
implementada_em: 2026-09-03
observacao: >
  Implementada e com os portões de código verdes. NÃO validada contra dados
  reais: o `.env` desta máquina está com as credenciais vazias, e nenhum teste
  de integração ou sonda pôde rodar (Art. 3). Ver "Critérios de aceite".
depende_de: [10]
herda: ../../00-CONSTITUTION.md
---

# FASE 11 — O sistema passa a saber para onde mandar o dinheiro

**Objetivo:** cada pessoa cadastra PIX e conta uma única vez, e esses dados
chegam ao comprovante que o financeiro usa para depositar.

Nasceu de um pedido do Luiz (03/09/2026): *"preciso criar um campo onde o
usuário possa incluir todos seus dados para que eu consiga fazer os depósitos de
ressarcimento de despesas [...] esses dados deverão constar também no relatório
emitido como comprovante de reembolso, pois será através dele que a Regiane do
financeiro da Scuadra Embalagens fará o reembolso"*.

## Ler apenas

- `src/lib/auth.ts` · `src/middleware.ts` · `src/types/index.ts`
- `src/lib/core/repositories/users.repo.ts`
- `src/lib/core/repositories/transactions.repo.ts` (lotes, a partir de `paraLote`)
- `src/actions/reembolsos.ts` · `src/actions/accounts.ts` (molde de action)
- `src/lib/guardrails/validate.ts` · `src/lib/guardrails/result.ts`
- `src/lib/core/aprovacao.ts` (molde de módulo puro)
- `src/lib/core/exports/cliente.ts`
- `src/app/aguardando/page.tsx` · `src/app/(app)/layout.tsx`
- `src/app/(app)/admin/usuarios/UsuariosClient.tsx`
- `src/app/(app)/aprovados/AprovadosClient.tsx` · `src/app/(app)/admin/aprovacoes/AprovacoesClient.tsx`
- `src/components/layout/Sidebar.tsx` · `src/components/ui/Aviso.tsx`
- `tests/aprovacao.test.ts` · `tests/validate.test.ts` · `tests/integracao/sondas/fumaca.mjs`

## O problema concreto

O ciclo do reembolso terminava sem endereço. O gestor aprova, fecha o lote e
baixa o **Comprovante de reembolso** — que traz nome, período, itens e total.
Só que quem paga não é o sistema: é uma pessoa do financeiro, por fora, e ela
precisa de chave PIX, CPF e, quando o PIX falha, banco/agência/conta.

Esse dado não existia em lugar nenhum. `users/{uid}` guardava apenas
`name`, `email`, `role` e `status`; não havia tela de perfil, nem qualquer
caminho pelo qual a pessoa pudesse informar como quer receber. Na prática, cada
pagamento exigia perguntar de novo, por fora do sistema — e um dígito
transcrito errado no WhatsApp é dinheiro no lugar errado.

Duas consequências guiam o desenho:

1. **Sem os dados, ninguém recebe.** Por isso o cadastro é um portão, não um
   lembrete: quem está ativo e não preencheu não entra até preencher.
2. **O comprovante é o documento do pagamento.** Ele precisa carregar os dados
   **como estavam quando o lote foi fechado** — não o que a pessoa editou
   depois. Daí a cópia no lote (D16), e não uma busca ao vivo.

## Passos

### 1. Specs primeiro
SPEC v4.1 com a seção "Dados para reembolso" (RF-57 a RF-63) e RNF-12; PLAN
v4.1 com D16, D17, a fase na tabela e o risco das sondas; este arquivo.

### 2. `src/types/index.ts`
`TipoChavePix`, `TipoConta` e `DadosBancarios` (titular, cpf, pixTipo, pixChave,
banco, agencia, conta, tipoConta, atualizadoEm). `UserProfile` e `PaymentBatch`
ganham `dadosBancarios: DadosBancarios | null`.

### 3. `src/lib/core/dados-bancarios.ts` — módulo puro (novo)
`validarCPF`, `validarCNPJ`, `normalizarChavePix` (por tipo), `lerDadosBancarios`
(parser tolerante, ausência → `null`), `formatarCPF`, `formatarChavePix`,
`descreverDadosBancarios` (as linhas que vão ao PDF e ao painel), `TIPOS_CHAVE_PIX`,
`TIPOS_CONTA`. Sem `firebase-admin` — é o que permite testar no portão rápido.

### 4. `src/lib/guardrails/validate.ts`
Schema `DadosBancariosEntrada`: CPF com dígito conferido, chave válida para o
tipo escolhido, e a regra **tudo ou nada** de banco/agência/conta (com
`tipoConta` obrigatório quando há conta). Devolve o objeto já normalizado.

### 5. `src/lib/core/repositories/users.repo.ts`
`paraPerfil` lê o mapa com `lerDadosBancarios`; novo `gravarDadosBancarios`
grava o mapa **completo, com `null` explícito** (`merge` funde campo a campo:
sem o `null`, apagar um dado não o apagaria).

### 6. `src/lib/auth.ts` — o portão (D17)
`getLivePerfil(uid)` devolve status **e** presença dos dados numa leitura só;
`getLiveStatus` vira um envelope dele. `requireActiveUser({ exigirDadosBancarios })`
redireciona a `/dados-para-reembolso` quando ativo e sem dados. Só a página do
portão e a action de salvar pedem a dispensa.

### 7. `src/middleware.ts`
`/dados-para-reembolso` e `/perfil` entram no matcher.

### 8. `src/actions/dados-bancarios.ts` (novo)
`salvarDadosBancarios(formData)` no molde de `accounts.ts`: dispensa do portão,
Zod, `gravarDadosBancarios`, `revalidatePath`, `Result`. O `uid` vem da sessão,
nunca do formulário (Art. 5).

### 9. Lote e comprovante
`fecharLote` grava a cópia dos dados no mesmo `writeBatch` que cria o lote e
carimba os pedidos (Art. 2). `getLotes` completa lote antigo sem cópia com o
cadastro atual. `getPreviaDeLote` passa a dizer se a pessoa não tem dados — a
prévia avisa, não bloqueia. O comprovante em PDF ganha o bloco "Dados para
depósito", e `montarPDF` passa a quebrar página quando o resumo não cabe.

### 10. Telas
`FormularioDadosBancarios` (um componente, dois usos); `/dados-para-reembolso`
(portão, fora de `(app)`); `/perfil` ("Meus dados", dentro do app);
Admin › Usuários com os dados recolhidos e o marcador de quem falta; item na
lateral e link no Dashboard (o caminho do celular).

### 11. Testes
`tests/dados-bancarios.test.ts` (CPF, CNPJ, chave por tipo, leitura do mapa,
descrição para o PDF) e o bloco novo em `tests/validate.test.ts`. A sonda
`fumaca.mjs` passa a conferir o portão **e** a semear os dados do usuário
descartável — sem isso ela quebraria, porque o harness é ativo e não tinha dados.

## Riscos

| Risco | Tratamento |
|---|---|
| Sondas que entram com a conta real do administrador passam a bater no portão | Pré-condição: o administrador preenche o próprio cadastro antes de rodá-las |
| `merge` não apaga chave omitida de mapa aninhado | Gravar sempre o mapa completo, com `null` explícito |
| Resumo do PDF estourar a página com o bloco novo | Quebra de página em `montarPDF` |
| Dado de terceiro vazar para colaborador (Art. 4) | O perfil completo só chega ao cliente sob `requireAdmin`; `getEquipeAtiva` projeta apenas uid e nome; o pedido não carrega dados bancários |
| Pessoa editar os dados depois de um lote fechado | A cópia preserva o que foi enviado; o lote seguinte leva os novos |
| Dados não entram no backup | Verdadeiro e deliberado: o backup cobre só as subcoleções, e a restauração não toca no perfil — os dados sobrevivem intactos. Registrado como pendência |

## Critérios de aceite

| # | Critério | Como foi verificado |
|---|---|---|
| 1 | CPF com dígito errado, chave PIX que não combina com o tipo e conta bancária pela metade são recusados, apontando o campo | ✅ `tests/dados-bancarios.test.ts` (19 testes) · `tests/validate.test.ts` (bloco novo, 7 testes) |
| 2 | Campo ausente é lido como "sem dados", sem migração; mapa incompleto ou corrompido também | ✅ `tests/dados-bancarios.test.ts` — `lerDadosBancarios` |
| 3 | O mesmo telefone digitado de quatro jeitos vira uma chave só; número de outro país é recusado | ✅ `tests/dados-bancarios.test.ts`. O teste **encontrou um defeito real**: `+1 415 555 0100` tem os mesmos 11 dígitos de um celular brasileiro e entrava como se fosse um. Corrigido lendo o `+` da entrada |
| 4 | O comprovante mostra as mesmas linhas que o painel do administrador | ✅ fonte única `descreverDadosBancarios`, coberta por teste |
| 5 | As rotas novas montam | ✅ `npm run build` — `/dados-para-reembolso` e `/perfil` na saída |
| 6 | Portões verdes | ✅ estrutura íntegra · 84 testes · typecheck · lint (0 erros) · build |
| 7 | Pessoa ativa sem dados não passa do portão, nem digitando a URL | ⚠️ **NÃO VERIFICADO** — exige servidor autenticado (Art. 3) |
| 8 | Comprovante e fallback de lote antigo com dados reais | ⚠️ **NÃO VERIFICADO** — exige Firestore |
| 9 | Admin › Usuários mostra os dados e marca quem falta | ⚠️ **NÃO VERIFICADO** — exige Firestore |
| 10 | Colaborador não vê dado de colega | ⚠️ **NÃO VERIFICADO** — a sonda `test:fumaca` já traz as checagens do portão, mas não pôde rodar |

**Por que 7 a 10 não foram verificados.** O `.env` desta máquina existe, mas
`NEXT_PUBLIC_FIREBASE_API_KEY`, `FIREBASE_CLIENT_EMAIL` e `FIREBASE_PRIVATE_KEY`
estão vazios: `npm run test:integracao` para em "Could not load the default
credentials", e as sondas autenticam contra o Firebase real. A verificação é
declarada como não feita, não presumida (Art. 3).

## Pendente para a próxima sessão

- **Com credenciais**, rodar nesta ordem: `npm run test:integracao` (o ciclo já
  confere a cópia dos dados no lote), `npm run test:fumaca` (traz as checagens
  novas do portão) e `npm run test:responsivo` (agora inclui `/perfil`).
  **Pré-condição:** preencher os próprios dados antes — as sondas entram com a
  conta real do administrador e batem no portão como todo mundo.
- Conferir na tela os critérios 7 a 10.

- Incluir os dados no arquivo de backup (hoje ficam de fora — decisão de escopo,
  não esquecimento).
- Avaliar se o administrador deve poder corrigir o dado de outra pessoa quando
  ela erra e o pagamento falha.
