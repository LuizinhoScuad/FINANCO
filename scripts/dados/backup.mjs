/**
 * backup-dados.mjs — cópia completa dos dados, fora do repositório.
 *
 * Rede de segurança antes de qualquer migração (Art. 1 e Art. 10). Somente
 * leitura: não existe nenhuma escrita neste arquivo, de propósito.
 *
 * Uso:
 *   node scripts/backup-dados.mjs                   todos os usuários
 *   node scripts/backup-dados.mjs <uid>             apenas um
 *
 * O arquivo sai em ../financo-backups/ — irmão do projeto, nunca dentro dele,
 * para não haver chance de vazar no Git (Art. 4).
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";
import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

const raiz = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

const env = {};
try {
  for (const l of readFileSync(join(raiz, ".env"), "utf8").split("\n")) {
    const m = l.match(/^([A-Z_]+)="?([\s\S]*?)"?$/);
    if (m) env[m[1]] = m[2];
  }
} catch {
  /* em produção as credenciais vêm do ambiente */
}

const cfg = { ...env, ...process.env };

if (!getApps().length) {
  initializeApp(
    cfg.FIREBASE_CLIENT_EMAIL && cfg.FIREBASE_PRIVATE_KEY
      ? {
          credential: cert({
            projectId: cfg.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
            clientEmail: cfg.FIREBASE_CLIENT_EMAIL,
            privateKey: cfg.FIREBASE_PRIVATE_KEY.replace(/\\n/g, "\n"),
          }),
        }
      : { projectId: cfg.NEXT_PUBLIC_FIREBASE_PROJECT_ID },
  );
}

const db = getFirestore();
const SUBCOLECOES = ["accounts", "categories", "budgets", "transactions"];
const alvo = process.argv[2];

const usuarios = alvo
  ? [await db.collection("users").doc(alvo).get()]
  : (await db.collection("users").get()).docs;

const backup = { geradoEm: new Date().toISOString(), projeto: cfg.NEXT_PUBLIC_FIREBASE_PROJECT_ID, usuarios: [] };

for (const doc of usuarios) {
  if (!doc.exists) continue;

  const registro = { uid: doc.id, perfil: doc.data() };
  let total = 0;

  for (const nome of SUBCOLECOES) {
    const snap = await doc.ref.collection(nome).get();
    registro[nome] = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    total += snap.size;
  }

  backup.usuarios.push(registro);
  console.log(`  ${registro.perfil?.email ?? doc.id}: ${total} registros`);
}

const destino = resolve(raiz, "..", "financo-backups");
mkdirSync(destino, { recursive: true });

const carimbo = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
const arquivo = join(destino, `backup-${carimbo}.json`);
writeFileSync(arquivo, JSON.stringify(backup, null, 2), "utf8");

const kb = (Buffer.byteLength(JSON.stringify(backup)) / 1024).toFixed(0);
console.log(`\n✓ Backup salvo: ${arquivo}  (${kb} KB, ${backup.usuarios.length} usuário(s))\n`);
