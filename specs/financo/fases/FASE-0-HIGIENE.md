---
programa: financo
tipo: fase
fase: 0
titulo: Checkpoint, higiene e configs de deploy
status: concluida
concluida_em: 2026-08-09
herda: ../../00-CONSTITUTION.md
---

# FASE 0 — Checkpoint, higiene e configs de deploy

**Objetivo:** partir de uma base limpa e com deploy previsível, antes de qualquer
mudança estrutural.

## O que foi feito

1. **Checkpoint** — commit do trabalho pendente (restauração de recibos, OCR,
   layout mobile e gráfico anual, perdidos numa regressão anterior) antes de
   tocar em qualquer outra coisa.
2. **Limpeza de resquícios** — removidos `prisma/`, `dev.db`, `tmp_test_db.js`,
   `RECIBO.jpeg`, `FINANCO.jpg`, SVGs de boilerplate, a dependência `ts-node` e
   a variável `DATABASE_URL`. O `.gitignore` passou a barrar `tmp_*.js` e
   `RECIBO.*` na origem, para não voltarem.
3. **`next.config.ts`** — restaurados `output: "standalone"` e
   `serverExternalPackages: ["tesseract.js"]`, perdidos na mesma regressão.
4. **`apphosting.yaml`** — `runConfig` com `maxInstances: 2` e 512 MiB: teto de
   custo para uso interno.
5. **`/api/health`** — passou a fazer leitura real no Firestore com tempo limite
   de 5s e a responder 503 quando a dependência está fora. Antes ecoava
   variáveis de ambiente e respondia 200 mesmo com o banco inacessível.

## Resultado verificado

- Typecheck e build limpos.
- Em produção: `/api/health` respondeu `ok: true` com leitura real; rotas
  protegidas redirecionam sem sessão; login e recursos do PWA respondem 200.
- Publicação concluída em ~105 segundos — efeito colateral positivo da remoção
  dos arquivos pesados que engordavam o repositório.

## Achado relevante

`RECIBO.jpeg` (174 KB) e `tmp_test_db.js` **estavam versionados novamente** — o
commit `af85d4a` os reintroduziu. Eram exatamente os arquivos apontados no
histórico como causa de lentidão no deploy. Removidos e barrados por padrão no
`.gitignore`.

## Commits

- `83fecfb` — restauração de recibos, OCR, layout mobile e gráfico anual
- `c5e918c` — higiene e configs de deploy
