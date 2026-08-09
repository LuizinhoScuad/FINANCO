---
programa: financo
tipo: fase
fase: 1
titulo: Fundação SDD
status: concluida
concluida_em: 2026-08-09
herda: ../../00-CONSTITUTION.md
---

# FASE 1 — Fundação SDD

**Objetivo:** criar a estrutura documental que permite executar cada fase
seguinte numa sessão isolada, sem estourar contexto e sem depender de memória
de conversa.

## O que foi feito

1. **`specs/00-CONSTITUTION.md`** — 10 artigos que toda fase herda, escritos a
   partir do que muda quando o sistema passa a tocar dinheiro de terceiros:
   confirmação humana em operação destrutiva, atomicidade de valor, dados reais,
   LGPD, autorização no servidor, robustez por construção, testes permanentes,
   spec autocontida, guardião que só observa, continuidade do uso atual.
2. **`specs/financo/01-SPEC.md`** — problema, objetivo, não-objetivos, 29
   requisitos funcionais, 10 não-funcionais, fatores críticos de sucesso e a
   lista de critérios de aceite do go-live.
3. **`specs/financo/02-PLAN.md`** — arquitetura alvo, 11 decisões técnicas com
   justificativa, harness de orquestração (quem faz o quê) e o encadeamento das
   fases com seus riscos.
4. **`specs/financo/fases/`** — um arquivo por fase, autocontido: cada um declara
   a lista fechada do que ler, os passos na ordem e os critérios de aceite.
5. **`outputs/`** — `relatorios/` (fora do Git, contém dado real) e
   `lessons-learned.md` (versionado, só padrões).
6. **`CLAUDE.md`** — passou a apontar o protocolo de execução por fase.

## Convenção que fica valendo

Executar uma fase = carregar **apenas** três documentos:

```
specs/00-CONSTITUTION.md  +  specs/financo/01-SPEC.md  +  specs/financo/fases/FASE-N-*.md
```

Se um arquivo de fase precisar de mais contexto que isso, ele está grande demais
e deve ser dividido.

## Resultado verificado

- Todo arquivo de fase declara explicitamente o que ler (no máximo 8 arquivos).
- Nenhuma referência a caminho fora do repositório — o pacote é autocontido
  (Art. 8) e sobrevive a um clone limpo do GitHub.
