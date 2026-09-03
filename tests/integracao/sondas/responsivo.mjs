/**
 * responsivo.mjs — mede transbordo horizontal em viewport de celular.
 *
 * "A tela samba nas laterais" é sintoma de a página ser mais larga que o
 * aparelho. Este script não adivinha a causa: mede `scrollWidth` contra a
 * largura da janela e, quando há sobra, **aponta os elementos culpados** com
 * tamanho e posição.
 *
 * Usa uma sessão real, porque as telas que importam ficam atrás do login.
 *
 * Uso:
 *   node tests/integracao/responsivo.mjs
 *   BASE=https://financo--financo-260308.us-central1.hosted.app node tests/integracao/responsivo.mjs
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { chromium, devices } from "playwright";
import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const env = {};
for (const l of readFileSync(join(RAIZ, ".env"), "utf8").split(/\r?\n/)) {
  const m = l.match(/^([A-Z_]+)="?([\s\S]*?)"?$/);
  if (m) env[m[1]] = m[2];
}
const cfg = { ...env, ...process.env };
const BASE = process.env.BASE ?? "http://127.0.0.1:3002";

if (!getApps().length) {
  initializeApp({
    credential: cert({
      projectId: cfg.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
      clientEmail: cfg.FIREBASE_CLIENT_EMAIL,
      privateKey: cfg.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n"),
    }),
  });
}
const auth = getAuth();
const db = getFirestore();

const usuarios = await db.collection("users").get();
const admin = usuarios.docs.find((d) => d.data().role === "ADMIN" && d.data().status === "ACTIVE");
const custom = await auth.createCustomToken(admin.id);
const login = await fetch(
  `https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=${cfg.NEXT_PUBLIC_FIREBASE_API_KEY}`,
  { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token: custom, returnSecureToken: true }) },
).then((r) => r.json());
const cookie = await auth.createSessionCookie(login.idToken, { expiresIn: 3600000 });

const APARELHOS = [
  { nome: "iPhone SE (menor comum)", viewport: { width: 375, height: 667 } },
  { nome: "Android médio", viewport: { width: 393, height: 851 } },
];

const ROTAS = ["/dashboard", "/transacoes", "/transacoes?periodo=tudo", "/relatorios", "/aprovados", "/perfil", "/admin/aprovacoes", "/admin/usuarios", "/contas", "/categorias", "/orcamentos"];

const navegador = await chromium.launch();
const problemas = [];

for (const aparelho of APARELHOS) {
  const contexto = await navegador.newContext({
    ...devices["iPhone 12"],
    viewport: aparelho.viewport,
    isMobile: true,
    hasTouch: true,
  });
  const dominio = new URL(BASE).hostname;
  await contexto.addCookies([{ name: "financo_session", value: cookie, domain: dominio, path: "/" }]);

  const pagina = await contexto.newPage();
  console.log(`\n== ${aparelho.nome} (${aparelho.viewport.width}px) ==`);

  for (const rota of ROTAS) {
    // `networkidle` não serve no modo de desenvolvimento: o websocket de
    // recarga automática nunca fica ocioso e o teste estoura o tempo.
    await pagina.goto(`${BASE}${rota}`, { waitUntil: "domcontentloaded", timeout: 60000 });
    await pagina.waitForTimeout(1200);

    const medida = await pagina.evaluate(() => {
      const larguraJanela = document.documentElement.clientWidth;
      const larguraPagina = Math.max(
        document.documentElement.scrollWidth,
        document.body.scrollWidth,
      );

      // Quem, de fato, ultrapassa a borda direita da janela.
      const culpados = [];
      for (const el of document.querySelectorAll("body *")) {
        const r = el.getBoundingClientRect();
        if (r.width === 0 && r.height === 0) continue;
        if (r.right <= larguraJanela + 1) continue;

        // Elemento dentro de um container que rola sozinho é comportamento
        // desejado (tabela larga), não transbordo da página.
        let pai = el.parentElement;
        let temRolagemPropria = false;
        while (pai && pai !== document.body) {
          const estilo = getComputedStyle(pai);
          if (estilo.overflowX === "auto" || estilo.overflowX === "scroll" || estilo.overflowX === "hidden") {
            temRolagemPropria = true;
            break;
          }
          pai = pai.parentElement;
        }
        if (temRolagemPropria) continue;

        culpados.push({
          tag: el.tagName.toLowerCase(),
          classe: (el.className || "").toString().slice(0, 40),
          texto: (el.textContent || "").trim().slice(0, 45),
          largura: Math.round(r.width),
          direita: Math.round(r.right),
        });
      }
      // Área que exige arrastar de lado para ler. A página não transborda —
      // mas o conteúdo dentro dela some para fora do aparelho, que é a mesma
      // frustração para quem usa.
      const rolagemLateral = [];
      for (const el of document.querySelectorAll("body *")) {
        const estilo = getComputedStyle(el);
        if (estilo.overflowX !== "auto" && estilo.overflowX !== "scroll") continue;
        const sobra = el.scrollWidth - el.clientWidth;
        if (sobra > 4) {
          rolagemLateral.push({
            tag: el.tagName.toLowerCase(),
            visivel: el.clientWidth,
            conteudo: el.scrollWidth,
            sobra,
            texto: (el.textContent || "").trim().slice(0, 40),
          });
        }
      }

      return { larguraJanela, larguraPagina, culpados: culpados.slice(0, 6), rolagemLateral };
    });

    const sobra = medida.larguraPagina - medida.larguraJanela;
    if (sobra > 1) {
      console.log(`  TRANSBORDA ${rota}  (+${sobra}px além dos ${medida.larguraJanela}px)`);
      for (const c of medida.culpados) {
        console.log(`      <${c.tag}> larg ${c.largura}px, borda direita em ${c.direita}px  "${c.texto}"`);
      }
      problemas.push({ aparelho: aparelho.nome, rota, sobra, culpados: medida.culpados });
    } else if (medida.rolagemLateral.length) {
      const pior = medida.rolagemLateral.sort((a, b) => b.sobra - a.sobra)[0];
      console.log(`  ARRASTA    ${rota}  (<${pior.tag}> mostra ${pior.visivel}px de ${pior.conteudo}px — ${pior.sobra}px escondidos de lado)`);
      problemas.push({ aparelho: aparelho.nome, rota, sobra: pior.sobra, tipo: "rolagem lateral" });
    } else {
      console.log(`  OK         ${rota}`);
    }
  }

  await contexto.close();
}

await navegador.close();

console.log("\n" + "=".repeat(64));
if (problemas.length === 0) {
  console.log("RESPONSIVO: nada transborda e nada exige arrastar de lado.");
} else {
  console.log(`${problemas.length} tela(s) transbordando:`);
  for (const p of problemas) console.log(`  ${p.aparelho} · ${p.rota} · ${p.tipo ?? "transborda"} · ${p.sobra}px`);
}
process.exit(problemas.length ? 1 : 0);
