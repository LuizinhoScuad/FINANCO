/**
 * Compara o estado atual do banco com o backup mais recente e aponta o que
 * sumiu ou apareceu.
 *
 * Existe para responder à pergunta que sempre surge depois de uma migração:
 * "perdi alguma coisa?". Somente leitura.
 */
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const env = {};
for (const l of readFileSync(join(RAIZ, ".env"), "utf8").split(/\r?\n/)) {
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

const PASTA = process.argv[2] ?? "C:/Sistemas/financo-backups";
const arquivo = readdirSync(PASTA).filter((f) => f.endsWith(".json")).sort().pop();
if (!arquivo) {
  console.error(`Nenhum backup em ${PASTA}`);
  process.exit(1);
}
const backup = JSON.parse(readFileSync(join(PASTA, arquivo), "utf8"));
console.log(`\nBackup de referência: ${arquivo}`);
console.log(`Gerado em: ${backup.geradoEm}\n`);

let sumiramTotal = 0;
const usuarios = await db.collection("users").get();

for (const u of usuarios.docs) {
  const atual = await u.ref.collection("transactions").get();
  const registro =
    backup.usuarios.find((x) => x.uid === u.id) ??
    backup.usuarios.find((x) => x.email && x.email === u.data().email);
  const antigos = registro?.transactions ?? [];

  if (!antigos.length && !atual.size) continue;

  const idsAtuais = new Set(atual.docs.map((d) => d.id));
  const sumidos = antigos.filter((t) => !idsAtuais.has(t.id));
  const novos = atual.docs.filter((d) => !antigos.some((t) => t.id === d.id));

  console.log(`${u.data().email ?? u.id}: backup ${antigos.length} -> banco ${atual.size}`);
  for (const s of sumidos) {
    console.log(`   SUMIU  ${s.id}  R$ ${s.amount}  ${String(s.description).slice(0, 45)}`);
  }
  for (const n of novos) {
    console.log(`   NOVO   ${n.id}  R$ ${n.data().amount}  ${String(n.data().description).slice(0, 45)}`);
  }
  if (!sumidos.length && !novos.length) console.log("   nenhuma diferença de conteúdo");
  sumiramTotal += sumidos.length;
  console.log("");
}

console.log("=".repeat(60));
console.log(sumiramTotal === 0 ? "NADA SUMIU desde o backup." : `ATENÇÃO: ${sumiramTotal} lançamento(s) sumiram desde o backup.`);
