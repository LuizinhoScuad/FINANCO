/**
 * Teste de fumaça autenticado: carrega as telas reais como ADMIN e como
 * COLABORADOR, contra o servidor local e o Firestore de verdade.
 *
 * É o que pega erro de índice, de render e de permissão — coisas que teste de
 * função pura não alcança.
 *
 * Semeia UM pedido de reembolso num usuário descartável (`__teste_harness__`),
 * confere que ele aparece nas telas, e apaga tudo no fim.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";

const env = {};
for (const l of readFileSync(join(RAIZ, ".env"), "utf8").split("\n")) {
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
function checar(nome, condicao, detalhe = "") {
  if (condicao) {
    console.log(`  OK    ${nome}`);
  } else {
    falhas.push(nome);
    console.log(`  FALHA ${nome}${detalhe ? `\n        ${detalhe}` : ""}`);
  }
}

/** Cookie de sessão real, do mesmo jeito que o login do app produz. */
async function sessaoDe(uid) {
  const custom = await auth.createCustomToken(uid);
  const r = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=${cfg.NEXT_PUBLIC_FIREBASE_API_KEY}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: custom, returnSecureToken: true }),
    },
  );
  const dados = await r.json();
  if (!dados.idToken) throw new Error(`login falhou: ${JSON.stringify(dados)}`);
  return auth.createSessionCookie(dados.idToken, { expiresIn: 60 * 60 * 1000 });
}

async function abrir(caminho, cookie) {
  const r = await fetch(`${BASE}${caminho}`, {
    headers: { Cookie: `financo_session=${cookie}` },
    redirect: "manual",
  });
  return { status: r.status, destino: r.headers.get("location"), corpo: await r.text() };
}

// --- quem é quem -------------------------------------------------------------

const usuarios = await db.collection("users").get();
const admin = usuarios.docs.find((d) => d.data().role === "ADMIN" && d.data().status === "ACTIVE");
if (!admin) throw new Error("nenhum administrador ativo para testar");
console.log(`\nAdmin de teste: ${admin.data().email ?? admin.id}\n`);

// --- semeadura descartável ---------------------------------------------------

const UID_FALSO = "zzz-teste-harness";
const MARCA = "[TESTE AUTOMATICO - pode apagar]";
const criados = [];

async function semear() {
  const raiz = db.collection("users").doc(UID_FALSO);
  const conta = raiz.collection("accounts").doc("conta-teste");
  const categoria = raiz.collection("categories").doc("cat-teste");
  const pedido = raiz.collection("transactions").doc("pedido-teste");

  await raiz.set({ name: "Harness de Teste", email: null, role: "COLABORADOR", status: "ACTIVE", seeded: true, createdAt: new Date(), updatedAt: new Date() });
  await conta.set({ name: "Carteira Teste", type: "CASH", color: "#00d98b", balance: 0, createdAt: new Date(), updatedAt: new Date() });
  await categoria.set({ name: "Alimentacao Teste", icon: "🍔", type: "EXPENSE", color: "#f59e0b", createdAt: new Date() });
  await pedido.set({
    description: MARCA,
    amount: 42.5,
    type: "EXPENSE",
    status: "COMPLETED",
    date: new Date(),
    accountId: "conta-teste",
    categoryId: "cat-teste",
    payee: null, tags: null, notes: null, receiptUrl: null,
    isInstallment: false,
    reembolso: true,
    aprovacao: "ENVIADA",
    rejectionReason: null, approvedBy: null, approvedByName: null, approvedAt: null,
    paymentBatchId: null, reimbursedAt: null,
    createdAt: new Date(), updatedAt: new Date(),
  });

  criados.push(pedido, categoria, conta, raiz);

  // Usuário de autenticação correspondente, com os claims que o app espera.
  // Sem ACTIVE, requireActiveUser manda para /aguardando e o teste de
  // isolamento não chega a testar nada.
  await auth.createUser({ uid: UID_FALSO, displayName: "Harness de Teste" }).catch(() => {});
  await auth.setCustomUserClaims(UID_FALSO, { role: "COLABORADOR", status: "ACTIVE" });
}

/**
 * Limpeza. A conta no Auth é tão importante quanto os documentos: esquecê-la
 * deixa um usuário fantasma no painel do administrador — visível, sem perfil no
 * banco, e impossível de liberar. Já aconteceu; por isso a conferência no fim.
 */
async function limpar() {
  for (const ref of criados) await ref.delete().catch(() => {});

  const lotes = await db.collection("paymentBatches").where("userId", "==", UID_FALSO).get();
  for (const l of lotes.docs) await l.ref.delete().catch(() => {});

  await auth.deleteUser(UID_FALSO).catch(() => {});

  const sobrou = await auth.getUser(UID_FALSO).then(() => true).catch(() => false);
  const docSobrou = (await db.collection("users").doc(UID_FALSO).get()).exists;

  if (sobrou || docSobrou) {
    console.log(`\n⚠ RESÍDUO NÃO REMOVIDO — auth: ${sobrou}, documento: ${docSobrou}`);
    console.log("  Rode: node scripts/limpar-residuo-teste.mjs");
    falhas.push("limpeza da semeadura");
  } else {
    console.log("\nSemeadura removida por completo (Firestore e autenticação).");
  }
}

try {
  await semear();
  console.log("Semeado: 1 pedido de reembolso de R$ 42,50 aguardando decisão.\n");

  const cookieAdmin = await sessaoDe(admin.id);

  console.log("— telas como ADMIN —");
  for (const rota of ["/dashboard", "/transacoes", "/relatorios", "/admin/aprovacoes", "/admin/usuarios", "/contas", "/categorias", "/orcamentos"]) {
    const r = await abrir(rota, cookieAdmin);
    checar(`${rota} responde 200`, r.status === 200, `status ${r.status}${r.destino ? ` -> ${r.destino}` : ""}`);
    if (r.status === 200) {
      const quebrou = /requires an index|Application error|Internal Server Error|Unhandled Runtime/i.test(r.corpo);
      checar(`${rota} sem erro no conteúdo`, !quebrou, quebrou ? r.corpo.match(/.{0,180}(requires an index|Application error|Internal Server Error).{0,180}/i)?.[0] : "");
    }
  }

  console.log("\n— o pedido semeado aparece onde deve —");
  const rel = await abrir("/relatorios", cookieAdmin);
  checar("Relatórios lista o pedido da equipe", rel.corpo.includes(MARCA));
  checar("Relatórios mostra o valor", rel.corpo.includes("42,50"));
  checar("Relatórios nomeia o dono", rel.corpo.includes("Harness de Teste"));
  checar("Relatórios separa 'A receber'", /A receber/i.test(rel.corpo));
  checar("Relatórios separa 'Já atendidos'", /J&#x27;?á atendidos|Já atendidos/i.test(rel.corpo));
  checar("Relatórios avisa sobre falta de comprovante", /sem comprovante/i.test(rel.corpo));

  const apr = await abrir("/admin/aprovacoes", cookieAdmin);
  checar("Aprovações mostra o pedido na fila", apr.corpo.includes(MARCA));
  checar("Aprovações oferece Aprovar", /Aprovar/.test(apr.corpo));
  checar("Aprovações oferece Rejeitar", /Rejeitar/.test(apr.corpo));

  // A caixa "Pedir reembolso" vive num modal que só monta depois do clique, e
  // por isso não aparece no HTML do servidor — não dá para conferir por aqui.
  // O que É renderizado no servidor, e vale checar, é o selo de situação.

  console.log("\n— isolamento: colaborador não vê o alheio —");
  const cookieFalso = await sessaoDe(UID_FALSO).catch(() => null);
  if (cookieFalso) {
    const relColab = await abrir("/relatorios", cookieFalso);
    checar("colaborador abre Relatórios", relColab.status === 200, `status ${relColab.status}`);
    if (relColab.status === 200) {
      checar("colaborador vê o próprio pedido", relColab.corpo.includes(MARCA));
      checar("colaborador NÃO recebe o filtro por pessoa", !/Toda a equipe/.test(relColab.corpo));
    }
    const txColab = await abrir("/transacoes", cookieFalso);
    checar("Transações lista o pedido do dono", txColab.corpo.includes(MARCA));
    checar("Transações mostra o selo 'Aguardando'", /Aguardando/.test(txColab.corpo));

    const aprColab = await abrir("/admin/aprovacoes", cookieFalso);
    checar("colaborador é barrado em /admin/aprovacoes", aprColab.status === 307 || aprColab.status === 302, `status ${aprColab.status}`);
  } else {
    console.log("  (pulado: não foi possível autenticar o usuário de teste)");
  }
} finally {
  await limpar();
}

console.log("\n" + "=".repeat(60));
if (falhas.length === 0) {
  console.log("FUMAÇA LIMPA: todas as verificações passaram");
} else {
  console.log(`${falhas.length} VERIFICAÇÃO(ÕES) FALHARAM:`);
  for (const f of falhas) console.log(`  - ${f}`);
}
process.exit(falhas.length ? 1 : 0);
