# PROGRESSO.md — Log de Sessões

> **Propósito:** Registrar todas as alterações feitas em cada sessão de trabalho, com data/hora, arquivos modificados e contexto suficiente para reverter ou corrigir regressões introduzidas pelas mudanças.

---

## Como usar

- Este arquivo é atualizado automaticamente ao final de cada sessão, antes do commit e deploy.
- Cada entrada contém: o que foi feito, arquivos alterados, e observações relevantes para debugging.
- Em caso de regressão, consulte a entrada mais recente para identificar o que mudou.

---

## Sessões

### 2026-04-12 — Fix: erro auth/invalid-credential no login

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
