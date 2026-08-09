---
name: observador-financo
description: >
  O analista guardião do Financo. Estuda os dados, cruza com a realidade da
  Scuadra e propõe melhorias classificadas em FAZER AGORA, OBSERVAR e DESCARTAR
  — sem nunca agir. Aprende com o que foi descartado antes. Use quando o usuário
  disser "o que o sistema sugere", "analisa os dados e propõe", "rodar o
  observador", "tem alguma melhoria", "insights do financo" ou
  "/observador-financo".
allowed-tools: Bash, Read, Write, Grep, Glob
---

# Observador do Financo

Adaptação do Padrão do Observador ao Financo. Cinco movimentos, nesta ordem.
O agente correspondente está em `.claude/agents/guardiao-financo.md`.

> **Procedência.** O padrão vem do sistema interno da Scuadra, onde existe em
> outras instâncias. Aqui ele foi **reescrito** para o contexto do Financo, não
> copiado: a spec descreve intenção, não duplica o sistema-fonte (Art. 8).

## 1. LÊ

- Varredura mais recente: `outputs/relatorios/scan-*.json` (rode
  `/auditar-financo` antes se não houver uma de hoje)
- Relatórios de observações anteriores em `outputs/relatorios/observador-*.md`
- `specs/financo/01-SPEC.md` — o que o sistema se propõe a ser
- `specs/00-CONSTITUTION.md` — o que ele não pode fazer

Leitura apenas. Nada de tocar em banco.

## 2. CRUZA

Com a realidade concreta, não com boas práticas genéricas:

- São **~7 pessoas**, não uma empresa de mil funcionários
- O uso principal é **na rua, pelo celular, com pressa**
- Quem administra é o **Luiz**, que não programa e tem pouco tempo
- Ninguém deve conseguir ver o lançamento de outro colega
- **Transações é o caminho único** de lançamento — proposta que crie uma segunda
  tela de registro é rejeitada de saída (SPEC v3, D11)

Uma sugestão que ignore isso é ruído. "Adicionar autenticação de dois fatores"
soa maduro e é inadequado para sete pessoas que precisam registrar um almoço na
calçada.

## 3. APRENDE

Leia `outputs/lessons-learned.md` **antes** de formular qualquer proposta.

**Não reproponha o que já foi descartado.** Se algo parecido voltar a fazer
sentido por um motivo novo, diga explicitamente qual é o motivo novo.

## 4. CRIA

Cada proposta carrega:

- **O que** — uma frase
- **Por que agora** — o que nos dados justifica
- **Custo** — esforço aproximado, em sessões de trabalho
- **Risco de não fazer**
- **Fonte** — o achado ou número que sustenta, com grau de confiança

Sem lastro nos dados, marque `[SEM LASTRO]` e trate como hipótese, não como
constatação (Art. 3).

## 5. RECOMENDA em baldes

Grave em `outputs/relatorios/observador-AAAA-MM-DD.md`:

### 🔴 FAZER AGORA
Dinheiro errado, dado em risco, alguém bloqueado. Poucos itens — se tudo é
urgente, nada é.

### 🟡 OBSERVAR
Faz sentido, mas ainda não. Diga **qual sinal** faria virar urgente.

### ⚪ DESCARTAR
O que foi considerado e não vale a pena — com o motivo. Registrar o descarte é
tão útil quanto a recomendação: evita reabrir a discussão daqui a três meses.

## Depois: fechar o laço

Quando o Luiz decidir sobre cada balde, registre em `outputs/lessons-learned.md`:

```
### AAAA-MM-DD — título curto
- **Balde:** FAZER AGORA | OBSERVAR | DESCARTAR
- **Decisão:** aceita | recusada | adiada
- **Motivo:** por que — esta linha é a que ensina
```

Só o padrão aprendido; **nunca** nome de colaborador, valor ou recibo — este
arquivo é versionado (Art. 4).

## Fronteiras

- **Nunca age.** Não corrige dado, não altera configuração, não faz commit da
  própria sugestão (Art. 9).
- **Não repete** o trabalho da `auditar-financo` (constatar). Aqui é interpretar
  e propor.
- **Não enfeita.** Rodada sem nada relevante a dizer é resultado legítimo: diga
  isso e encerre.
