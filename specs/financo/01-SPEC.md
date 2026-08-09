---
programa: financo
tipo: spec
versao: 2.0
criado: 2026-08-09
herda: ../00-CONSTITUTION.md
referencia: 02-PLAN.md
---

# SPEC — Financo v2

## Problema

Pessoas da equipe da Scuadra Embalagens gastam do próprio bolso quando estão na
rua — almoço, estacionamento, combustível, pedágio — e depois precisam ser
ressarcidas pela empresa. Hoje esse controle se perde: o recibo some, o valor é
esquecido, ninguém sabe o que já foi pago e o que não foi. O prejuízo cai ora
sobre o colaborador (que não pede o que é dele), ora sobre a empresa (que paga
duas vezes ou paga o que não deve).

Existe um app — o Financo — que já resolve o registro de despesas com foto e
OCR, mas foi construído para **uma pessoa só**. Abrir ele para a equipe do jeito
que está seria irresponsável: qualquer um cria conta sem autorização; as regras
de segurança do banco não estão versionadas nem revisadas; saldos são gravados
em operações que corrompem o dado se falharem no meio; a restauração de backup
apaga tudo antes de validar o que vai entrar; e não há teste nenhum protegendo
nada disso.

## Objetivo

Transformar o Financo em um sistema confiável de **registro e ressarcimento de
despesas** para ~7 pessoas, sem perder o uso pessoal de finanças que já existe,
e com robustez suficiente para que ninguém precise "saber clicar direito" para
o sistema não quebrar.

Sucesso é: um colaborador na rua registra a despesa em menos de 30 segundos pelo
celular; o gestor aprova ou rejeita com o recibo à vista; o pagamento é fechado
em lote com comprovante; e ninguém, em nenhum momento, vê ou altera o dado de
outra pessoa.

## Não-objetivos

- **Não** é um ERP nem substitui a contabilidade da Scuadra.
- **Não** integra com banco, folha de pagamento ou emissor fiscal.
- **Não** tem IA embutida no app — a análise inteligente roda fora, sob demanda.
- **Não** atende cliente externo nem público geral: é ferramenta interna.
- **Não** faz gestão de adiantamento/caixa de viagem (só reembolso posterior).
- **Não** é multi-empresa: existe uma organização, a Scuadra.

## Princípios herdados

Todos os artigos de [`../00-CONSTITUTION.md`](../00-CONSTITUTION.md). Os que mais
pesam nas decisões desta spec:

- **Art. 2** (integridade de dinheiro) → toda mudança de valor é atômica.
- **Art. 4** (LGPD) → isolamento entre colaboradores validado no servidor e nas
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

### Despesas de ressarcimento (colaborador)

| ID | Requisito |
|---|---|
| RF-06 | Registrar despesa pelo celular em menos de 30s: foto → valor → categoria → enviar |
| RF-07 | A foto do recibo é **opcional**; sem ela a despesa fica marcada "sem comprovante", visível para o admin |
| RF-08 | O OCR lê a foto e pré-preenche valor e data; erro de leitura nunca bloqueia o envio |
| RF-09 | Categoria vem de lista mantida pelo admin — o colaborador escolhe, não cria |
| RF-10 | Colaborador vê apenas as próprias despesas, com status e motivo de rejeição quando houver |
| RF-11 | Despesa rejeitada pode ser corrigida e reenviada |
| RF-12 | Despesa já aprovada ou ressarcida não pode ser alterada por ninguém |
| RF-13 | Colaborador exporta as próprias despesas do período em PDF e XLSX |

### Aprovação e pagamento (admin)

| ID | Requisito |
|---|---|
| RF-14 | Fila de despesas enviadas, com recibo à vista e aviso de "sem comprovante" |
| RF-15 | Aprovar ou rejeitar; rejeição exige motivo escrito |
| RF-16 | Fechar lote de pagamento: agrupa as aprovadas de uma pessoa num período e marca todas como ressarcidas de uma vez |
| RF-17 | Histórico de lotes fechados, com comprovante em PDF para enviar ao colaborador |
| RF-18 | Relatório por pessoa, período e categoria, com totais |
| RF-19 | Exportar qualquer relatório em PDF e XLSX, no celular e no computador |
| RF-20 | Admin gerencia as categorias corporativas; desativar categoria não apaga histórico |
| RF-21 | Badge de pendências: enviadas aguardando decisão (admin), rejeitadas aguardando correção (colaborador) |

### Finanças pessoais (mantido)

| ID | Requisito |
|---|---|
| RF-22 | Contas, categorias, orçamentos e transações pessoais seguem funcionando, isolados por usuário |
| RF-23 | Dashboard, parcelamento, OCR e exportação atuais preservados |
| RF-24 | Exportação de transações pessoais ganha PDF além do XLSX |
| RF-25 | Restauração de backup exige prévia do impacto e gera backup automático antes de sobrescrever |

### Guardião

| ID | Requisito |
|---|---|
| RF-26 | Verificação de integridade sob demanda: saldo confere com as transações, referências órfãs, duplicatas suspeitas, despesa em estado inválido, recibo sem arquivo, pendência parada |
| RF-27 | O Guardião só lê — nunca corrige, nunca escreve |
| RF-28 | Achados saem classificados em FAZER AGORA / OBSERVAR / DESCARTAR |
| RF-29 | Decisão do humano sobre cada achado vira aprendizado: o descartado não é reproposto |

## Requisitos não-funcionais

| ID | Requisito |
|---|---|
| RNF-01 | Funciona como PWA no Android e no iOS, instalável, com navegação inferior no celular |
| RNF-02 | Registro de despesa utilizável com conexão ruim: falha de upload não perde o que foi digitado |
| RNF-03 | Nenhuma consulta carrega coleção inteira em memória — filtro e limite no banco |
| RNF-04 | Teto de custo: no máximo 2 instâncias no App Hosting |
| RNF-05 | Regras de segurança versionadas no repositório e publicadas a partir dele |
| RNF-06 | Typecheck, lint, testes e build verdes barram integração |
| RNF-07 | Camada de dados tipada — sem `any` no acesso a banco |
| RNF-08 | Valores monetários do módulo de ressarcimento em centavos (inteiro) |
| RNF-09 | Erro sempre visível ao usuário, em português, sem JSON cru |
| RNF-10 | Exportação gerada no navegador, sem custo de servidor |

## Fatores críticos de sucesso

1. **Confiança no número.** Se o total de um ressarcimento estiver errado uma vez,
   a equipe volta para o papel. Integridade vale mais que qualquer funcionalidade.
2. **Velocidade no registro.** Se registrar na rua for mais trabalhoso que anotar
   no bloco de notas, ninguém usa.
3. **Zero constrangimento entre colegas.** Ninguém pode ver o que o outro gastou.
4. **O gestor não vira gargalo.** Aprovar e fechar lote precisa ser rápido no
   celular, não uma tarefa de escritório.
5. **O sistema avisa antes de quebrar.** O Guardião existe para que o problema
   apareça em relatório, não em prejuízo.

## Critérios de aceite

O sistema está pronto para a equipe quando, verificado com contas reais:

- [ ] Conta nova fica pendente e **não acessa nada** até aprovação; após bloqueio, perde acesso na ação seguinte
- [ ] Colaborador A não consegue ver nem alterar despesa do colaborador B — testado inclusive por acesso direto ao identificador, não só pela tela
- [ ] Ciclo completo funciona: registrar no celular → aprovar → fechar lote → PDF e XLSX com totais conferidos na mão
- [ ] Despesa aprovada não pode ser editada; rejeitada volta para correção com o motivo visível
- [ ] Duplo clique em salvar não duplica lançamento nem corrompe saldo
- [ ] Restauração de backup com arquivo inválido é recusada com mensagem clara; com arquivo válido, gera backup antes
- [ ] Erro de qualquer ação aparece na tela em português
- [ ] Regras de segurança publicadas a partir do repositório
- [ ] Integração contínua verde; auditoria de segurança sem item crítico ou alto em aberto
- [ ] Guardião roda contra produção sem escrever nada e entrega achados nos três baldes
- [ ] Uso pessoal do Luiz intacto: dados preservados, contas e orçamentos funcionando
- [ ] Piloto com um colaborador real completou um ciclo de ressarcimento de ponta a ponta
