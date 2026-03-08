# FINANCO

Aplicacao Next.js para controle financeiro pessoal.

## Requisitos

- Node.js 24+
- npm

## Ambiente local

1. Instale as dependencias:

```bash
npm install
```

2. Crie o arquivo `.env` com base em `.env.example`.

3. Inicie o app:

```bash
npm run dev -- --port 3002
```

4. Abra:

```text
http://127.0.0.1:3002/dashboard
```

## Banco de dados

O projeto usa Prisma com SQLite para desenvolvimento local.

Arquivos locais:

- `prisma/dev.db`
- `dev.db`

Para producao em Firebase App Hosting, o SQLite local nao e adequado. E necessario trocar `DATABASE_URL` para um banco gerenciado e persistente, como PostgreSQL.

## GitHub

Fluxo previsto para publicar como um novo projeto `FINANCO`:

```bash
git init
git branch -M main
git add .
git commit -m "Initial commit"
git remote add origin <URL_DO_REPOSITORIO>
git push -u origin main
```

## Firebase App Hosting

O deploy recomendado para este app Next.js com SSR e Firebase App Hosting.

Antes do deploy em producao:

- definir um `DATABASE_URL` de banco persistente
- definir a URL publica final em `NEXT_PUBLIC_APP_URL`
- vincular o repositório GitHub ao backend do App Hosting

Com o Firebase CLI autenticado, o fluxo geral e:

```bash
firebase init apphosting
firebase deploy
```

## Observacoes

- `.env` e arquivos `.db` nao devem ir para o GitHub
- o script `npm run dev` foi ajustado para usar `webpack` no desenvolvimento por estabilidade local
- deploy configurado para Firebase App Hosting
