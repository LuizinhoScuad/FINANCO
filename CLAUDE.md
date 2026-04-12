# CLAUDE.md — Instruções para o Assistente

## Gatilhos de Finalização de Sessão

Quando o usuário disser **"salva tudo"**, **"grava tudo"**, **"finaliza"**, **"faz o deploy"** ou expressões equivalentes (ex: "pode salvar", "commita tudo", "manda pro GitHub", "sobe pro ar"), execute **obrigatoriamente** os passos abaixo na ordem:

### 1. Revisão de Código
Execute `/code-reviewer` para revisar todo o código alterado na sessão atual.

### 2. Atualizar PROGRESSO.md
Atualize o arquivo `PROGRESSO.md` na raiz do projeto com um resumo da sessão:
- Data e hora
- O que foi implementado / alterado
- Arquivos modificados
- Pendências ou próximos passos (se houver)

### 3. Commit e Push no GitHub
Execute em sequência:
```bash
git add .
git commit -m "<mensagem descritiva das alterações>"
git push origin main
```

### 4. Deploy no Firebase App Hosting
Execute `/deploy-financo` para disparar o deploy no Firebase App Hosting.

> **Projeto:** `financo-260308` | **Branch:** `main` | **URL:** `https://financo--financo-260308.us-central1.hosted.app`

---

## Observações Gerais

- Nunca pule etapas, mesmo que o usuário diga "pode pular a revisão" — confirme antes.
- A mensagem do commit deve ser descritiva e em português, resumindo o que foi feito na sessão.
- Se qualquer etapa falhar, pare e informe o usuário antes de continuar.
