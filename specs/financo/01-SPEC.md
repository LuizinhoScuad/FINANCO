---
programa: financo
tipo: spec
versao: 4.0
criado: 2026-08-09
revisado: 2026-08-09
herda: ../00-CONSTITUTION.md
referencia: 02-PLAN.md
---

# SPEC — Financo v4

> **Revisão v4 (09/08/2026).** O reembolso **voltou**, remontado sobre
> Transações em vez de num módulo paralelo. A v3 havia retirado o módulo inteiro
> porque ele criava uma segunda porta de lançamento; o que estava errado era a
> porta, não o reembolso. Agora: **um lugar só para lançar** (Transações, com a
> marca "pedir reembolso"), **Relatórios para todos** e **Aprovações para o
> gestor**. Os RF-06 a RF-21 da v2 seguem revogados — o que voltou tem
> requisitos próprios (RF-40 a RF-56), escritos para o novo desenho.

## Problema

Controlar dinheiro em planilha e bloco de notas não sobrevive ao dia a dia: o
recibo some, o valor é esquecido, o saldo nunca fecha, e não dá para olhar para
trás e entender para onde o dinheiro foi.

Existe um app — o Financo — que resolve isso com registro de lançamento, foto do
comprovante, OCR, categorias, contas e orçamentos. Ele foi construído para **uma
pessoa só**, e abri-lo para mais gente do jeito que estava seria irresponsável:
qualquer um criaria conta sem autorização; as regras de segurança do banco não
estavam versionadas nem revisadas; saldos eram gravados em operações que
corrompem o dado se falharem no meio; a restauração de backup apagava tudo antes
de validar o que ia entrar; e não havia teste nenhum protegendo nada disso.

## Objetivo

Ser um sistema confiável para a equipe da Scuadra **registrar gastos e receber
de volta o que pagou do próprio bolso**, servindo ao mesmo tempo como controle
financeiro pessoal — com robustez suficiente para que ninguém precise "saber
clicar direito" para o sistema não quebrar.

Sucesso é: a pessoa registra o gasto em menos de 30 segundos pelo celular, com a
foto do comprovante; o gestor aprova com o comprovante à vista; o pagamento é
fechado em lote; e qualquer pessoa tira do próprio celular o PDF ou o Excel dos
seus pedidos para mandar no WhatsApp — vendo com clareza o que **já foi
atendido**.

**Um caminho só.** Todo lançamento — receita ou despesa, pedido ou particular,
de qualquer pessoa — entra por **Transações**. Não existe segunda porta.

## Não-objetivos

- **Não** é um ERP nem substitui a contabilidade da Scuadra.
- **Não** integra com banco, folha de pagamento ou emissor fiscal.
- **Não** tem IA embutida no app — a análise inteligente roda fora, sob demanda.
- **Não** atende cliente externo nem público geral: é ferramenta interna.
- **Não** é multi-empresa: existe uma organização, a Scuadra.
- **Não** faz adiantamento nem caixa de viagem: só reembolso depois do gasto.
- **Não** movimenta o pagamento: o dinheiro sai por fora, o sistema registra.

## Princípios herdados

Todos os artigos de [`../00-CONSTITUTION.md`](../00-CONSTITUTION.md). Os que mais
pesam nas decisões desta spec:

- **Art. 2** (integridade de dinheiro) → toda mudança de valor é atômica.
- **Art. 4** (LGPD) → isolamento entre usuários validado no servidor e nas
  regras do banco, nunca só na tela.
- **Art. 5** (papel verificado no servidor) → esconder botão não é segurança.
- **Art. 7** (sistema de risco) → suíte de testes permanente, não opcional.
- **Art. 10** (continuidade) → o uso pessoal atual não pode parar nem corromper.

## Requisitos funcionais

### Acesso e usuários

| ID | Requisito |
|---|---|
| RF-01 | Pessoa se cadastra sozinha com e-mail e senha; a conta nasce `PENDING` e não acessa nada |
| RF-02 | Admin vê a fila de cadastros pendentes e aprova ou recusa |
| RF-03 | Admin pode bloquear um usuário ativo; o bloqueio surte efeito na próxima ação, sem esperar a sessão expirar |
| RF-04 | Há dois papéis: `ADMIN` (Luiz) e `COLABORADOR` |
| RF-05 | Sessão expirada leva ao login com aviso, nunca a uma tela quebrada |

### Lançamentos — o caminho único (Transações)

| ID | Requisito |
|---|---|
| RF-30 | **Transações é a única tela de lançamento.** Receita e despesa entram pelo mesmo formulário, escolhendo o tipo |
| RF-31 | Registrar pelo celular em menos de 30s: valor → categoria → conta → salvar |
| RF-32 | A foto do comprovante é **opcional** e fica anexada ao lançamento |
| RF-33 | O OCR lê a foto e pré-preenche descrição, valor e data; erro de leitura nunca bloqueia o registro |
| RF-34 | Lançamento pode ser parcelado; as parcelas nascem juntas e de forma atômica |
| RF-35 | Lançamento tem situação `PENDING` ou `COMPLETED`; só o efetivado mexe no saldo da conta |
| RF-36 | Filtro por mês, ano, tipo e categoria, resolvido no banco |
| RF-37 | Duplo clique em salvar não duplica lançamento nem corrompe saldo |
| RF-38 | Em Transações cada pessoa vê e altera apenas os próprios lançamentos — inclusive o admin. O alcance ampliado do gestor existe só em Relatórios e Aprovações, e é somente leitura e decisão (ver RF-49) |

### Reembolso — pedido, aprovação e pagamento

| ID | Requisito |
|---|---|
| RF-40 | O pedido **é** um lançamento marcado, não outro tipo de registro: a caixa "Pedir reembolso" no formulário de Transações, marcada por padrão |
| RF-41 | Desmarcada, o lançamento é particular: fica fora da fila e fora dos Relatórios de reembolso |
| RF-42 | A foto do comprovante é **opcional**; sem ela o pedido fica marcado "sem comprovante", visível ao gestor |
| RF-43 | O dono corrige o pedido enquanto ele aguarda decisão ou está rejeitado; aprovado ou pago, ninguém mais altera nem exclui |
| RF-44 | Pedido rejeitado exibe o motivo e volta para a fila ao ser corrigido e salvo |
| RF-45 | Fila do gestor com o comprovante à vista; aprovar ou rejeitar, e a rejeição exige motivo escrito |
| RF-46 | Fechar lote: agrupa os aprovados de uma pessoa num período e marca todos como atendidos de uma vez, com prévia obrigatória antes de escrever |
| RF-47 | Comprovante do lote em PDF, para enviar à pessoa |
| RF-48 | Badge de pendência: aguardando decisão (gestor) e rejeitado aguardando correção (dono) |
| RF-49 | O gestor enxerga os lançamentos de toda a equipe, particulares inclusive — decisão explícita do Luiz, registrada aqui para não virar surpresa |

### Relatórios — de todo mundo, não só do gestor

| ID | Requisito |
|---|---|
| RF-50 | **Relatórios fica no menu principal, para qualquer pessoa** — é por ali que todos tiram os relatórios |
| RF-51 | Cada pessoa vê os próprios pedidos; o gestor vê os de toda a equipe e ganha o filtro por pessoa |
| RF-52 | Filtro por situação e por período livre, não apenas mês fechado |
| RF-53 | Exportação em PDF e XLSX, gerada no navegador e utilizável no celular para enviar por WhatsApp |
| RF-54 | O que **já foi atendido** aparece destacado e somado à parte do que está a receber — na tela e no arquivo exportado |
| RF-55 | Histórico dos pagamentos fechados, com o comprovante em PDF de cada um |

### Finanças pessoais

| ID | Requisito |
|---|---|
| RF-22 | Contas, categorias e orçamentos seguem funcionando, isolados por usuário |
| RF-23 | Dashboard com resumo do mês, histórico, previsão e despesa por categoria |
| RF-56 | Lançamento novo nasce pedido por padrão. O histórico anterior à funcionalidade foi migrado em 09/08/2026 por decisão do Luiz — "não há nada particular nos lançamentos" — com backup antes, prévia antes de gravar e desfazer disponível (`scripts/migrar-lancamentos-para-reembolso.mjs`). Migração é ato deliberado, nunca automática (Art. 1) |
| RF-24 | Exportação de transações em PDF e XLSX, gerada no navegador |
| RF-25 | Restauração de backup exige prévia do impacto e gera backup automático antes de sobrescrever |

### Guardião

| ID | Requisito |
|---|---|
| RF-26 | Verificação de integridade sob demanda: saldo confere com as transações, referências órfãs, duplicatas suspeitas, pedido em situação inválida, total de lote divergente, recibo sem arquivo, pendência parada |
| RF-27 | O Guardião só lê — nunca corrige, nunca escreve |
| RF-28 | Achados saem classificados em FAZER AGORA / OBSERVAR / DESCARTAR |
| RF-29 | Decisão do humano sobre cada achado vira aprendizado: o descartado não é reproposto |

### Requisitos revogados (v2)

Retirados na revisão v3 e **não** restaurados pela v4. O reembolso voltou com
requisitos novos (RF-40 a RF-55), escritos para o desenho de porta única; os de
baixo descreviam o módulo paralelo e ficam listados para que ninguém os
reintroduza ao ler uma fase antiga:

| IDs | O que eram | Por que saíram |
|---|---|---|
| RF-06 a RF-13 | Registro de despesa de rua pelo colaborador, com status, correção e exportação própria | Segunda porta de lançamento, concorrente com Transações — a confusão que motivou esta revisão |
| RF-14 a RF-21 | Fila de aprovação, lote de pagamento, relatório de equipe e badges de pendência do admin | Só existiam para servir ao ciclo de ressarcimento |

As fases [6](fases/FASE-6-RESSARCIMENTO.md) e
[7](fases/FASE-7-ADMIN-LOTES-RELATORIOS.md) seguem **revogadas**: valem como
registro histórico do módulo paralelo, não como trabalho a fazer. O reembolso da
v4 é outra construção.

## Requisitos não-funcionais

| ID | Requisito |
|---|---|
| RNF-01 | Funciona como PWA no Android e no iOS, instalável, com navegação inferior no celular |
| RNF-02 | Registro de lançamento utilizável com conexão ruim: falha de upload não perde o que foi digitado |
| RNF-03 | Nenhuma consulta carrega coleção inteira em memória — filtro e limite no banco |
| RNF-04 | Teto de custo: no máximo 2 instâncias no App Hosting |
| RNF-05 | Regras de segurança versionadas no repositório e publicadas a partir dele |
| RNF-06 | Typecheck, lint, testes e build verdes barram integração |
| RNF-07 | Camada de dados tipada — sem `any` no acesso a banco |
| RNF-08 | Aritmética monetária centralizada em `lib/core/money.ts`; total de lote gravado em centavos (inteiro), onde não existe deriva |
| RNF-11 | O modelo novo convive com o antigo: lançamento sem os campos de reembolso é lido como particular, sem quebrar. Migrar é opção do Luiz, por script com prévia e desfazer — nunca efeito colateral de um deploy (Art. 1, Art. 10) |
| RNF-09 | Erro sempre visível ao usuário, em português, sem JSON cru |
| RNF-10 | Exportação gerada no navegador, sem custo de servidor |

## Fatores críticos de sucesso

1. **Confiança no número.** Se o saldo estiver errado uma vez, a pessoa volta
   para o papel. Integridade vale mais que qualquer funcionalidade.
2. **Velocidade no registro.** Se lançar for mais trabalhoso que anotar no bloco
   de notas, ninguém usa.
3. **Um caminho só.** Duas telas para a mesma coisa é o defeito que a v3
   corrigiu e a v4 preserva. Funcionalidade nova reforça Transações, não nasce
   ao lado dela.
4. **Ninguém cobra duas vezes.** O que já foi atendido precisa gritar isso na
   tela e no PDF. Um relatório que soma o pago com o a pagar destrói a confiança
   mais rápido que qualquer defeito de código.
5. **Entre colegas, ninguém se expõe.** Um colaborador nunca vê o gasto de
   outro. O gestor vê todos — e a equipe precisa saber disso.
6. **O gestor não vira gargalo.** Aprovar e fechar lote tem de ser rápido no
   celular, não uma tarefa de escritório.
7. **O sistema avisa antes de quebrar.** O Guardião existe para que o problema
   apareça em relatório, não em prejuízo.

## Critérios de aceite

O sistema está pronto para a equipe quando, verificado com contas reais:

- [ ] Conta nova fica pendente e **não acessa nada** até aprovação; após bloqueio, perde acesso na ação seguinte
- [ ] Usuário A não consegue ver nem alterar lançamento do usuário B — testado inclusive por acesso direto ao identificador, não só pela tela
- [ ] Existe **uma única** tela de lançamento; nenhum menu, rota ou botão leva a um segundo caminho
- [ ] Ciclo completo funciona: lançar no celular com foto → gestor aprova → fecha lote → PDF e XLSX com totais conferidos na mão
- [ ] Um colaborador abre Relatórios, filtra o período e manda o PDF pelo WhatsApp sem precisar de ajuda
- [ ] O que já foi atendido aparece separado do que está a receber, na tela e no arquivo exportado
- [ ] Pedido aprovado não pode ser editado nem excluído; rejeitado volta para correção com o motivo visível
- [ ] Restaurar um backup preserva os pedidos já pagos — nenhum volta a ser lançamento particular
- [ ] Duplo clique em salvar não duplica lançamento nem corrompe saldo
- [ ] Restauração de backup com arquivo inválido é recusada com mensagem clara; com arquivo válido, gera backup antes
- [ ] Erro de qualquer ação aparece na tela em português
- [ ] Regras de segurança publicadas a partir do repositório
- [ ] Integração contínua verde; auditoria de segurança sem item crítico ou alto em aberto
- [ ] Guardião roda contra produção sem escrever nada e entrega achados nos três baldes
- [ ] Uso pessoal do Luiz intacto: dados preservados, contas e orçamentos funcionando
