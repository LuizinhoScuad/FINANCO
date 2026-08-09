---
programa: financo
tipo: fase
fase: 8
titulo: Guardião — verificação de integridade e auto-aprendizado
status: pendente
depende_de: [6]
observacao: pode iniciar logo após a Fase 4, com o conjunto parcial de verificações
herda: ../../00-CONSTITUTION.md
---

# FASE 8 — Guardião

**Objetivo:** um analista que verifica os dados, aponta inconsistência e propõe
melhoria — sem nunca agir por conta própria (Art. 9). Atende RF-26 a RF-29.

Roda no Claude Code, na máquina do Luiz. Não há inteligência artificial embutida
no app nem custo por uso em produção.

## Ler apenas

- `lib/core/repositories/*.repo.ts` — nomes reais dos campos
- `types/index.ts`
- `lib/core/expense-status.ts`
- `specs/00-CONSTITUTION.md`

## Desenho

Três movimentos, do mais barato ao mais caro:

1. **Varredura determinística** — script Node puro, sem IA, sem custo. Roda
   sempre.
2. **Análise** — só é acionada quando a varredura encontra algo.
3. **Observação** — cruza os achados com o contexto do negócio e propõe.

### 1. `scripts/scan-financo.mjs`

Node + firebase-admin, **somente leitura**. Verificações:

| Invariante | Por que importa |
|---|---|
| Saldo da conta = soma das transações efetivadas | Detecta a corrupção que a Fase 4 previne — e confirma que não sobrou nenhuma de antes |
| Transação apontando para conta ou categoria inexistente | Referência órfã quebra relatório |
| Lançamentos idênticos em menos de 2 minutos | Duplo clique que escapou |
| Despesa em estado impossível pela máquina | Indica brecha na regra |
| Despesa aprovada sem quem aprovou | Aprovação por caminho indevido |
| Recibo referenciado sem arquivo no Storage | Comprovante perdido |
| Arquivo no Storage sem despesa correspondente | Lixo acumulando custo |
| Cadastro pendente há mais de 7 dias | Alguém esperando liberação |
| Despesa enviada há mais de 7 dias sem decisão | Colaborador esperando dinheiro |
| Lote aberto há mais de 30 dias | Pagamento esquecido |

Saída: JSON estruturado + resumo legível em
`outputs/relatorios/scan-AAAA-MM-DD.md`.

**Restrição inegociável:** o arquivo não pode conter `.set(`, `.update(`,
`.delete(`, `.add(` ou `.create(`. É critério de aceite verificável por busca
textual — o script roda com credencial de administrador e essa é a única
garantia real de que ele não escreve (Art. 9).

### 2. `.claude/skills/auditar-financo/`

Roda a varredura primeiro. Sem achado, encerra sem gastar nada. Com achado,
analisa: gravidade, causa provável, o que fazer.

### 3. `.claude/skills/observador-financo/`

Cinco movimentos:

1. **Lê** — varredura, relatórios anteriores, specs
2. **Cruza** — com o contexto real: 7 pessoas, ressarcimento, rotina da Scuadra
3. **Aprende** — consulta `outputs/lessons-learned.md` e **não repropõe o que já
   foi descartado**
4. **Cria** — formula a proposta com fonte e grau de confiança
5. **Recomenda** — classifica em **FAZER AGORA** / **OBSERVAR** / **DESCARTAR**

A decisão do Luiz sobre cada balde volta para `lessons-learned.md`. É esse laço
que faz o sistema aprender em vez de repetir sugestão recusada.

### 4. `.claude/agents/guardiao-financo.md`

Definição do agente em markdown, com pré-voo obrigatório: ler o aprendizado e o
último relatório antes de opinar; declarar `[SEM LASTRO]` quando não souber;
indicar fonte e confiança por afirmação (Art. 3).

Sobre reaproveitar agentes existentes do sistema interno: trazer o **padrão**,
não copiar as definições (Art. 8). O agente do Financo cita a procedência num
parágrafo e segue autocontido.

### 5. `outputs/lessons-learned.md`

Formato por entrada: data, o que foi proposto, decisão do Luiz, motivo. Sem
dado pessoal — só o padrão aprendido, porque este arquivo é versionado (Art. 4).

## Critérios de aceite

- [ ] `node scripts/scan-financo.mjs` roda contra produção e conclui sem erro
- [ ] Busca por `.set(`, `.update(`, `.delete(`, `.add(`, `.create(` no script
      não retorna nada
- [ ] Relatório gerado em `outputs/relatorios/`, com os achados nos três baldes
- [ ] `outputs/relatorios/` está fora do Git (contém dado real — Art. 4)
- [ ] Rodar de novo após registrar um descarte **não** repropõe o item descartado
- [ ] O script encontra um problema plantado de propósito (ex.: saldo alterado à
      mão numa conta de teste) — sem isso não há prova de que ele funciona
- [ ] Commit feito
