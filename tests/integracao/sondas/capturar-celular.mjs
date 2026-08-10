/**
 * capturar-celular.mjs — fotografa as telas num viewport de celular.
 *
 * Complemento visual do `responsivo.mjs`: aquele mede, este mostra. Serve para
 * conferir com os próprios olhos antes de publicar.
 *
 * As imagens vão para outputs/relatorios/capturas/, que não é versionado —
 * contêm dado financeiro real (Art. 4).
 */
import { readFileSync, mkdirSync } from "node:fs";
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

const destino = join(RAIZ, "outputs", "relatorios", "capturas");
mkdirSync(destino, { recursive: true });

const navegador = await chromium.launch();
const contexto = await navegador.newContext({
  ...devices["iPhone 12"],
  viewport: { width: 375, height: 780 },
  isMobile: true,
  hasTouch: true,
});
await contexto.addCookies([{ name: "financo_session", value: cookie, domain: new URL(BASE).hostname, path: "/" }]);
const pagina = await contexto.newPage();

for (const rota of ["/transacoes?periodo=tudo", "/relatorios", "/admin/aprovacoes"]) {
  await pagina.goto(`${BASE}${rota}`, { waitUntil: "domcontentloaded", timeout: 60000 });
  await pagina.waitForTimeout(1500);
  const arquivo = join(destino, `celular${rota.replace(/[/?=]/g, "-")}.png`);
  await pagina.screenshot({ path: arquivo, fullPage: true });
  console.log(`  ${rota} -> ${arquivo}`);
}

await navegador.close();
console.log("\nCapturas prontas.");
