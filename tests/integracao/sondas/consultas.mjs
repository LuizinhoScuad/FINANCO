/**
 * Exercita, contra o Firestore real, TODAS as consultas novas do reembolso.
 *
 * Somente leitura. Serve para descobrir índice faltando antes de a tela quebrar
 * na mão do usuário — o erro do Firestore para índice ausente é explícito.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");

import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";


const env = {};
for (const l of readFileSync(join(RAIZ, ".env"), "utf8").split("\n")) {
  const m = l.match(/^([A-Z_]+)="?([\s\S]*?)"?$/);
  if (m) env[m[1]] = m[2];
}
const cfg = { ...env, ...process.env };

if (!getApps().length) {
  initializeApp({
    credential: cert({
      projectId: cfg.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
      clientEmail: cfg.FIREBASE_CLIENT_EMAIL,
      privateKey: cfg.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n"),
    }),
  });
}

const db = getFirestore();
const falhas = [];

async function prova(nome, fn) {
  try {
    const r = await fn();
    console.log(`  OK   ${nome} -> ${r}`);
  } catch (e) {
    const msg = String(e.message || e).split("\n")[0];
    falhas.push({ nome, msg });
    console.log(`  FALHA ${nome}`);
    console.log(`        ${msg}`);
  }
}

const usuarios = await db.collection("users").get();
const algum = usuarios.docs[0]?.id;
console.log(`\nProjeto: ${cfg.NEXT_PUBLIC_FIREBASE_PROJECT_ID}`);
console.log(`Usuários: ${usuarios.size}${algum ? ` (amostra: ${algum})` : ""}\n`);

const desde = new Date("2020-01-01T00:00:00");
const ate = new Date("2030-12-31T23:59:59");
const tx = (uid) => db.collection("users").doc(uid).collection("transactions");
const grupo = () => db.collectionGroup("transactions");

console.log("— consultas do DONO (subcoleção) —");
if (algum) {
  await prova("pedidos do usuário, sem data", async () =>
    (await tx(algum).where("reembolso", "==", true).get()).size + " doc(s)");
  await prova("pedidos do usuário, com janela de data", async () =>
    (await tx(algum).where("reembolso", "==", true).where("date", ">=", desde).where("date", "<=", ate).get()).size + " doc(s)");
  await prova("contador rejeitados do usuário", async () =>
    (await tx(algum).where("reembolso", "==", true).where("aprovacao", "==", "REJEITADA").count().get()).data().count + "");
  await prova("prévia de lote (aprovados na janela)", async () =>
    (await tx(algum).where("reembolso", "==", true).where("date", ">=", desde).where("date", "<=", ate).get()).size + " doc(s)");
}

console.log("\n— consultas do GESTOR (collectionGroup) —");
await prova("fila de aprovação (reembolso + aprovacao)", async () =>
  (await grupo().where("reembolso", "==", true).where("aprovacao", "==", "ENVIADA").get()).size + " doc(s)");
await prova("contador da fila", async () =>
  (await grupo().where("reembolso", "==", true).where("aprovacao", "==", "ENVIADA").count().get()).data().count + "");
await prova("relatório da equipe, sem data", async () =>
  (await grupo().where("reembolso", "==", true).get()).size + " doc(s)");
await prova("relatório da equipe, com janela de data", async () =>
  (await grupo().where("reembolso", "==", true).where("date", ">=", desde).where("date", "<=", ate).get()).size + " doc(s)");

console.log("\n— lotes —");
await prova("listar lotes", async () => (await db.collection("paymentBatches").get()).size + " doc(s)");

console.log("\n" + "=".repeat(60));
if (falhas.length === 0) {
  console.log("TODAS AS CONSULTAS PASSARAM");
} else {
  console.log(`${falhas.length} CONSULTA(S) FALHARAM:`);
  for (const f of falhas) console.log(`  - ${f.nome}\n    ${f.msg}`);
}
process.exit(falhas.length ? 1 : 0);
