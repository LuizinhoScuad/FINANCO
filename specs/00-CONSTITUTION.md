---
documento: 00-CONSTITUTION
projeto: Financo — Scuadra Embalagens
tipo: constituicao
versao: 1.0
criado: 2026-08-09
procedencia: >
  Adapta o padrão SDD-HARNESS usado internamente pela Scuadra (sistema AZZURRA).
  Os artigos abaixo foram reescritos em termos do Financo — este documento é
  autocontido e não depende de nenhum arquivo fora deste repositório.
---

# Constituição do Financo

Documento de nível mais alto do projeto. **Toda spec, todo arquivo de fase e toda
sessão de trabalho herda estes artigos.** Em caso de conflito entre uma instrução
pontual e um artigo, o artigo vence — ou o artigo é emendado explicitamente aqui,
com data e motivo.

## Contexto que dá origem a esta constituição

O Financo começou como app pessoal de finanças de uma pessoa só. Está se tornando
a ferramenta com que ~7 pessoas da Scuadra Embalagens registram despesas de rua
(almoço, estacionamento, combustível) para posterior ressarcimento pela empresa.

Isso muda a natureza do sistema em três sentidos, e é daí que vêm os artigos:

1. **Passa a tocar dinheiro de outras pessoas.** Um saldo errado deixa de ser um
   incômodo particular e vira um colaborador ressarcido a menor.
2. **Passa a guardar dados de terceiros.** Recibos e valores de funcionários são
   dados pessoais sob a LGPD.
3. **Passa a ser operado por quem não escreveu o código.** O sistema não pode
   depender de alguém saber "o jeito certo de clicar" para não quebrar.

---

## Art. 1 — Human-in-the-loop em operação destrutiva

Nenhuma operação que **apague, sobrescreva ou torne irrecuperável** dado de
usuário roda sem confirmação humana explícita e sem backup prévio verificável.

Aplica-se a: restauração de backup, exclusão de conta ou categoria com histórico,
fechamento de lote de pagamento, deploy de regras de segurança, qualquer script
que rode contra produção.

Na prática: `dry-run` que mostra o impacto → confirmação → backup → execução.
Um `confirm()` do navegador **não** é confirmação suficiente para operação
destrutiva de dados; precisa mostrar o que exatamente será afetado.

## Art. 2 — Integridade de dinheiro acima de conveniência

Todo valor monetário é gravado por operação atômica. Saldo e transação mudam
juntos ou não mudam.

Proibido: sequência de escritas independentes para manter um invariante
(ex.: reverter saldo antigo → gravar transação → aplicar saldo novo). Se falhar
no meio, o dado fica corrompido em silêncio — e silêncio é o pior modo de falha
de um sistema financeiro.

Obrigatório: `runTransaction` para leitura-e-escrita dependente; `writeBatch`
para conjunto que precisa ser tudo-ou-nada; idempotência em qualquer operação
que o usuário possa disparar duas vezes (duplo clique, reenvio de formulário).

## Art. 3 — Dados reais, nunca inventados

O sistema e os relatórios mostram o que foi medido. Nunca um número estimado,
arredondado por conveniência ou preenchido para "ficar bonito".

Vale também para o trabalho de quem implementa: não afirmar que algo funciona
sem ter executado. Se um passo não pôde ser verificado, isso é dito com todas as
letras em vez de presumido.

## Art. 4 — Privacidade dos dados da equipe (LGPD)

Recibos, valores e despesas de um colaborador pertencem a ele e à empresa —
não ao grupo.

- Colaborador acessa **apenas** os próprios dados. Isolamento garantido no
  servidor **e** nas regras do Firestore/Storage — nunca só na interface.
- Relatórios gerados por ferramentas de análise (o Guardião) contêm dados reais e
  **não são versionados** no Git.
- Nenhum dado de colaborador sai do sistema para serviço externo sem necessidade
  explícita e conhecimento dele.

## Art. 5 — Papel decide o que se pode fazer, e isso é verificado no servidor

Autorização é decidida no servidor a partir do papel (`ADMIN` / `COLABORADOR`) e
do status (`PENDING` / `ACTIVE` / `BLOCKED`) do usuário.

Esconder um botão na interface **não é** controle de acesso. Toda ação sensível
revalida papel e status antes de executar. As regras de segurança do Firestore
são a segunda barreira, independente da primeira — e ambas ficam versionadas
neste repositório, nunca só no console.

## Art. 6 — Robustez por construção

Não se conserta depois o que dá para não quebrar agora:

- **Validação na fronteira** — todo dado que entra (formulário, upload, arquivo
  importado) passa por schema antes de tocar o banco.
- **Erro visível** — nenhuma falha é engolida. Toda ação retorna resultado
  tipado e a interface mostra ao usuário o que aconteceu, em português claro.
- **Escrita segura** — backup antes de sobrescrever; exclusão reversível quando
  possível.
- **Camadas** — rota/tela nunca fala direto com o banco: passa por `core`
  (regra de negócio) e `guardrails` (proteções).

## Art. 7 — Este é um sistema "de risco": testes são permanentes

Por tocar dinheiro de terceiros, o Financo exige suíte de testes versionada,
não teste manual de uma vez só.

Cobertura mínima obrigatória: aritmética monetária, máquina de estados do
ressarcimento, schemas de validação, cálculo de saldo. Integração contínua
barra merge com teste vermelho, typecheck vermelho ou build quebrado.

## Art. 8 — A spec descreve intenção; o código é a verdade da implementação

Spec responde **o quê** e **por quê**. Código responde **como**. Documento não
duplica o que o código já diz — duplicata envelhece e mente.

Cada arquivo de fase é **autocontido**: executá-lo exige carregar apenas esta
Constituição, a SPEC e o próprio arquivo da fase. Isso é o que mantém cada
sessão de trabalho dentro do limite de contexto.

## Art. 9 — O Guardião observa e recomenda; quem decide é o humano

Agentes de análise operam em **modo leitura**. Nunca escrevem no banco, nunca
corrigem sozinhos, nunca executam a própria recomendação.

Entregam achados classificados em três baldes — **FAZER AGORA**, **OBSERVAR**,
**DESCARTAR** — e a decisão humana sobre cada balde volta para o registro de
aprendizado, para que a recomendação descartada não seja reproposta. Este é o
mecanismo de auto-aprendizado do sistema.

## Art. 10 — Continuidade do uso atual

A migração não pode interromper nem corromper o uso que já existe. Dado em
produção sobrevive a toda mudança de modelo; quando o modelo muda, a migração
do dado existente faz parte da mesma fase — não fica para depois.

---

## Emendas

| Data | Artigo | Mudança | Motivo |
|---|---|---|---|
| 2026-08-09 | — | Versão inicial | Abertura do sistema para a equipe da Scuadra |
