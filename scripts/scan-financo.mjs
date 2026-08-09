/**
 * scan-financo.mjs — varredura de integridade do Financo.
 *
 * ⚠️ SOMENTE LEITURA. Não existe nenhuma chamada de escrita neste arquivo, e
 * isso é verificável por busca textual: nenhum `.set(`, `.update(`, `.delete(`,
 * `.add(` ou `.create(`. Como o script roda com credencial de administrador,
 * essa é a única garantia real de que ele não age (Art. 9).
 *
 * É o primeiro dos três movimentos do Guardião — determinístico e sem IA. Só
 * quando encontra algo é que vale acionar a análise.
 *
 * Uso:
 *   node scripts/scan-financo.mjs            relatório em texto
 *   node scripts/scan-financo.mjs --json     saída estruturada
 */
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";

const raiz = join(dirname(fileURLToPath(import.meta.url)), "..");
const comoJson = process.argv.includes("--json");

// --- credenciais -------------------------------------------------------------

const env = {};
try {
  for (const l of readFileSync(join(raiz, ".env"), "utf8").split("\n")) {
    const m = l.match(/^([A-Z_]+)="?([\s\S]*?)"?$/);
    if (m) env[m[1]] = m[2];
  }
} catch {
  /* em CI as credenciais vêm do ambiente */
}
const cfg = { ...env, ...process.env };

if (!getApps().length) {
  initializeApp({
    credential: cert({
      projectId: cfg.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
      clientEmail: cfg.FIREBASE_CLIENT_EMAIL,
      privateKey: cfg.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n"),
    }),
    storageBucket: cfg.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  });
}

const db = getFirestore();
const bucket = getStorage().bucket();

// --- utilidades --------------------------------------------------------------

const DIAS = (n) => n * 24 * 60 * 60 * 1000;
const achados = [];

function achar(gravidade, tipo, mensagem, detalhes = []) {
  achados.push({ gravidade, tipo, mensagem, detalhes });
}

function paraData(v) {
  if (!v) return null;
  if (v.toDate) return v.toDate();
  return new Date(v);
}

function reais(v) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);
}

// --- varredura ---------------------------------------------------------------

const usuarios = await db.collection("users").get();
const resumo = { usuarios: usuarios.size, contas: 0, lancamentos: 0, pedidos: 0, lotes: 0 };

// Pedidos de reembolso, acumulados de todo mundo, para as conferências de lote.
const pedidos = [];

// 1. Finanças pessoais, por usuário
for (const usuario of usuarios.docs) {
  const perfil = usuario.data();
  const quem = perfil.email ?? usuario.id;

  const [contas, lancamentos, categorias, orcamentos] = await Promise.all([
    usuario.ref.collection("accounts").get(),
    usuario.ref.collection("transactions").get(),
    usuario.ref.collection("categories").get(),
    usuario.ref.collection("budgets").get(),
  ]);

  resumo.contas += contas.size;
  resumo.lancamentos += lancamentos.size;

  const idsContas = new Set(contas.docs.map((d) => d.id));
  const idsCategorias = new Set(categorias.docs.map((d) => d.id));

  // 1a. Saldo === soma dos lançamentos efetivados
  for (const conta of contas.docs) {
    const saldo = Number(conta.data().balance ?? 0);

    const soma = lancamentos.docs
      .map((d) => d.data())
      .filter((l) => l.accountId === conta.id && l.status === "COMPLETED")
      .reduce((acc, l) => acc + (l.type === "INCOME" ? Number(l.amount) : -Number(l.amount)), 0);

    const diferenca = Math.round((saldo - soma) * 100) / 100;
    if (Math.abs(diferenca) >= 0.01) {
      achar(
        "CRITICA",
        "Saldo divergente",
        `${quem} · conta "${conta.data().name}": saldo ${reais(saldo)}, soma dos lançamentos ${reais(soma)}`,
        [`diferença de ${reais(diferenca)}`],
      );
    }
  }

  // 1b. Referências órfãs
  const semConta = lancamentos.docs.filter((d) => !idsContas.has(d.data().accountId));
  if (semConta.length) {
    achar("ALTA", "Lançamento sem conta", `${quem}: ${semConta.length} lançamento(s) apontam para conta inexistente`);
  }

  const semCategoria = lancamentos.docs.filter((d) => !idsCategorias.has(d.data().categoryId));
  if (semCategoria.length) {
    achar("MEDIA", "Lançamento sem categoria", `${quem}: ${semCategoria.length} lançamento(s) apontam para categoria inexistente`);
  }

  const orcamentoOrfao = orcamentos.docs.filter((d) => !idsCategorias.has(d.data().categoryId));
  if (orcamentoOrfao.length) {
    achar("BAIXA", "Orçamento sem categoria", `${quem}: ${orcamentoOrfao.length} orçamento(s) apontam para categoria inexistente`);
  }

  // 1c. Orçamento duplicado (herança do modelo antigo)
  const chaves = new Map();
  for (const o of orcamentos.docs) {
    const d = o.data();
    const chave = `${d.categoryId}-${d.month}-${d.year}`;
    chaves.set(chave, (chaves.get(chave) ?? 0) + 1);
  }
  const duplicados = [...chaves.values()].filter((n) => n > 1).length;
  if (duplicados) {
    achar("MEDIA", "Orçamento duplicado", `${quem}: ${duplicados} categoria(s) com mais de um orçamento no mesmo mês`);
  }

  // 1d. Lançamentos idênticos em menos de 2 minutos — duplo clique que escapou
  const porAssinatura = new Map();
  for (const l of lancamentos.docs) {
    const d = l.data();
    const assinatura = `${d.accountId}|${d.amount}|${d.type}|${d.description}`;
    if (!porAssinatura.has(assinatura)) porAssinatura.set(assinatura, []);
    porAssinatura.get(assinatura).push(paraData(d.createdAt)?.getTime() ?? 0);
  }
  let suspeitos = 0;
  for (const tempos of porAssinatura.values()) {
    tempos.sort();
    for (let i = 1; i < tempos.length; i++) {
      if (tempos[i] - tempos[i - 1] < 120000) suspeitos++;
    }
  }
  if (suspeitos) {
    achar("MEDIA", "Possível duplicidade", `${quem}: ${suspeitos} par(es) de lançamentos idênticos criados com menos de 2 minutos de diferença`);
  }

  // 1d-bis. Pedidos de reembolso desta pessoa
  const SITUACOES = ["ENVIADA", "APROVADA", "REJEITADA", "RESSARCIDA"];
  for (const doc of lancamentos.docs) {
    const d = doc.data();
    if (d.reembolso !== true) continue;

    resumo.pedidos++;
    pedidos.push({ id: doc.id, dono: usuario.id, quem, ...d });

    if (!SITUACOES.includes(d.aprovacao)) {
      achar("CRITICA", "Situação inválida", `Pedido ${doc.id} de ${quem} está em "${d.aprovacao}", que não existe na máquina de estados`);
      continue;
    }
    if (d.aprovacao === "APROVADA" && !d.approvedBy) {
      achar("CRITICA", "Aprovação sem autor", `Pedido ${doc.id} de ${quem} está aprovado mas não registra quem aprovou`);
    }
    if (d.aprovacao === "RESSARCIDA" && !d.paymentBatchId) {
      achar("ALTA", "Atendido fora de lote", `Pedido ${doc.id} de ${quem} consta como pago mas não pertence a nenhum lote`);
    }
    if (!(Number(d.amount) > 0)) {
      achar("ALTA", "Valor não positivo", `Pedido ${doc.id} de ${quem} tem valor ${reais(Number(d.amount) || 0)}`);
    }

    const referencia = paraData(d.createdAt) ?? new Date();
    const dias = Math.floor((Date.now() - referencia.getTime()) / DIAS(1));
    if (d.aprovacao === "ENVIADA" && dias >= 7) {
      achar("ALTA", "Pedido esperando decisão", `${quem} aguarda aprovação há ${dias} dias (${reais(Number(d.amount) || 0)})`);
    }
    if (d.aprovacao === "APROVADA" && dias >= 30) {
      achar("MEDIA", "Aprovado sem pagamento", `${quem}: aprovado há ${dias} dias e ainda não pago (${reais(Number(d.amount) || 0)})`);
    }
  }

  // 1e. Cadastro parado
  if (perfil.status === "PENDING") {
    const dias = Math.floor((Date.now() - (paraData(perfil.createdAt)?.getTime() ?? Date.now())) / DIAS(1));
    if (dias >= 7) {
      achar("ALTA", "Cadastro esquecido", `${quem} aguarda liberação há ${dias} dias`);
    }
  }
}

// 2. Lotes de pagamento — o total declarado bate com os pedidos que o compõem
const lotes = await db.collection("paymentBatches").get();
resumo.lotes = lotes.size;
const idsLotes = new Set(lotes.docs.map((d) => d.id));

for (const p of pedidos) {
  if (p.paymentBatchId && !idsLotes.has(p.paymentBatchId)) {
    achar("ALTA", "Lote inexistente", `Pedido ${p.id} de ${p.quem} aponta para o lote ${p.paymentBatchId}, que não existe`);
  }
}

for (const lote of lotes.docs) {
  const l = lote.data();
  const doLote = pedidos.filter((p) => p.paymentBatchId === lote.id);
  const somaCentavos = doLote.reduce((s, p) => s + Math.round((Number(p.amount) + Number.EPSILON) * 100), 0);

  if (doLote.length !== Number(l.expenseCount)) {
    achar("ALTA", "Lote inconsistente", `Lote de ${l.userName}: declara ${l.expenseCount} pedido(s), encontrei ${doLote.length}`);
  }
  if (somaCentavos !== Number(l.totalCents)) {
    achar("CRITICA", "Total do lote divergente", `Lote de ${l.userName}: declara ${reais(Number(l.totalCents) / 100)}, soma dos pedidos ${reais(somaCentavos / 100)}`);
  }
}

// 3. Comprovantes
const [arquivos] = await bucket.getFiles({ prefix: "receipts/" });
const caminhosNoStorage = new Set(arquivos.map((a) => a.name));

let semArquivo = 0;
const urlsUsadas = new Set();
for (const usuario of usuarios.docs) {
  const lancamentos = await usuario.ref.collection("transactions").get();
  for (const l of lancamentos.docs) {
    const url = l.data().receiptUrl;
    if (!url) continue;
    const caminho = decodeURIComponent(url.split("/o/")[1]?.split("?")[0] ?? "");
    urlsUsadas.add(caminho);
    if (caminho && !caminhosNoStorage.has(caminho)) semArquivo++;
  }
}
if (semArquivo) {
  achar("ALTA", "Comprovante perdido", `${semArquivo} registro(s) apontam para arquivo que não está mais no Storage`);
}

const orfaos = arquivos.filter((a) => !urlsUsadas.has(a.name));
if (orfaos.length) {
  const mb = orfaos.reduce((s, a) => s + Number(a.metadata.size ?? 0), 0) / 1024 / 1024;
  achar("BAIXA", "Arquivo órfão", `${orfaos.length} arquivo(s) no Storage sem registro correspondente (${mb.toFixed(1)} MB)`);
}

// --- saída -------------------------------------------------------------------

const ORDEM = { CRITICA: 0, ALTA: 1, MEDIA: 2, BAIXA: 3 };
achados.sort((a, b) => ORDEM[a.gravidade] - ORDEM[b.gravidade]);

const relatorio = {
  geradoEm: new Date().toISOString(),
  projeto: cfg.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  resumo,
  totalAchados: achados.length,
  porGravidade: {
    CRITICA: achados.filter((a) => a.gravidade === "CRITICA").length,
    ALTA: achados.filter((a) => a.gravidade === "ALTA").length,
    MEDIA: achados.filter((a) => a.gravidade === "MEDIA").length,
    BAIXA: achados.filter((a) => a.gravidade === "BAIXA").length,
  },
  achados,
};

if (comoJson) {
  console.log(JSON.stringify(relatorio, null, 2));
} else {
  const SIMBOLO = { CRITICA: "🔴", ALTA: "🟠", MEDIA: "🟡", BAIXA: "⚪" };

  console.log(`\nVARREDURA DE INTEGRIDADE — FINANCO`);
  console.log("═".repeat(66));
  console.log(`Projeto....: ${relatorio.projeto}`);
  console.log(`Gerado em..: ${new Date().toLocaleString("pt-BR")}`);
  console.log(
    `Inventário.: ${resumo.usuarios} usuário(s) · ${resumo.contas} conta(s) · ` +
      `${resumo.lancamentos} lançamento(s) · ${resumo.pedidos} pedido(s) · ${resumo.lotes} lote(s)`,
  );
  console.log("═".repeat(66));

  if (achados.length === 0) {
    console.log("\n✓ Nenhuma inconsistência encontrada.\n");
  } else {
    console.log(
      `\n${achados.length} achado(s): ` +
        Object.entries(relatorio.porGravidade)
          .filter(([, n]) => n > 0)
          .map(([g, n]) => `${SIMBOLO[g]} ${n} ${g.toLowerCase()}`)
          .join(" · "),
    );
    console.log();
    for (const a of achados) {
      console.log(`${SIMBOLO[a.gravidade]} [${a.tipo}] ${a.mensagem}`);
      for (const d of a.detalhes) console.log(`     ${d}`);
    }
    console.log();
  }
}

// Grava o relatório para o Observador ler depois.
const destino = join(raiz, "outputs", "relatorios");
mkdirSync(destino, { recursive: true });
const dia = new Date().toISOString().slice(0, 10);
writeFileSync(join(destino, `scan-${dia}.json`), JSON.stringify(relatorio, null, 2), "utf8");

if (!comoJson) console.log(`Relatório salvo em outputs/relatorios/scan-${dia}.json\n`);

// Código de saída: falha só quando há achado crítico — serve de portão em CI.
process.exit(relatorio.porGravidade.CRITICA > 0 ? 1 : 0);
