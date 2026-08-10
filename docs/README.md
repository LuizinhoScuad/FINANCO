# FINANCO

Aplicacao Next.js para controle financeiro pessoal com Firebase App Hosting e Cloud Firestore.

## Requisitos

- Node.js 24+
- npm

## Ambiente local

1. Instale as dependencias:

```bash
npm install
```

2. Inicie o app:

```bash
npm run dev -- --port 3002
```

3. Abra:

```text
http://127.0.0.1:3002/dashboard
```

## Deploy web

Aplicacao publicada em:

```text
https://financo--financo-260308.us-central1.hosted.app/dashboard
```

## Banco de dados

O projeto usa Cloud Firestore no Firebase.

O seed inicial de categorias e conta padrao e criado automaticamente pela camada de dados quando o banco esta vazio.

## Firebase

Projeto:

```text
financo-260308
```

Stack usada:

- Firebase App Hosting
- Cloud Firestore

## GitHub

Repositorio:

```text
https://github.com/LuizinhoScuad/FINANCO
```

## Observacoes

- o script `npm run dev` usa `webpack` no desenvolvimento por estabilidade local
- o app foi ajustado para operar sem Prisma e sem SQLite
