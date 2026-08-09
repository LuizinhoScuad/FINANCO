---
programa: financo
tipo: fase
fase: 5
titulo: Importação segura, exportação paginada e erro visível
status: concluida
concluida_em: 2026-08-09
depende_de: [4]
herda: ../../00-CONSTITUTION.md
---

# FASE 5 — Importação segura e erro visível

> ## ✅ Concluída em 2026-08-09
>
> **Verificado com requisições reais contra a rota**, e confirmando ao final que
> os dados continuavam intactos:
>
> | Tentativa | Resultado |
> |---|---|
> | Lixo (`{qualquer: "coisa"}`) | ✅ recusado, 400 |
> | Estrutura certa, conteúdo inválido | ✅ recusado apontando o campo exato |
> | Lançamento apontando para conta inexistente | ✅ recusado, 422, com a lista de problemas |
> | Arquivo válido sem confirmação | ✅ devolveu prévia **sem escrever nada** |
> | Dados após todas as tentativas | ✅ 11 lançamentos intactos |
>
> **Cinco barreiras, nesta ordem:** schema → coerência interna → prévia →
> confirmação → cópia de segurança confirmada → substituição. Se a cópia falhar,
> a operação aborta: melhor não restaurar do que restaurar sem volta.
>
> **Seis chamadas que descartavam o erro** foram corrigidas (Contas, Categorias
> e Orçamentos). O `Result<T>` da Fase 4 fez o TypeScript apontar cada uma.
>
> **Exclusão de conta** passou a mostrar o impacto real antes — saldo e
> quantidade de lançamentos que somem junto — em vez de um "tem certeza?"
> genérico (Art. 1).
>
> Commit: `Fase 5 (SDD): restauração segura e erro visível`

**Objetivo:** tornar impossível perder dados por restauração de backup, e fazer
com que nenhuma falha passe despercebida pelo usuário. Atende RF-25 e RNF-09.

## O problema concreto

`POST /api/import` é hoje a operação mais perigosa do sistema: valida apenas que
os campos são listas, **apaga todas as coleções do usuário** e reinsere o que
veio no arquivo. Sem validação do conteúdo, sem backup prévio, sem prévia do
impacto e sem tratamento de erro no trecho destrutivo. Um arquivo malformado ou
uma queda no meio apaga tudo.

Em paralelo, três telas ignoram o erro que a action devolve: em Contas,
Categorias e Orçamentos, uma validação recusada faz o formulário fechar **como
se tivesse dado certo**. Em Transações, o erro aparece como JSON cru.

## Ler apenas

- `app/api/import/route.ts`
- `app/api/export/route.ts`
- `app/(app)/contas/ContasClient.tsx`
- `app/(app)/categorias/CategoriasClient.tsx`
- `app/(app)/orcamentos/OrcamentosClient.tsx`
- `app/(app)/transacoes/TransacoesClient.tsx`
- `lib/guardrails/result.ts` (criado na Fase 4)

## Passos

### 1. `lib/guardrails/validate.ts`

Schemas Zod centralizados, incluindo o do arquivo de backup inteiro: tipos dos
campos, e coerência referencial (toda transação aponta para conta e categoria
que existem no próprio arquivo).

### 2. `lib/guardrails/backup.ts`

`snapshotUserData(uid)` — grava o estado atual em
`backups/{uid}/{timestamp}.json` no Storage e devolve o caminho. Chamado antes
de qualquer operação destrutiva (Art. 1).

### 3. Reescrever a importação

Fluxo obrigatório, nesta ordem:

1. Validar o arquivo com Zod → recusa com mensagem clara em português
2. **Prévia**: devolver o que será feito ("12 contas, 340 transações
   substituirão os dados atuais") **sem escrever nada**
3. Confirmação explícita do usuário, com o resumo à vista
4. Backup automático — se falhar, **aborta** e informa
5. Só então substituir, em lotes, com tratamento de erro e resposta informando
   sucesso parcial se houver

### 4. Exportação paginada

`app/api/export/route.ts` passa a paginar com cursor. Hoje carrega tudo em
memória — com o volume de 7 pessoas isso estoura.

### 5. Erro sempre visível

- `app/error.tsx`, `app/not-found.tsx` e `app/(app)/error.tsx`
- Componente de aviso (toast) simples e próprio, para não adicionar dependência
- Os quatro clientes passam a consumir `Result<T>` e mostrar o erro
- Substituir `alert()` e `confirm()` nativos; exclusão e restauração passam a ter
  diálogo que **mostra o que será afetado** (Art. 1 — `confirm()` do navegador
  não basta para operação destrutiva)

## Critérios de aceite

- [ ] Arquivo de backup inválido é recusado com mensagem em português, sem apagar nada
- [ ] Arquivo válido mostra prévia com contagens **antes** de qualquer escrita
- [ ] Backup automático é gerado e verificável no Storage antes da substituição
- [ ] Falha no meio da importação informa o que aconteceu, sem deixar o usuário no escuro
- [ ] Validação recusada em Contas, Categorias e Orçamentos mostra aviso — o formulário não fecha em silêncio
- [ ] Nenhum `alert(JSON.stringify(...))` restante no projeto
- [ ] Rota inexistente mostra página de não encontrado; erro inesperado mostra página de erro
- [ ] Typecheck e build verdes; commit feito
