---
name: auditar-financo
description: >
  Verifica a integridade dos dados do Financo — saldos que não fecham,
  referências órfãs, despesas em estado impossível, comprovantes perdidos,
  pendências paradas. Roda a varredura determinística primeiro e só analisa se
  houver achado. Use quando o usuário disser "auditar o financo", "verificar a
  integridade", "os saldos batem?", "tem algo errado nos dados", "rodar o
  guardião" ou "/auditar-financo".
allowed-tools: Bash, Read, Write, Grep
---

# Auditar Financo

Primeiro dos dois movimentos do Guardião. Este apenas **constata**; recomendar é
tarefa da `observador-financo`.

## Princípio

**Barato antes de caro.** A varredura é Node puro, sem inteligência artificial e
sem custo. Só quando ela encontra algo é que vale gastar análise. Rodar e não
achar nada é o resultado esperado na maior parte das vezes — e está tudo bem.

## Passos

### 1. Provar que o Guardião não escreve

```bash
node scripts/verificar-guardiao.mjs
```

Se falhar, **pare e avise**. O script roda com credencial de administrador, que
ignora as regras de segurança; sem essa prova não há garantia de que ele apenas
observa (Art. 9 da Constituição).

### 2. Varrer

```bash
node scripts/scan-financo.mjs
```

Sai em texto e grava `outputs/relatorios/scan-AAAA-MM-DD.json`.

O que é verificado:

| Gravidade | Verificação |
|---|---|
| 🔴 Crítica | Saldo da conta ≠ soma dos lançamentos efetivados |
| 🔴 Crítica | Despesa em estado fora da máquina; aprovada sem quem aprovou |
| 🔴 Crítica | Valor de despesa não inteiro em centavos |
| 🔴 Crítica | Total do lote ≠ soma das despesas que o compõem |
| 🟠 Alta | Referência órfã (lançamento sem conta, despesa sem dono, lote inexistente) |
| 🟠 Alta | Comprovante referenciado sem arquivo no Storage |
| 🟠 Alta | Cadastro aguardando há 7+ dias; despesa esperando decisão há 7+ dias |
| 🟡 Média | Lançamentos idênticos em menos de 2 minutos; orçamento duplicado |
| ⚪ Baixa | Arquivo órfão no Storage; orçamento sem categoria |

### 3. Sem achados

Diga isso em uma linha e encerre. Não invente preocupação para parecer útil
(Art. 3).

### 4. Com achados

Para cada um, na ordem de gravidade:

- **O que é**, em português claro, sem jargão
- **Por que importa** para quem usa — dinheiro errado, alguém esperando, custo
- **Causa provável**, marcando o grau de certeza
- **O que fazer**, e se exige decisão humana

Quando houver saldo divergente, mostre a diferença em reais e diga desde quando
o problema pode existir, se der para inferir dos dados.

## Fronteiras

- **Não corrige nada.** Nem "só esse caso simples". Observa e relata (Art. 9).
- **Não repropõe** o que já foi descartado — isso é papel da `observador-financo`,
  que lê `outputs/lessons-learned.md`.
- **Não inventa** número que não veio da varredura. Sem lastro, diga
  `[SEM LASTRO]`.

## Onde os dados reais ficam

`outputs/relatorios/` está fora do Git de propósito: contém valores e nomes reais
de colaboradores (Art. 4 — LGPD). Nunca cole conteúdo de relatório em commit,
issue ou qualquer lugar versionado.
