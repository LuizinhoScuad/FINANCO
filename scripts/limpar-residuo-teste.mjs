/**
 * limpar-residuo-teste.mjs — remove semeadura de teste esquecida no banco.
 *
 * Existe por um caso real: um teste apagou o documento do Firestore mas
 * esqueceu a conta no Firebase Auth. Sobrou um usuário fantasma no painel do
 * administrador — visível, sem perfil, e impossível de liberar pela tela.
 *
 * Só toca em identificadores com o prefixo `zzz-teste-` (HARNESS §3). Nenhuma
 * conta real entra no alcance deste script, o que é o que torna seguro rodá-lo
 * a qualquer momento.
 *
 * Uso:  node scripts/limpar-residuo-teste.mjs
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), "..");
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
const auth = getAuth();
const db = getFirestore();

console.log("\n--- usuários no Firebase Auth ---");
const lista = await auth.listUsers(1000);
for (const u of lista.users) {
  const doc = await db.collection("users").doc(u.uid).get();
  const marca = u.uid.startsWith("zzz-teste") ? "  <== RESÍDUO DE TESTE" : "";
  console.log(`  ${u.uid}  ${u.email ?? u.displayName ?? "(sem e-mail)"}  perfil no banco: ${doc.exists ? "sim" : "NÃO"}${marca}`);
}

console.log("\n--- removendo resíduo de teste ---");
let n = 0;
for (const u of lista.users) {
  if (!u.uid.startsWith("zzz-teste")) continue;
  await auth.deleteUser(u.uid).catch((e) => console.log(`   auth: ${e.message}`));
  const raiz = db.collection("users").doc(u.uid);
  for (const sub of ["transactions", "accounts", "categories", "budgets"]) {
    const s = await raiz.collection(sub).get();
    for (const d of s.docs) await d.ref.delete();
  }
  await raiz.delete().catch(() => {});
  const lotes = await db.collection("paymentBatches").where("userId", "==", u.uid).get();
  for (const l of lotes.docs) await l.ref.delete();
  console.log(`   removido: ${u.uid}`);
  n++;
}
console.log(n === 0 ? "   nada a remover." : `   ${n} removido(s).`);

console.log("\n--- conferindo ---");
const depois = await auth.listUsers(1000);
for (const u of depois.users) {
  const doc = await db.collection("users").doc(u.uid).get();
  console.log(`  ${u.uid}  ${u.email ?? "(sem e-mail)"}  perfil: ${doc.exists ? "sim" : "NÃO"}`);
}
