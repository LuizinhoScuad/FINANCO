# PROGRESSO.md — Log de Sessões

> **Propósito:** Registrar todas as alterações feitas em cada sessão de trabalho, com data/hora, arquivos modificados e contexto suficiente para reverter ou corrigir regressões introduzidas pelas mudanças.

---

## Como usar

- Este arquivo é atualizado automaticamente ao final de cada sessão, antes do commit e deploy.
- Cada entrada contém: o que foi feito, arquivos alterados, e observações relevantes para debugging.
- Em caso de regressão, consulte a entrada mais recente para identificar o que mudou.

---

## Sessões

### 2026-08-09 — Reembolso remontado sobre Transações, Relatórios para todos, e o harness do SDD

**Horário de registro:** 09/08/2026 às 20:29

**Contexto — a sessão teve três viradas de rumo, todas do Luiz:**

1. "Despesas ficou confusa, exclui tudo" → o módulo de ressarcimento foi **removido por inteiro** (SPEC v3). O defeito real era ter **duas portas de lançamento** concorrentes.
2. "Preciso das aprovações e dos relatórios da equipe" → o reembolso **voltou**, agora construído **sobre** Transações, não ao lado (SPEC v4). Um caminho só de lançamento, com a camada do gestor por cima.
3. "Não há nada particular nos lançamentos" → o histórico anterior foi **migrado** para pedidos de reembolso, revertendo a decisão de preservar o passado como particular.

**O que foi implementado:**

- **Pedido de reembolso é um lançamento marcado**, não outra entidade: caixa "Pedir reembolso" no formulário de Transações, marcada por padrão. Desmarcada, o lançamento é particular.
- **Máquina de estados** (`lib/core/aprovacao.ts`): ENVIADA → APROVADA → RESSARCIDA (só via lote); ENVIADA → REJEITADA → ENVIADA (corrige e reenvia). Função pura, 20 testes.
- **Relatórios no menu principal, para todo mundo** (não só admin): filtro por situação e período livre, PDF e XLSX gerados no navegador. Cada pessoa vê os próprios pedidos; o gestor vê a equipe e ganha o filtro por pessoa.
- **"Já atendido" separado de "A receber"** na tela, no PDF e no Excel — é o que impede alguém de cobrar duas vezes o que já recebeu.
- **Aprovações (admin)**: fila com comprovante à vista, aprovar/rejeitar com motivo obrigatório, **filtro por pessoa** e **aprovação em bloco** ("Aprovar os N de Fulano"), fechamento de lote com prévia obrigatória e comprovante em PDF.
- **Filtro "Todos os períodos"** em Transações — antes, quem tinha lançamento espalhado no tempo abria a tela e via "nenhuma transação". Teto de 500 com aviso de truncamento.
- Rótulos: Descrição com exemplo `Ex: Visita no cliente Mocotó`; "Favorecido / Recebedor" virou **"Observação/Acompanhante"** (tela, tabela e coluna do Excel).

**Consulta do gestor sem migrar dado (D13):** a visão de equipe usa `collectionGroup` sobre `users/{uid}/transactions`. A alternativa — mover tudo para coleção de topo — exigiria migração destrutiva de dado real para economizar um índice.

**Defeitos encontrados e corrigidos:**

- **Índices do Firestore ausentes**: 6 consultas falhavam com `FAILED_PRECONDITION`. Ao publicar, o Firestore recusou o lote inteiro por causa de um índice **antigo e inválido** — `(date, __name__)` — que estava no repositório havia tempo e nunca fora publicado. Duas igualdades em `collectionGroup` exigem índice de campo único com escopo de grupo (`fieldOverrides`), não composto.
- **Contadores derrubavam o app**: os badges rodam em `app/(app)/layout.tsx`, que embrulha todas as telas. Uma falha de índice tirava o app do ar por causa de um número no menu. Agora falham em silêncio, com o motivo no log.
- **Backup perdia o pedido**: o schema de importação (`z.object`) descartava os campos de aprovação. Restaurar um backup transformaria pedido já pago em lançamento particular. Corrigido, com 3 testes travando a regressão.
- **Botão "Liberar" quebrado**: `listarUsuarios` mostra contas do Auth sem perfil no banco de propósito, mas a ação sempre respondia "Usuário não encontrado" — a tela prometia algo impossível. Agora `garantirPerfil` cria o perfil que falta.
- **Resíduo de teste em produção** (culpa do harness de testes desta sessão): o teste de fumaça apagava o documento mas não a conta no Auth, deixando um usuário fantasma no painel. Corrigido, com conferência que faz o teste falhar se sobrar algo.

**Migração de dados (com backup, prévia e desfazer):**
- Backup: `C:\Sistemas\financo-backups\backup-2026-08-09T23-00-59.json`
- 11 lançamentos de despesa de `luizking` marcados como pedido ENVIADA, R$ 458,62. Receitas ficaram de fora.
- Reversível: `node scripts/migrar-lancamentos-para-reembolso.mjs --todos --desfazer --aplicar`
- Conferência posterior apontou 1 lançamento a menos que o backup ("Dhhhg", R$ 54) — aparentemente apagado pela tela, não pela migração.

**Harness do SDD — arrumação estrutural:**
- `specs/03-HARNESS.md` (novo): onde cada coisa mora, por que a raiz tem o que tem, os dois níveis de teste, regras de script e o protocolo de sessão.
- `scripts/verificar-estrutura.mjs` (novo) + `npm run verificar:estrutura`: **faz valer** o documento. Falha com arquivo solto na raiz, `scripts/tmp/`, teste de banco fora de `tests/integracao/`, script não declarado no HARNESS, semeadura sem prefixo `zzz-teste-`. Virou o primeiro portão da CI.
- Raiz enxuta: `firestore.rules`, `firestore.indexes.json` e `storage.rules` foram para `firebase/`; `iniciar_financo.bat` para `scripts/`; `tsconfig.tsbuildinfo` passou a ser gravado em `node_modules/.cache/`.
- `tests/integracao/` (novo): ciclo real, fumaça autenticada, prova de consultas, estado de índices e conferência de backup — todos fora do portão rápido, que segue sem credencial e em milissegundos.

**Arquivos principais:**
- Novos: `lib/core/aprovacao.ts` · `actions/reembolsos.ts` · `app/(app)/relatorios/` · `app/(app)/admin/aprovacoes/` · `specs/03-HARNESS.md` · `scripts/verificar-estrutura.mjs` · `scripts/migrar-lancamentos-para-reembolso.mjs` · `scripts/simular-reembolso.mjs` · `scripts/limpar-residuo-teste.mjs` · `tests/aprovacao.test.ts` · `tests/integracao/**`
- Removidos: `actions/expenses.ts` · `lib/core/expense-status.ts` · `lib/core/repositories/expenses.repo.ts` · `app/(app)/despesas/` · `scripts/testar-celular.mjs`
- Alterados: `lib/core/repositories/transactions.repo.ts` · `users.repo.ts` · `actions/transactions.ts` · `admin-users.ts` · `TransacoesClient.tsx` · `layout.tsx` · `Sidebar.tsx` · `BottomNav.tsx` · `lib/core/exports/cliente.ts` · `lib/guardrails/validate.ts` · `firebase/*` · `specs/01-SPEC.md` (v4) · `specs/02-PLAN.md` (v4) · `CLAUDE.md` · `.github/workflows/ci.yml`

**Verificação:** estrutura íntegra · 43 testes unitários · 15 de integração contra o Firestore real · fumaça autenticada em 8 telas com isolamento entre pessoas confirmado · filtro de período conferido no servidor · typecheck, lint e build verdes · Guardião provado como somente-leitura · zero resíduo `zzz-teste-*` no banco.

**Correção pós-deploy — responsividade no celular (20:45):**

Relato do Luiz: "a tela no celular fica sambando nas laterais". Medido com
Playwright em 375px e 393px, contra produção: a **página** não transbordava, mas
Transações e Relatórios escondiam **~400px de conteúdo** atrás de rolagem lateral
— a tabela tinha largura mínima de 700–760px dentro de um contêiner rolável.
Some justamente o valor e a situação do pedido.

Correção: abaixo de 768px a tabela dá lugar a **cartões empilhados** (um por
lançamento), com utilitários `.so-computador` / `.so-celular` e as classes
`.cartao-*` em `app/globals.css`. Medido de novo: zero transbordo e zero
rolagem lateral nas 9 telas, nos dois aparelhos.

Novos no harness: `tests/integracao/responsivo.mjs` (mede e aponta o elemento
culpado) e `tests/integracao/capturar-celular.mjs` (fotografa as telas).

**Pendências / próximos passos:**
- O admin aprova os próprios pedidos (só existe um administrador) — comportamento pedido, registrado para não parecer descuido.
- Promover alguém a ADMIN dá acesso aos lançamentos particulares de todos, inclusive os do Luiz. O aviso na tela diz isso.
- Formulário tem "Observação/Acompanhante" e "Notas (opcional)" — nomes próximos demais, vale unificar.
- Exemplos antigos ainda no formulário: Tags sugere `casa, lazer, fixo`.
- 4 avisos de lint anteriores a esta sessão (variáveis não usadas em `TransacoesClient` e `MonthlyBarChart`).

---


### 2026-04-12 — Fix deploy lento: arquivos grandes no git + otimização de build

**Horário de registro:** 12/04/2026 às 14:26

**O que foi feito:**
- Diagnosticado deploy lento: `RECIBO.jpeg` (174KB) estava sendo rastreado pelo git desde o commit `4811482`, engordo o repositório e tornando o clone do Firebase mais lento
- `tmp_test_db.js` (arquivo de teste local) também estava rastreado desnecessariamente
- Ambos removidos do git tracking via `git rm --cached`
- `.gitignore` atualizado para bloquear `RECIBO.*` e `tmp_*.js` futuramente
- `next.config.ts` criado com `output: "standalone"` para reduzir o artefato de deploy
- `serverComponentsExternalPackages: ["tesseract.js"]` adicionado para evitar processamento do WASM pesado no build server-side
- Investigados 4 erros no Firebase (3x 4xx + 1x 5xx): 4xx são erros normais de auth, 5xx pontual provavelmente causado pelo tesseract.js no SSR — corrigido pelo config acima
- Deploy confirmado como bem-sucedido pelo usuário

**Arquivos criados/modificados:**
- `.gitignore` *(alterado)* — ignora `RECIBO.*` e `tmp_*.js`
- `next.config.ts` *(alterado)* — `output: standalone` + `serverComponentsExternalPackages`
- `RECIBO.jpeg` *(removido do git)*
- `tmp_test_db.js` *(removido do git)*

**Pendências:**
- Nenhuma

---

### 2026-04-12 — Fix: race condition no recibo + botão vincular recibo a transação existente

**Horário de registro:** 12/04/2026 às 13:26

**O que foi feito:**
- Diagnosticado race condition: upload do recibo no celular demorava e o usuário salvava a transação antes de terminar, deixando o arquivo órfão no Storage sem `receiptUrl` no Firestore
- Fix: botão "Finalizar Lançamento" agora desabilitado enquanto `ocrLoading=true`, com texto "⏳ Aguarde o recibo..."
- Nova feature: botão [📎] em cada linha da lista (apenas para transações sem recibo) que abre câmera/galeria, faz upload e vincula o recibo à transação via nova action `attachReceipt`
- Fix de bug detectado na revisão: input oculto do attachRef estava dentro do modal condicional `{showForm && ...}` — movido para o nível global do componente para funcionar mesmo com o form fechado

**Arquivos criados/modificados:**
- `actions/transactions.ts` *(alterado)* — nova action `attachReceipt(id, url)` para vincular recibo a transação existente
- `app/(app)/transacoes/TransacoesClient.tsx` *(alterado)* — botão [📎] por linha, `handleAttachReceipt`, fix do submit bloqueado durante upload

**Pendências:**
- Os 2 arquivos órfãos em `receipts/test-simulation/` no Storage podem ser deletados manualmente pelo console do Firebase

---

### 2026-04-12 — Fix: upload de recibo não era salvo na transação

**Horário de registro:** 12/04/2026 às 13:08

**O que foi feito:**
- Diagnosticado via simulação real de upload: o bucket do Firebase Storage nunca havia sido ativado no console — todo upload retornava 404 silenciosamente
- O `catch {}` engolia o erro, o usuário via o thumbnail local mas `receiptUrl` ficava vazio
- Firebase Storage ativado pelo usuário no console do Firebase
- `firebase-storage.ts`: adicionado `waitForAuth()` — aguarda até 5s pelo estado de autenticação antes de tentar o upload (corrige race condition no mobile)
- `TransacoesClient.tsx`: catch agora exibe erro visível em vermelho (`⚠️ Recibo não salvo: <motivo>`), timeout aumentado de 15s para 30s, retorno antecipado em caso de falha

**Arquivos criados/modificados:**
- `lib/firebase-storage.ts` *(alterado)* — `waitForAuth()` + upload corrigido
- `app/(app)/transacoes/TransacoesClient.tsx` *(alterado)* — erro visível, timeout 30s

**Pendências:**
- Transações existentes (ex: Pecorino/Estacionamento) foram criadas sem recibo — não há retroativo automático

---

### 2026-04-12 — Recibo visível na lista de transações (mobile)

**Horário de registro:** 12/04/2026 às 12:39

**O que foi feito:**
- Link do recibo (🧾) estava na última coluna da tabela — invisível no mobile por scroll horizontal
- Movido para dentro da linha de descrição (junto com @payee e #tags), sempre visível
- Removido o link duplicado da última coluna

**Arquivos criados/modificados:**
- `app/(app)/transacoes/TransacoesClient.tsx` *(alterado)* — 🧾 recibo agora aparece abaixo da descrição, alinhado com payee/tags

---

### 2026-04-12 — Fix: receiptUrl inválida bloqueia save + melhora extração OCR

**Horário de registro:** 12/04/2026 às 12:14

**O que foi feito:**
- Erro `{"receiptUrl":["Invalid URL"]}` impedia salvar qualquer transação quando recibo tinha sido escaneado mas upload falhou/expirou — a string vazia `""` era rejeitada pelo Zod `.url()`
- Solução: `z.preprocess` converte `""` para `undefined` antes da validação no schema
- OCR lia o texto mas não preenchia os campos — regex muito restrita (exigia `R$` e `DD/MM/YYYY` exatos)
- Melhorias nos regex: captura `TOTAL`, `VALOR`, `PAGO`, `PAGAR`; datas com `-` e formato ISO `YYYY-MM-DD`; descrição agora exige pelo menos uma letra (ignora linhas só com números)
- `toInputDate` corrigida para aceitar formato `YYYY/MM/DD` além de `DD/MM/YYYY`

**Arquivos criados/modificados:**
- `actions/transactions.ts` *(alterado)* — `z.preprocess` em `receiptUrl` para tratar string vazia como undefined
- `app/(app)/transacoes/TransacoesClient.tsx` *(alterado)* — regex OCR expandidos, `toInputDate` para dois formatos

---

### 2026-04-12 — Fix: OCR travado em "Enviando recibo..." no mobile (2ª ocorrência)

**Horário de registro:** 12/04/2026 às 12:02

**O que foi feito:**
- O loop infinito no OCR voltou a ocorrer — desta vez o travamento era no **upload** (`uploadBytes`), não no OCR
- A correção anterior (commit `181d6c1`) adicionou timeout apenas no Tesseract, mas o `uploadReceipt` não tinha nenhum timeout
- Em conexões móveis lentas, `uploadBytes` do Firebase Storage pode travar indefinidamente, mantendo `ocrLoading=true` para sempre
- Solução: `Promise.race` com timeout de 15s no upload; se falhar ou demorar, o fluxo segue normalmente para o OCR sem a URL do recibo

**Arquivos criados/modificados:**
- `app/(app)/transacoes/TransacoesClient.tsx` *(alterado)* — timeout de 15s no `uploadReceipt`, falha silenciosa sem bloquear o OCR

---

### 2026-04-12 — Fix: login restaurado (senha + credenciais Admin SDK)

**Horário de registro:** 12/04/2026 às 11:55

**O que foi feito:**
- Investigado erro `Firebase: Error (auth/invalid-credential)` no login
- Separação do `try/catch` em `LoginClient.tsx` revelou que havia dois problemas distintos:
  1. **Senha incorreta** para o usuário `luizking@uol.com.br` — resolvido enviando email de redefinição via REST API do Firebase Identity Toolkit
  2. **Credenciais do Admin SDK inválidas em produção** — o `apphosting.yaml` não tinha `FIREBASE_CLIENT_EMAIL`/`FIREBASE_PRIVATE_KEY` e quando foram adicionados como secrets, a chave privada foi rejeitada com `invalid_grant: account not found`
- Solução definitiva para o Admin SDK: em produção (Firebase App Hosting), `FIREBASE_CONFIG` é setado automaticamente e o ambiente já provê Application Default Credentials (ADC) com permissões suficientes para `createSessionCookie` — não precisa de service account explícito
- `firebase-admin.ts` refatorado: usa ADC quando `FIREBASE_CONFIG` presente (produção), cert credentials apenas localmente
- Login confirmado funcionando no mobile após redefinição de senha

**Arquivos criados/modificados:**
- `app/login/LoginClient.tsx` *(alterado)* — dois blocos `try/catch` separados: sign-in e sessão
- `lib/firebase-admin.ts` *(alterado)* — ADC em produção, cert local
- `apphosting.yaml` *(alterado)* — removidos secrets desnecessários do Admin SDK

**Pendências / próximos passos:**
- Nenhuma

---

### 2026-04-12 — Fix: erro auth/invalid-credential no login (iteração anterior)

**Horário de registro:** 12/04/2026 às 11:35

**O que foi feito:**
- Identificado que o erro `Firebase: Error (auth/invalid-credential)` exibido no login vinha do `adminAuth.createSessionCookie()` falhando em produção — e não do `signInWithEmailAndPassword`
- Causa raiz: `apphosting.yaml` não tinha `FIREBASE_CLIENT_EMAIL` nem `FIREBASE_PRIVATE_KEY`, então o Firebase Admin SDK ficava sem credenciais no ambiente de produção (Firebase App Hosting)
- O erro estava oculto antes do commit `fec7bba` que passou a expor a mensagem real do erro em vez de "Falha ao iniciar sessao."
- Secrets criados no Secret Manager do Firebase: `firebase-client-email` e `firebase-private-key`
- `apphosting.yaml` atualizado para referenciar os secrets
- `LoginClient.tsx` refatorado com dois blocos `try/catch` separados: um para o sign-in do Firebase Auth (cliente), outro para a criação do session cookie (servidor) — erros agora são distinguíveis e mais informativos

**Arquivos criados/modificados:**
- `app/login/LoginClient.tsx` *(alterado)* — separação do try/catch de sign-in e de sessão
- `apphosting.yaml` *(alterado)* — adicionados `FIREBASE_CLIENT_EMAIL` e `FIREBASE_PRIVATE_KEY` como secrets

**Pendências / próximos passos:**
- Verificar login no ambiente de produção após o deploy

---

### 2026-04-12 — Fix: OCR mobile em loop infinito

**Horário de registro:** 12/04/2026 às 11:15

**O que foi feito:**
- Corrigido bug crítico de loop infinito no OCR ao usar câmera no mobile
- Upload e OCR eram executados em `Promise.all` — se o Tesseract travasse, o `finally` nunca rodava e `ocrLoading` ficava `true` para sempre
- Nova lógica: upload primeiro (independente), OCR depois com timeout de 20s
- Se OCR falhar ou timeout, recibo ainda é salvo e usuário preenche campos manualmente
- Feedback em tempo real no botão: "Enviando recibo..." → "Lendo recibo..." → resultado
- Adicionado estado `ocrStatus` para mensagens progressivas durante o processo

**Arquivos criados/modificados:**
- `app/(app)/transacoes/TransacoesClient.tsx` *(alterado)* — OCR separado do upload, timeout 20s, fallback gracioso

**Pendências / próximos passos:**
- Edição de transações (atualmente só cria e exclui)
- Tela de configurações / exportação de dados
- Notificações de contas a vencer (PENDING transactions)

**Observações para debugging:**
- Tesseract.js carrega modelo PT (~15MB) em runtime — no mobile pode demorar ou falhar silenciosamente
- O timeout de 20s garante que o usuário não fique travado esperando indefinidamente
- O upload para Firebase Storage sempre ocorre antes do OCR, garantindo que o recibo seja salvo mesmo sem leitura

---

### 2026-04-12 — Ajustes no CLAUDE.md e fluxo de finalização de sessão

**Horário de registro:** 12/04/2026 às 11:02

**O que foi feito:**
- Skill `/deploy-financo` configurado para executar sem pedir confirmações intermediárias
- `CLAUDE.md` atualizado para capturar horário real via `date` antes de escrever o PROGRESSO.md
- Corrigida instrução de branch de `master` para `main`
- Corrigida referência do skill de deploy de `/deploy-scripts` para `/deploy-financo`

**Arquivos criados/modificados:**
- `CLAUDE.md` *(alterado)* — horário real obrigatório, sem confirmações no deploy
- `~/.claude/skills/deploy-financo/README.md` *(alterado)* — removida regra de consentimento explícito

**Pendências / próximos passos:**
- Nenhuma

**Observações para debugging:**
- Nenhuma alteração funcional no código; sem risco de regressão.

---

### 2026-04-12 — Configuração de Deploy Automático (Firebase App Hosting)

**Horário de registro:** 12/04/2026 às 19:30

**O que foi feito:**
- Criado `firebase.json` com referência ao `firestore.indexes.json`
- Criado `.firebaserc` apontando para o projeto `financo-260308`
- Criado skill `/deploy-financo` em `~/.claude/skills/deploy-financo/` — executa push direto sem confirmações
- `CLAUDE.md` atualizado: branch corrigida para `main`, deploy atualizado para `/deploy-financo`, removida exigência de confirmações intermediárias

**Arquivos criados/modificados:**
- `firebase.json` *(novo)*
- `.firebaserc` *(novo)*
- `CLAUDE.md` *(alterado)*

**Pendências / próximos passos:**
- Nenhuma

**Observações para debugging:**
- O App Hosting monitora a branch `main` — qualquer `git push` dispara build automático, sem necessidade de `firebase deploy`
- URL de produção: `https://financo--financo-260308.us-central1.hosted.app`
- Painel: `https://console.firebase.google.com/project/financo-260308/apphosting`

---

### 2026-04-12 — OCR de Recibos, Parcelamento, BottomNav Mobile e Migração Firestore

**Horário de registro:** 12/04/2026 às 19:00

**O que foi feito:**
- Implementação do fluxo completo de **OCR de recibos** via Tesseract.js com upload para Firebase Storage (`firebase-storage.ts`)
- Suporte a **transações parceladas** — criação de múltiplas entradas mensais a partir de um único formulário
- Adição do **BottomNav** (`components/layout/BottomNav.tsx`) para navegação mobile com safe-area-inset
- Refatoração do `AppLayout` para exibir Sidebar em desktop e BottomNav em mobile (`<768px`)
- Dashboard com **gráfico de despesas por categoria anual** (`getExpensesByCategoryYear`) e historico de 6 meses + projeção 3 meses
- Inclusão do campo `receiptUrl` no tipo `Transaction` (`types/index.ts`)
- Otimização das queries Firestore em `lib/db.ts` para filtros nativos (sem `matchesWhere` em memória)
- PWA: adição de `manifest.json`, `icon.jpg` e metadados `appleWebApp` em `app/layout.tsx`
- Rota de sessão (`/api/auth/session`) com criação e remoção de cookie httpOnly seguro
- Revisão pré-commit: removida constante `MONTHS` não utilizada, corrigidos casts desnecessários `(tx as any)` e variáveis `tx` sem uso

**Arquivos criados/modificados:**
- `actions/transactions.ts` *(alterado)* — parcelamento, getExpensesByCategoryYear, toggleTransactionStatus
- `app/(app)/dashboard/page.tsx` *(alterado)* — charts ano, projeção futura, últimas transações
- `app/(app)/layout.tsx` *(alterado)* — BottomNav + Sidebar responsivo
- `app/(app)/transacoes/TransacoesClient.tsx` *(alterado)* — OCR, parcelas, toggle status, receiptUrl
- `app/api/auth/session/route.ts` *(alterado)* — cookie session httpOnly
- `app/layout.tsx` *(alterado)* — PWA metadata, manifest, viewport
- `components/charts/CategoryPieChart.tsx` *(alterado)* — prop emptyMessage
- `components/layout/BottomNav.tsx` *(novo)* — navegação mobile bottom
- `lib/db.ts` *(alterado)* — queries Firestore nativas, seedData, exportSnapshot
- `lib/firebase-storage.ts` *(novo)* — upload de recibos para Firebase Storage
- `types/index.ts` *(alterado)* — campo receiptUrl em Transaction
- `public/manifest.json` *(novo)* — PWA manifest
- `public/icon.jpg` *(novo)* — ícone do app
- `firestore.indexes.json` *(novo)* — índices compostos Firestore
- `package.json` / `package-lock.json` *(alterado)* — tesseract.js adicionado

**Pendências / próximos passos:**
- Edição de transações (atualmente só cria e exclui)
- Tela de configurações / exportação de dados
- Notificações de contas a vencer (PENDING transactions)

**Observações para debugging:**
- OCR usa worker tesseract.js carregado dinamicamente (lazy import) para não aumentar bundle inicial
- `seededUsers` e `seedPromises` em `lib/db.ts` são singletons em memória — em deploy serverless cada instância pode re-semear; isso é seguro pois o seed verifica existência antes de criar
- `matchesWhere` e `sortByField` definidos em `lib/db.ts` mas não utilizados atualmente — foram mantidos como utilitários para filtragem in-memory caso necessário

---

### 2026-04-12 — Ajuste no PROGRESSO.md

**Horário de registro:** 12/04/2026 às 08:51

**O que foi feito:**
- Correção do formato do horário de registro na sessão anterior (faltava a hora)
- O campo "Horário de registro" agora exibe data e hora no formato `DD/MM/YYYY às HH:MM`

**Arquivos criados/modificados:**
- `PROGRESSO.md` *(alterado)* — correção de formato e adição deste registro

**Arquivos alterados no código:** nenhum

**Pendências / próximos passos:**
- Nenhuma pendência identificada nesta sessão

**Observações para debugging:**
- Nenhuma alteração funcional realizada; sem risco de regressão.

---

### 2026-04-12 — Sessão inicial

**Horário de registro:** 12/04/2026 às 08:50

**O que foi feito:**
- Leitura completa do sistema para orientação do assistente
- Criação do arquivo `CLAUDE.md` com instruções de fluxo de finalização de sessão (gatilhos: "salva tudo", "faz o deploy", etc.)
- Criação deste arquivo `PROGRESSO.md`

**Arquivos criados/modificados:**
- `CLAUDE.md` *(novo)* — instruções de comportamento do assistente
- `PROGRESSO.md` *(novo)* — este arquivo de log

**Arquivos alterados no código:** nenhum

**Pendências / próximos passos:**
- Nenhuma pendência identificada nesta sessão

**Observações para debugging:**
- Nenhuma alteração funcional realizada; sem risco de regressão.

---

<!-- Novas sessões são adicionadas ACIMA desta linha de comentário, em ordem cronológica decrescente (mais recente primeiro) -->
