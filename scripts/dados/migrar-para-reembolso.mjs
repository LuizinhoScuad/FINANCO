/**
 * migrar-lancamentos-para-reembolso.mjs
 *
 * Marca lançamentos JÁ EXISTENTES como pedido de reembolso — para o histórico
 * anterior à funcionalidade entrar na fila e nos relatórios.
 *
 * Decisão do Luiz (09/08/2026): "não há nada particular nos lançamentos".
 * Antes disso, o combinado era preservar o passado como particular; este script
 * é o que reverte aquela escolha, de forma explícita e conferível (Art. 1).
 *
 * O que NÃO toca:
 *   - receitas (INCOME): não se pede reembolso de dinheiro que entrou
 *   - lançamentos que já são pedido (`reembolso: true`)
 *   - saldo das contas: só grava campos de reembolso, nada de valor
 *
 * Uso:
 *   node scripts/migrar-lancamentos-para-reembolso.mjs                prévia, não escreve
 *   node scripts/migrar-lancamentos-para-reembolso.mjs --aplicar      grava
 *   ... --email a@b        só essa pessoa (padrão: só o administrador)
 *   ... --todos            todas as pessoas
 *   ... --desfazer         devolve a particular o que ESTE script marcou
 */
import { readFileSync } from "node:fs";
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

const aplicar = process.argv.includes("--aplicar");
const desfazer = process.argv.includes("--desfazer");
const todos = process.argv.includes("--todos");
const email = process.argv[process.argv.indexOf("--email") + 1];

/** Marca de proveniência: permite desfazer só o que este script fez. */
const MARCA = "migracao-2026-08-09";

const fmt = (v) => Number(v || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const data = (v) => (v?.toDate ? v.toDate() : new Date(v)).toLocaleDateString("pt-BR");

const usuarios = await db.collection("users").get();
const alvos = usuarios.docs.filter((d) => {
  if (todos) return true;
  if (email) return d.data().email === email;
  return d.data().role === "ADMIN" && d.data().status === "ACTIVE";
});

if (!alvos.length) {
  console.error("Nenhuma pessoa selecionada. Use --email ou --todos.");
  process.exit(1);
}

console.log(`\n${desfazer ? "DESFAZER" : aplicar ? "APLICANDO" : "PRÉVIA (nada será gravado)"}\n`);

let totalAfetado = 0;
let somaAfetada = 0;

for (const usuario of alvos) {
  const perfil = usuario.data();
  const snap = await usuario.ref.collection("transactions").get();

  const candidatos = snap.docs.filter((d) => {
    const t = d.data();
    if (desfazer) return t.origemReembolso === MARCA;
    if (t.type !== "EXPENSE") return false;
    return t.reembolso !== true;
  });

  const receitas = snap.docs.filter((d) => d.data().type === "INCOME").length;
  const jaPedido = snap.docs.filter((d) => d.data().reembolso === true).length;

  console.log(`${perfil.name} <${perfil.email}>`);
  console.log(`  lançamentos: ${snap.size}  ·  já são pedido: ${jaPedido}  ·  receitas ignoradas: ${receitas}`);
  console.log(`  ${desfazer ? "a devolver para particular" : "a marcar como pedido"}: ${candidatos.length}`);

  const soma = candidatos.reduce((s, d) => s + Number(d.data().amount || 0), 0);
  if (candidatos.length) console.log(`  soma: ${fmt(soma)}`);

  for (const d of candidatos.slice(0, 5)) {
    const t = d.data();
    console.log(`    ${data(t.date).padEnd(11)} ${fmt(t.amount).padStart(12)}  ${t.description}`);
  }
  if (candidatos.length > 5) console.log(`    ... e mais ${candidatos.length - 5}`);
  console.log("");

  totalAfetado += candidatos.length;
  somaAfetada += soma;

  if (!aplicar && !desfazer) continue;
  if (desfazer && !aplicar) continue;

  // Grava em lotes de 400 — o limite do writeBatch é 500.
  for (let i = 0; i < candidatos.length; i += 400) {
    const fatia = candidatos.slice(i, i + 400);
    const escrita = db.batch();

    for (const d of fatia) {
      escrita.update(d.ref, desfazer
        ? {
            reembolso: false,
            aprovacao: null,
            rejectionReason: null,
            approvedBy: null,
            approvedByName: null,
            approvedAt: null,
            paymentBatchId: null,
            reimbursedAt: null,
            origemReembolso: null,
            updatedAt: new Date(),
          }
        : {
            reembolso: true,
            aprovacao: "ENVIADA",
            rejectionReason: null,
            approvedBy: null,
            approvedByName: null,
            approvedAt: null,
            paymentBatchId: null,
            reimbursedAt: null,
            origemReembolso: MARCA,
            updatedAt: new Date(),
          });
    }

    await escrita.commit();
  }
}

console.log("=".repeat(60));
if (aplicar || (desfazer && aplicar)) {
  console.log(`Gravado: ${totalAfetado} lançamento(s), ${fmt(somaAfetada)}.`);
} else if (desfazer) {
  console.log(`Prévia do desfazer: ${totalAfetado} lançamento(s). Repita com --aplicar para gravar.`);
} else {
  console.log(`Prévia: ${totalAfetado} lançamento(s), ${fmt(somaAfetada)}.`);
  console.log("Nada foi gravado. Repita com --aplicar para valer.");
}
console.log("");
