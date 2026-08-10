/**
 * Confere o filtro "todos os períodos" da tela de Transações contra o servidor
 * rodando, com sessão real.
 *
 * O caso que motivou: lançamento espalhado no tempo fazia a tela abrir vazia no
 * mês corrente, sem nenhuma pista de que havia histórico.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
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

const falhas = [];
const checar = (nome, ok, detalhe = "") => {
  console.log(ok ? `  OK    ${nome}` : `  FALHA ${nome}${detalhe ? `\n        ${detalhe}` : ""}`);
  if (!ok) falhas.push(nome);
};

const usuarios = await db.collection("users").get();
const alvo = usuarios.docs.find((d) => d.data().role === "ADMIN" && d.data().status === "ACTIVE");
const lancamentos = await alvo.ref.collection("transactions").get();

const agora = new Date();
const doMesCorrente = lancamentos.docs.filter((d) => {
  const dt = d.data().date?.toDate?.() ?? new Date(d.data().date);
  return dt.getMonth() === agora.getMonth() && dt.getFullYear() === agora.getFullYear();
}).length;

console.log(`\nPessoa: ${alvo.data().email}`);
console.log(`Lançamentos no total: ${lancamentos.size}  ·  no mês corrente: ${doMesCorrente}\n`);

const custom = await auth.createCustomToken(alvo.id);
const login = await fetch(
  `https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=${cfg.NEXT_PUBLIC_FIREBASE_API_KEY}`,
  { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token: custom, returnSecureToken: true }) },
).then((r) => r.json());
const cookie = await auth.createSessionCookie(login.idToken, { expiresIn: 3600000 });

const abrir = async (caminho) => {
  const r = await fetch(`${BASE}${caminho}`, { headers: { Cookie: `financo_session=${cookie}` }, redirect: "manual" });
  return { status: r.status, corpo: await r.text() };
};

/** O contador do cabeçalho: "N registro(s) · <período>". */
const contar = (html) => Number(html.match(/(\d+)\s*<!-- -->\s*registro\(s\)/)?.[1] ?? html.match(/(\d+) registro\(s\)/)?.[1] ?? -1);

console.log("— mês corrente (comportamento antigo) —");
const mes = await abrir("/transacoes");
checar("abre 200", mes.status === 200, `status ${mes.status}`);
checar(`conta ${doMesCorrente} do mês`, contar(mes.corpo) === doMesCorrente, `veio ${contar(mes.corpo)}`);
checar("oferece o botão 'Todos os períodos'", /Todos os per/i.test(mes.corpo));

console.log("\n— todos os períodos —");
const todos = await abrir("/transacoes?periodo=tudo");
checar("abre 200", todos.status === 200, `status ${todos.status}`);
checar(`conta os ${lancamentos.size} do histórico`, contar(todos.corpo) === lancamentos.size, `veio ${contar(todos.corpo)}`);
checar("rotula 'Todo o período'", /Todo o per[íi]odo/i.test(todos.corpo));
checar("oferece a volta ao mês", /Voltar ao m/i.test(todos.corpo));
checar("não mostra 'Nenhuma transação'", !/Nenhuma transação encontrada/i.test(todos.corpo));

console.log("\n" + "=".repeat(60));
console.log(falhas.length ? `${falhas.length} FALHA(S): ${falhas.join(", ")}` : "FILTRO DE PERÍODO OK");
process.exit(falhas.length ? 1 : 0);
