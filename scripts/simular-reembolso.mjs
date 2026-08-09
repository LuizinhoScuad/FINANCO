/**
 * simular-reembolso.mjs — cria pedidos de reembolso de MENTIRA para você
 * percorrer o fluxo inteiro na tela: fila, aprovação, fechamento de lote e
 * comprovante em PDF.
 *
 * Os pedidos nascem com situação `PENDING` no controle pessoal, de propósito:
 * assim NÃO mexem no saldo das suas contas. E todos carregam a marca
 * `[SIMULAÇÃO]` na descrição, que é como o `--limpar` os encontra depois.
 *
 * Uso:
 *   node scripts/simular-reembolso.mjs             cria a simulação
 *   node scripts/simular-reembolso.mjs --limpar    apaga tudo o que criou
 *   node scripts/simular-reembolso.mjs --email x@y  escolhe a pessoa
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), "..");

const env = {};
for (const linha of readFileSync(join(RAIZ, ".env"), "utf8").split(/\r?\n/)) {
  const m = linha.match(/^([A-Z_]+)="?([\s\S]*?)"?$/);
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

const MARCA = "[SIMULAÇÃO]";
const limpar = process.argv.includes("--limpar");
const emailPedido = process.argv[process.argv.indexOf("--email") + 1];

// --- quem ---------------------------------------------------------------------

const usuarios = await db.collection("users").get();
const alvo =
  usuarios.docs.find((d) => emailPedido && d.data().email === emailPedido) ??
  usuarios.docs.find((d) => d.data().role === "ADMIN" && d.data().status === "ACTIVE");

if (!alvo) {
  console.error("Não encontrei a pessoa. Use --email para escolher.");
  process.exit(1);
}
const perfil = alvo.data();
console.log(`\nPessoa: ${perfil.name} <${perfil.email}>  (${perfil.role})\n`);

const transacoes = alvo.ref.collection("transactions");

// --- limpeza ------------------------------------------------------------------

if (limpar) {
  const todas = await transacoes.get();
  const simuladas = todas.docs.filter((d) => String(d.data().description ?? "").includes(MARCA));

  for (const d of simuladas) await d.ref.delete();

  const lotes = await db.collection("paymentBatches").where("userId", "==", alvo.id).get();
  let apagados = 0;
  for (const l of lotes.docs) {
    // Só os lotes que nasceram da simulação — reconhecidos pela marca.
    if (l.data().simulacao === true) {
      await l.ref.delete();
      apagados++;
    }
  }

  console.log(`Removidos: ${simuladas.length} pedido(s) simulado(s) e ${apagados} lote(s).`);
  console.log("Nada mais da simulação restou.\n");
  process.exit(0);
}

// --- semeadura ----------------------------------------------------------------

const [contas, categorias] = await Promise.all([
  alvo.ref.collection("accounts").get(),
  alvo.ref.collection("categories").get(),
]);

const conta = contas.docs[0];
if (!conta) {
  console.error("Essa pessoa não tem nenhuma conta cadastrada. Crie uma em Contas e rode de novo.");
  process.exit(1);
}

const despesas = categorias.docs.filter((d) => d.data().type === "EXPENSE");
const categoriaPor = (nome) =>
  despesas.find((d) => String(d.data().name).toLowerCase().includes(nome))?.id ?? despesas[0]?.id;

if (!despesas.length) {
  console.error("Essa pessoa não tem categorias de despesa. Abra o app uma vez para semear.");
  process.exit(1);
}

const hoje = new Date();
const diasAtras = (n) => new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate() - n, 12, 0, 0);

const PEDIDOS = [
  { desc: "Almoço com cliente — Rubaiyat", valor: 148.9, dias: 12, cat: "aliment", recibo: true },
  { desc: "Estacionamento — visita Eataly", valor: 32.0, dias: 10, cat: "transp", recibo: true },
  { desc: "Combustível — entrega Guarulhos", valor: 210.45, dias: 8, cat: "transp", recibo: true },
  { desc: "Pedágio — rodada de visitas", valor: 27.6, dias: 6, cat: "transp", recibo: false },
  { desc: "Café da manhã com fornecedor", valor: 63.3, dias: 3, cat: "aliment", recibo: true },
];

const escrita = db.batch();
for (const [i, p] of PEDIDOS.entries()) {
  escrita.set(transacoes.doc(`simulacao-${i + 1}`), {
    description: `${MARCA} ${p.desc}`,
    amount: p.valor,
    type: "EXPENSE",
    // PENDING de propósito: não encosta no saldo das contas reais.
    status: "PENDING",
    date: diasAtras(p.dias),
    accountId: conta.id,
    categoryId: categoriaPor(p.cat),
    payee: null,
    tags: "simulacao",
    notes: "Registro de simulação criado para testar o fluxo de reembolso.",
    receiptUrl: p.recibo ? "https://exemplo.invalido/recibo-simulado.jpg" : null,
    isInstallment: false,
    installment: null,
    totalInstallments: null,
    reembolso: true,
    aprovacao: "ENVIADA",
    rejectionReason: null,
    approvedBy: null,
    approvedByName: null,
    approvedAt: null,
    paymentBatchId: null,
    reimbursedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  });
}
await escrita.commit();

const total = PEDIDOS.reduce((s, p) => s + p.valor, 0);
const fmt = (v) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

console.log(`Criados ${PEDIDOS.length} pedidos aguardando decisão, somando ${fmt(total)}:`);
for (const p of PEDIDOS) {
  console.log(`  ${fmt(p.valor).padStart(12)}  ${p.desc}${p.recibo ? "" : "   (sem comprovante)"}`);
}
console.log(`
Datas: entre ${diasAtras(12).toLocaleDateString("pt-BR")} e ${diasAtras(3).toLocaleDateString("pt-BR")}.

Agora, no app:
  1. Aprovações  -> a fila mostra os 5. Aprove alguns, rejeite um com motivo.
  2. Fechar pagamento -> escolha a pessoa e o período, "Ver prévia", confirme.
  3. Relatórios  -> veja "Já atendidos" separado de "A receber", e baixe PDF/XLSX.

Para apagar tudo depois:
  node scripts/simular-reembolso.mjs --limpar
`);
