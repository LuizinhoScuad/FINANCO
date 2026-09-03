# Financo no celular — atalho na tela inicial

Guia para colocar o Financo como um ícone no celular, do jeito que abre igual a
um aplicativo: tela cheia, sem barra de navegador.

**Endereço:** https://financo--financo-260308.us-central1.hosted.app

Leva menos de um minuto. Faça uma vez e pronto.

> **Versão para mandar à equipe:** este mesmo guia está publicado como página,
> em <https://claude.ai/code/artifact/1763dd2f-3003-4e51-a191-6edae4806d7d> —
> abre no celular e é o que se compartilha. Ao mudar um, mude o outro.

---

## iPhone e iPad (iOS)

> ⚠️ **Se você abriu o link pelo WhatsApp, a opção some.** É o erro mais
> comum. WhatsApp, Instagram e Chrome abrem o site numa janela própria, e ali
> o "Adicionar à Tela de Início" não existe — no iPhone, só o Safari sabe
> criar esse atalho. Toque nos três pontinhos e escolha **"Abrir no Safari"**
> antes de começar.

1. Abra o **Safari** e entre no endereço acima.
2. Faça login (veja *Primeiro acesso*, abaixo).
3. Toque no botão **Compartilhar** — o quadradinho com a seta para cima, no
   rodapé da tela.
4. Deslize a lista para baixo e toque em **"Adicionar à Tela de Início"**.
5. O nome sugerido é **Financo**. Toque em **Adicionar**, no canto superior.

Pronto: o ícone aparece junto com os outros aplicativos.

---

## Android

1. Abra o **Chrome** e entre no endereço acima.
2. Faça login (veja *Primeiro acesso*, abaixo).
3. Toque nos **três pontinhos** ⋮, no canto superior direito.
4. Toque em **"Adicionar à tela inicial"** (em alguns aparelhos aparece como
   **"Instalar aplicativo"** — as duas servem).
5. Confirme em **Adicionar** ou **Instalar**.

Em alguns celulares o próprio Chrome oferece sozinho uma faixa na parte de
baixo dizendo *"Adicionar Financo à tela inicial"*. Se aparecer, é só tocar.

---

## Primeiro acesso

Quem nunca entrou precisa criar a conta antes:

1. Na tela de login, toque em **Criar conta** e informe nome, e-mail e senha.
2. A conta nasce **aguardando liberação** — você vê uma tela de espera, e isso
   é o esperado, não é erro.
3. O **Luiz** libera o acesso pelo painel de Usuários.
4. **Saia e entre de novo** depois de liberado. Sem isso a permissão não vale.

> No primeiro acesso já liberado, o Financo pede os seus **dados para
> reembolso** — nome do titular, CPF e chave PIX. É por eles que o financeiro
> deposita o que você pagou do próprio bolso, e não dá para pular. Leva meio
> minuto e é uma vez só; depois, dá para alterar em **Meus dados**.

---

## O que esperar depois de instalado

- Abre em **tela cheia**, sem a barra de endereço — parece um aplicativo.
- **Continua logado**: você não precisa digitar a senha toda vez. A sessão dura
  cerca de 5 dias.
- Funciona igual ao navegador, incluindo **tirar foto do comprovante** e a
  leitura automática do valor.

---

## Como lançar uma despesa na rua

1. Abra o Financo pelo ícone.
2. **Transações** → botão **+ Nova**.
3. Toque no botão da câmera, **Escanear Recibo (OCR)**, e fotografe o comprovante — o valor e a
   data costumam vir preenchidos sozinhos. Confira sempre.
4. Preencha a **descrição** (ex.: *Visita no cliente Mocotó*), a **categoria** e
   a **conta**.
5. Deixe **"Pedir reembolso da empresa"** marcada. É ela que manda o lançamento
   para a fila de aprovação. Desmarque só se o gasto for particular seu.
6. **Finalizar Lançamento**.

O pedido aparece com o selo **Aguardando** até o Luiz aprovar.

---

## Como mandar seu relatório pelo WhatsApp

1. **Relatórios**, no menu.
2. Escolha o período pelos atalhos — **Tudo**, **Este mês**, **Últimos 30 dias**
   — ou digite as datas em **De** e **Até**.
3. Toque em **↓ PDF** ou **↓ Excel (XLSX)**.
4. O arquivo baixa no celular. Abra o WhatsApp, escolha a conversa, toque no
   clipe de anexo → **Documento**, e selecione o arquivo.

No relatório, o que **já foi atendido** aparece somado à parte do que está **a
receber** — os dois nunca entram no mesmo total, justamente para ninguém cobrar
duas vezes o que já recebeu.

---

## Se algo der errado

| Problema | O que fazer |
|---|---|
| No iPhone não aparece "Adicionar à Tela de Início" | Você não está no Safari. Abra o link no Safari. |
| Pede login toda hora | A sessão expirou (5 dias). É só entrar de novo. |
| "Sua conta está aguardando liberação" | Normal no primeiro acesso. Peça ao Luiz para liberar. |
| Pede meus dados bancários e não deixa passar | É assim mesmo: sem chave PIX ninguém consegue ser reembolsado. Preencha e siga. |
| Liberaram mas continua barrado | Saia da conta e entre de novo — a permissão só vale na sessão nova. |
| A foto do recibo não sobe | Sinal fraco. O que você digitou **não se perde**: salve o lançamento e anexe o recibo depois, pelo botão **+ recibo** na lista. |
| O ícone sumiu da tela | Foi apagado como qualquer aplicativo. Refaça o passo a passo. |

---

## Observações técnicas (para o Luiz)

O app já está preparado para isso: `public/manifest.json` com `display:
standalone`, `start_url` em `/dashboard`, e `appleWebApp.capable` no
`src/app/layout.tsx`. Nada precisa ser feito para o atalho funcionar.

**Uma ressalva medida:** o `public/icon.jpg` tem **225×225 px**, mas o manifest
o declara em dois tamanhos, 192×192 e 512×512. Consequências:

- No **iPhone** funciona normalmente — o iOS usa o ícone e redimensiona.
- No **Android**, o Chrome exige um ícone de 512 px para oferecer o
  **"Instalar aplicativo"** completo. Como o arquivo real é menor, alguns
  aparelhos vão oferecer apenas **"Adicionar à tela inicial"**, que cria um
  atalho igualmente funcional, porém sem tratar o app como instalado.

Para destravar o "Instalar" no Android seria preciso gerar dois PNGs de verdade
(192 e 512) e apontar cada um no manifest. É mudança pequena, mas mexe em
arquivo publicado — fica registrada aqui como pendência, não feita.
