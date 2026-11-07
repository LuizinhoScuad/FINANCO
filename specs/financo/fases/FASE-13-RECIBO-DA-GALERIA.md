---
programa: financo
tipo: fase
fase: 13
titulo: O comprovante pode vir da galeria do celular
status: implementada
implementada_em: 2026-11-07
observacao: >
  Implementada, portões verdes, conferida no navegador em modo celular e
  validada pelo Luiz em produção no iPhone (07/11/2026). Android ainda não
  conferido (critério 5).
depende_de: [12]
herda: ../../00-CONSTITUTION.md
---

# FASE 13 — O comprovante pode vir da galeria do celular

**Objetivo:** quem já fotografou o recibo e jogou o papel fora consegue anexar
essa foto ao lançamento, escolhendo-a da biblioteca do celular.

Nasceu de um pedido do Luiz (07/11/2026): *"alguns usuários tiraram a foto dos
recibos que ficaram armazenados em seus celulares para posterior lançamento no
sistema e imediato descarte do recibo [...] além da possibilidade de tirar a
foto imediata do recibo, ter um botão onde apareça as fotos da biblioteca do
celular para a escolha"*.

## Ler apenas

- `src/app/(app)/transacoes/TransacoesClient.tsx` (`handleOCR`, `handleAttachReceipt`, o bloco "Botão OCR" e os botões "+ recibo")
- `src/lib/firebase-storage.ts`
- `tests/integracao/sondas/responsivo.mjs`

## O problema concreto

Os dois pontos de anexo de recibo — o botão do formulário de lançamento e o
"+ recibo" de cada linha da lista — usavam
`<input type="file" accept="image/*" capture="environment">`. O atributo
`capture` manda o celular abrir **a câmera, e só ela**. Quem tinha a foto
guardada não tinha como escolhê-la: ou fotografava a tela de outro aparelho,
ou lançava sem comprovante — e o pedido chegava ao gestor marcado "sem
comprovante" (RF-42).

O custo de resolver é zero no servidor: o que muda é de onde a foto vem, não
para onde ela vai. Upload (`uploadReceipt`), regras do Storage e OCR seguem
idênticos.

## Passos

### 1. Specs primeiro
SPEC v4.3 com o RF-72; PLAN v4.3 com a D21 e a fase na tabela; este arquivo.

### 2. Formulário de lançamento (`TransacoesClient.tsx`)
Um segundo input oculto, `galeriaRef`, idêntico ao `cameraRef` mas **sem**
`capture`. Os dois chamam o mesmo `handleOCR`, que passa a limpar o `value`
dos dois (escolher a mesma foto duas vezes seguidas precisa disparar de novo).
O botão único "📷 Escanear Recibo (OCR)" vira dois, lado a lado, com o mesmo
estilo tracejado: **"📷 Tirar foto"** e **"🖼️ Escolher da galeria"**. Durante
o envio os dois ficam desabilitados e o status aparece abaixo deles, no mesmo
`span` que já acompanhava o preview.

### 3. "+ recibo" da lista
O input `attachRef` perde o `capture`. Sem ele, o iPhone abre a folha "Tirar
foto / Fototeca / Escolher arquivo" e o Android o seletor "Câmera / Galeria /
Arquivos": um toque, as duas opções. No computador o atributo já era ignorado.

### 4. Sem teste unitário novo
É só tela, sem regra pura (D20 é o molde do que ganha teste; aqui não há
função a testar). A prova é visual e no aparelho.

## Riscos

| Risco | Tratamento |
|---|---|
| Foto HEIC do iPhone | O Safari converte para JPEG ao entregar por `<input accept="image/*">`; `file.type` chega `image/jpeg` e passa em `uploadReceipt` |
| Foto maior que 10 MB | Já tratada em `uploadReceipt`: `⚠️ Recibo não salvo: Imagem maior que 10 MB.` |
| Escolher a mesma foto duas vezes seguidas não reage | `handleOCR` limpa o `value` dos **dois** inputs |
| Dois botões não cabem lado a lado em celular estreito | `flexWrap: "wrap"` no contêiner; a sonda `test:responsivo` confere que nada transborda |
| Android sem `capture` abrir só "Arquivos" em algum aparelho | Observar no teste real; se acontecer, o "+ recibo" ganha o mesmo par de botões do formulário |

## Critérios de aceite

| # | Critério | Como foi verificado |
|---|---|---|
| 1 | Portões verdes | ✅ estrutura íntegra · 103 testes · typecheck · lint (só os 3 avisos antigos do gráfico) · build |
| 2 | No formulário, dois botões lado a lado; "Escolher da galeria" abre o seletor de arquivos e a foto escolhida segue o fluxo de antes (preview, envio, status, `receiptUrl`) | ✅ navegador embutido, viewport 375×812 (07/11/2026): os dois botões na mesma linha, 147 px cada, documento com 375 px (sem rolagem lateral); o input da galeria existe sem `capture` e aponta para o mesmo `handleOCR`. Console sem erro. O envio real de uma foto não foi exercitado aqui |
| 3 | O "+ recibo" da lista continua funcionando | ✅ o input `attachRef` está na página sem `capture`, ligado a `handleAttachReceipt` como antes |
| 4 | **iPhone:** "Tirar foto" abre a câmera; "Escolher da galeria" abre a Fototeca; "+ recibo" oferece as duas opções | ✅ verificado pelo Luiz em produção, 07/11/2026, logo após o deploy ("Funcionou") |
| 5 | **Android:** mesmo roteiro do critério 4 | ⚠️ **NÃO VERIFICADO** — fica para quando alguém da equipe com Android usar |
| 6 | Foto antiga de recibo escolhida da galeria tem valor e data lidos pelo OCR | ✅ verificado pelo Luiz em produção, 07/11/2026 |

## Pendente para a próxima sessão

- Conferir o critério 5 no primeiro Android da equipe que usar.
- Se recibos de galeria passarem de 10 MB com frequência, avaliar
  redimensionar no navegador antes do envio (fase própria).
