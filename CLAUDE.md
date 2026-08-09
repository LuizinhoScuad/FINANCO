# CLAUDE.md — Instruções para o Assistente

## Como este projeto é desenvolvido (SDD)

O Financo segue desenvolvimento guiado por especificação. A ordem é sempre
**spec antes de código**.

**Documentos de governo** (em `specs/`):

| Arquivo | Papel |
|---|---|
| [`specs/00-CONSTITUTION.md`](specs/00-CONSTITUTION.md) | 10 artigos invioláveis — herdados por tudo |
| [`specs/03-HARNESS.md`](specs/03-HARNESS.md) | **Onde cada coisa mora** e como a sessão abre e fecha — verificável por máquina |
| [`specs/financo/01-SPEC.md`](specs/financo/01-SPEC.md) | O quê e por quê: requisitos e critérios de aceite |
| [`specs/financo/02-PLAN.md`](specs/financo/02-PLAN.md) | O como: arquitetura, decisões técnicas, sequência de fases |
| [`specs/financo/fases/`](specs/financo/fases/) | Um arquivo por fase, autocontido e executável |

**Protocolo de execução de fase.** Para trabalhar numa fase, carregue **apenas**:

```
specs/00-CONSTITUTION.md  +  specs/financo/01-SPEC.md  +  specs/financo/fases/FASE-N-*.md
```

Cada arquivo de fase declara a lista fechada do que ler. Não abra mais do que
ele pede — é isso que mantém a sessão dentro do contexto.

**Toda fase abre** com árvore de trabalho limpa e **fecha** com os portões
verdes, critérios de aceite verificados de fato e commit feito. O que não pôde
ser verificado é declarado como não verificado (Art. 3), nunca presumido.

```bash
npm run verificar:estrutura   # o repositório continua organizado
npm test && npm run typecheck && npm run lint && npm run build
```

**Regra de camada:** tela e rota nunca falam com o banco direto — sempre
`tela → action → lib/core + lib/guardrails → banco`.

**Onde colocar arquivo novo:** consulte [`specs/03-HARNESS.md`](specs/03-HARNESS.md)
antes de criar qualquer coisa. Nada de arquivo solto na raiz, nada de
`scripts/tmp/`, nada de script sem estar declarado na tabela do §4. Trabalho
descartável vive no diretório temporário da sessão, fora do repositório.

---

## Gatilhos de Finalização de Sessão

Quando o usuário disser **"salva tudo"**, **"grava tudo"**, **"finaliza"**, **"faz o deploy"** ou expressões equivalentes (ex: "pode salvar", "commita tudo", "manda pro GitHub", "sobe pro ar"), execute **obrigatoriamente** os passos abaixo na ordem:

### 1. Revisão de Código e Estrutura
Execute `npm run verificar:estrutura` e, em seguida, `/code-reviewer` para
revisar todo o código alterado na sessão atual.

### 2. Atualizar PROGRESSO.md
Antes de escrever, capture o horário real do sistema:
```bash
date
```
Use o resultado para preencher o campo **Horário de registro** no formato `DD/MM/YYYY às HH:MM`.

Atualize o arquivo `docs/PROGRESSO.md` com um resumo da sessão:
- Data e hora (obtida do comando acima — nunca escreva horário de cabeça)
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

- Quando o usuário acionar os gatilhos de finalização, execute tudo sem pedir confirmações intermediárias.
- A mensagem do commit deve ser descritiva e em português, resumindo o que foi feito na sessão.
- Se qualquer etapa falhar, pare e informe o usuário antes de continuar.
