---
programa: financo
tipo: fase
fase: 9
titulo: Testes, integração contínua, auditoria e go-live
status: pendente
depende_de: [7, 8]
observacao: a integração contínua pode ser adiantada para logo após a Fase 4
herda: ../../00-CONSTITUTION.md
---

# FASE 9 — Qualidade contínua e go-live

**Objetivo:** rede de segurança permanente e liberação responsável para a equipe.
Cumpre o Art. 7 (sistema de risco exige teste versionado) e os RNF-06.

## Ler apenas

- `package.json`
- `tsconfig.json`
- `lib/core/expense-status.ts`
- `lib/core/money.ts`
- `lib/guardrails/validate.ts`
- `specs/financo/01-SPEC.md` — a lista de critérios de aceite do go-live

## Passos

### 1. Testes com vitest (D8)

Prioridade — o que quebra dinheiro, na ordem:

1. **`expense-status.ts`** — toda transição válida e, principalmente, toda
   inválida. Colaborador não aprova a própria despesa; aprovada não volta a
   rascunho; ressarcida não muda mais.
2. **`money.ts`** — soma, subtração, arredondamento, formatação. Sem erro de
   ponto flutuante.
3. **`validate.ts`** — schemas recusam o que devem recusar, incluindo o arquivo
   de backup malformado.
4. **Cálculo de saldo** — o delta aplicado em cada operação.

Tudo função pura: não precisa de emulador nem de rede. Emulador para testar as
regras do banco fica como passo posterior, se a auditoria pedir.

### 2. Scripts

`package.json`: `typecheck` (`tsc --noEmit`), `test` (`vitest run`),
`test:watch`.

### 3. Integração contínua

`.github/workflows/ci.yml` — em todo push e pull request: instalar, lint,
typecheck, testes e build. Verde é condição para integrar (RNF-06). É o que
impede que uma regressão como a de `af85d4a` volte a acontecer sem ninguém ver.

### 4. Endurecer o TypeScript

`noImplicitAny: true` no `tsconfig.json` e corrigir o que aparecer. Só faz
sentido depois da Fase 4, que já eliminou o `any` da camada de dados.

### 5. Auditoria de segurança

Revisar o código inteiro contra os riscos conhecidos: segredo em código,
validação ausente, escalada de privilégio, referência direta a objeto sem
verificação de dono, upload sem restrição, erro que vaza detalhe interno.

**Corrigir tudo que for crítico ou alto** antes do go-live. Registrar o
resultado em `outputs/relatorios/`.

Ponto específico a tratar: a chave privada do Firebase Admin está em texto puro
no `.env` local. Está fora do Git, mas com o sistema aberto à equipe vale
rotacioná-la.

### 6. Checklist de go-live

Em ordem, sem pular:

- [ ] Backup completo dos dados do Luiz, guardado fora do repositório
- [ ] Regras do Firestore e do Storage publicadas a partir do repositório e testadas
- [ ] Luiz confirmado como admin ativo
- [ ] Guardião executado, sem achado crítico em aberto
- [ ] Integração contínua verde
- [ ] Auditoria sem item crítico ou alto pendente
- [ ] **Piloto com um colaborador real** — ciclo completo de ressarcimento, de
      ponta a ponta, antes de convidar os demais
- [ ] Só então: convidar o restante da equipe

## Critérios de aceite

- [ ] Suíte de testes cobre transições de estado, aritmética monetária, schemas
      de validação e cálculo de saldo
- [ ] `npm test` e `npm run typecheck` verdes localmente
- [ ] Integração contínua verde no GitHub, barrando pull request vermelho
- [ ] `noImplicitAny` ativo e o projeto compila
- [ ] Auditoria registrada, sem crítico ou alto em aberto
- [ ] Todos os critérios de aceite da SPEC verificados **com dado real**
- [ ] Piloto concluiu um ciclo de ressarcimento de verdade
- [ ] Commit feito
