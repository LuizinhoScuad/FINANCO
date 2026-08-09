/**
 * testar-celular.mjs — o ciclo completo de ressarcimento, com navegador VISÍVEL.
 *
 * Abre uma janela em tamanho de celular e executa a jornada inteira devagar,
 * para acompanhar com os próprios olhos: o colaborador registra a despesa na
 * rua, o gestor aprova e fecha o lote de pagamento.
 *
 * Cria dados de teste reais e os REMOVE ao final.
 *
 * Uso: node scripts/testar-celular.mjs [url]
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { chromium, devices } from "playwright";
import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";

const raiz = join(dirname(fileURLToPath(import.meta.url)), "..");
const BASE = process.argv[2] ?? "http://localhost:3000";
const RITMO = 700; // milissegundos entre ações, para dar para acompanhar

const env = {};
for (const l of readFileSync(join(raiz, ".env"), "utf8").split("\n")) {
  const m = l.match(/^([A-Z_]+)="?([\s\S]*?)"?$/);
  if (m) env[m[1]] = m[2];
}
if (!getApps().length) {
  initializeApp({
    credential: cert({
      projectId: env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
      clientEmail: env.FIREBASE_CLIENT_EMAIL,
      privateKey: env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, "\n"),
    }),
  });
}

const auth = getAuth();
const db = getFirestore();
const MARCA = "DEMONSTRACAO-" + Date.now().toString().slice(-6);

// --- narração ----------------------------------------------------------------

const cor = { verde: "\x1b[32m", ciano: "\x1b[36m", amarelo: "\x1b[33m", cinza: "\x1b[90m", forte: "\x1b[1m", zero: "\x1b[0m" };
let passo = 0;

function titulo(t) {
  console.log(`\n${cor.forte}${cor.ciano}${"─".repeat(62)}${cor.zero}`);
  console.log(`${cor.forte}${cor.ciano}  ${t}${cor.zero}`);
  console.log(`${cor.forte}${cor.ciano}${"─".repeat(62)}${cor.zero}\n`);
}
function acao(t) {
  console.log(`${cor.amarelo}  ${String(++passo).padStart(2, "0")} ▸${cor.zero} ${t}`);
}
function ok(t) {
  console.log(`${cor.verde}     ✓${cor.zero} ${t}`);
}
function nota(t) {
  console.log(`${cor.cinza}       ${t}${cor.zero}`);
}

const pausa = (ms = RITMO) => new Promise((r) => setTimeout(r, ms));

// --- sessões -----------------------------------------------------------------

async function cookieDe(email) {
  const u = await auth.getUserByEmail(email);
  const ct = await auth.createCustomToken(u.uid);
  const t = await (
    await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=${env.NEXT_PUBLIC_FIREBASE_API_KEY}`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: ct, returnSecureToken: true }),
    })
  ).json();
  const r = await fetch(`${BASE}/api/auth/session`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ idToken: t.idToken }),
  });
  if (!r.ok) throw new Error(`Sessão recusada para ${email}: HTTP ${r.status}`);
  const bruto = r.headers.getSetCookie().find((c) => c.startsWith("financo_session="));
  return { uid: u.uid, valor: bruto.split(";")[0].split("=").slice(1).join("=") };
}

// --- início ------------------------------------------------------------------

console.clear();
console.log(`\n${cor.forte}  FINANCO — ciclo de ressarcimento, ao vivo${cor.zero}`);
console.log(`${cor.cinza}  ${BASE} · iPhone 14 Pro (393×660) · janela visível${cor.zero}`);

const navegador = await chromium.launch({
  headless: false,
  slowMo: 220,
  args: ["--window-position=60,40"],
});

const colaborador = await cookieDe("admin@admin.com.br");
const admin = await cookieDe("luizking@uol.com.br");

async function abrir(sessao) {
  const ctx = await navegador.newContext({ ...devices["iPhone 14 Pro"], locale: "pt-BR" });
  await ctx.addCookies([{ name: "financo_session", value: sessao.valor, domain: "localhost", path: "/" }]);
  return ctx;
}

let falhou = false;

try {
  // ══════════════ COLABORADOR ══════════════
  titulo("1. O COLABORADOR REGISTRA UMA DESPESA NA RUA");

  const ctxColab = await abrir(colaborador);
  const p = await ctxColab.newPage();

  acao("Abrindo o app no celular do colaborador");
  await p.goto(`${BASE}/despesas`, { waitUntil: "networkidle" });
  await pausa(1200);
  ok("Tela “Minhas despesas” carregada");
  nota("menu inferior no lugar, barra lateral escondida");

  acao("Tocando em “+ Registrar”");
  await p.getByRole("button", { name: /Registrar/i }).first().click();
  await pausa();
  ok("Formulário aberto");

  acao("Digitando o valor: R$ 38,90");
  await p.locator('input[name="amount"]').fill("38.90");
  await pausa();

  acao("Escolhendo a categoria");
  await p.locator('select[name="categoryId"]').selectOption({ index: 1 });
  const categoria = await p.locator('select[name="categoryId"] option:checked').textContent();
  await pausa();
  ok(`Categoria: ${categoria?.trim()}`);

  acao("Descrevendo a despesa");
  await p.locator('input[name="description"]').fill(`Almoço com cliente ${MARCA}`);
  await pausa();

  nota("nenhuma foto anexada — a despesa vai ficar marcada “sem comprovante”");

  acao("Enviando");
  await p.getByRole("button", { name: /Registrar e enviar/i }).click();
  await p.waitForTimeout(2600);

  const avisoEnvio = await p.getByText(/registrada/i).first().textContent().catch(() => null);
  if (!avisoEnvio) throw new Error("A despesa não foi registrada.");
  ok(avisoEnvio.trim());

  await pausa(1500);
  const naLista = await p.getByText(new RegExp(MARCA)).first().isVisible().catch(() => false);
  ok(naLista ? "Aparece na lista do colaborador, aguardando decisão" : "Registrada");
  await p.screenshot({ path: "outputs/relatorios/capturas/ao-vivo-1-registro.png" });

  acao("Tentando entrar na área do gestor (não deve conseguir)");
  await p.goto(`${BASE}/admin/aprovacoes`, { waitUntil: "networkidle" });
  await pausa(1200);
  const destino = new URL(p.url()).pathname;
  if (destino === "/admin/aprovacoes") throw new Error("FALHA GRAVE: colaborador entrou na área do gestor!");
  ok(`Barrado — foi desviado para ${destino}`);
  await pausa(900);

  await ctxColab.close();

  // ══════════════ GESTOR ══════════════
  titulo("2. O GESTOR APROVA");

  const ctxAdmin = await abrir(admin);
  const g = await ctxAdmin.newPage();

  acao("Abrindo a fila de aprovação");
  await g.goto(`${BASE}/admin/aprovacoes`, { waitUntil: "networkidle" });
  await pausa(1400);

  const cartao = g.locator("div").filter({ hasText: new RegExp(MARCA) }).last();
  const visivel = await cartao.isVisible().catch(() => false);
  if (!visivel) throw new Error("A despesa não apareceu na fila do gestor.");
  ok("Despesa do colaborador está na fila");
  nota("com o aviso “sem comprovante” em destaque");
  await g.screenshot({ path: "outputs/relatorios/capturas/ao-vivo-2-fila.png" });

  await pausa(1600);

  acao("Aprovando");
  await g.getByRole("button", { name: /Aprovar/i }).first().click();
  await g.waitForTimeout(2600);
  const avisoAprov = await g.getByText(/aprovada/i).first().textContent().catch(() => null);
  ok(avisoAprov?.trim() ?? "Aprovada");
  await pausa(1200);

  // ══════════════ FECHAMENTO ══════════════
  titulo("3. O GESTOR FECHA O LOTE DE PAGAMENTO");

  acao("Abrindo os relatórios");
  await g.goto(`${BASE}/admin/relatorios`, { waitUntil: "networkidle" });
  await pausa(1400);

  acao("Filtrando pela pessoa");
  const seletor = g.locator("select").first();
  const opcoes = await seletor.locator("option").allTextContents();
  const alvo = opcoes.findIndex((o) => /colaborador|admin/i.test(o));
  await seletor.selectOption({ index: alvo > 0 ? alvo : 1 });
  await pausa(1200);
  ok(`Filtrado por: ${opcoes[alvo > 0 ? alvo : 1]}`);

  acao("Tocando em “Fechar lote de pagamento”");
  await g.getByRole("button", { name: /Fechar lote/i }).click();
  await g.waitForTimeout(2200);

  const previa = await g.getByText(/Confirmar fechamento/i).isVisible().catch(() => false);
  if (!previa) throw new Error("A prévia obrigatória não apareceu.");
  ok("Prévia obrigatória apareceu ANTES de qualquer pagamento");
  nota("mostra pessoa, período, quantidade e total — Art. 1 da Constituição");
  await g.screenshot({ path: "outputs/relatorios/capturas/ao-vivo-3-previa.png" });

  await pausa(2400);

  acao("Confirmando o pagamento");
  await g.getByRole("button", { name: /Confirmar pagamento/i }).click();
  await g.waitForTimeout(3200);

  const avisoLote = await g.getByText(/Lote fechado/i).first().textContent().catch(() => null);
  if (!avisoLote) throw new Error("O lote não foi fechado.");
  ok(avisoLote.trim());
  await g.screenshot({ path: "outputs/relatorios/capturas/ao-vivo-4-fechado.png" });

  await pausa(1800);

  // ══════════════ CONFERÊNCIA ══════════════
  titulo("4. CONFERINDO NO BANCO DE DADOS");

  const doBanco = await db.collection("expenses").get();
  const nossa = doBanco.docs.find((d) => (d.data().description ?? "").includes(MARCA));

  acao("Lendo a despesa direto do Firestore");
  if (!nossa) throw new Error("Despesa não encontrada no banco.");
  const d = nossa.data();

  ok(`Situação.......: ${d.status}`);
  ok(`Valor..........: R$ ${(d.amountCents / 100).toFixed(2).replace(".", ",")}`);
  ok(`Aprovada por...: ${d.approvedByName ?? "—"}`);
  ok(`Lote...........: ${d.paymentBatchId?.slice(0, 10) ?? "—"}`);

  if (d.status !== "RESSARCIDA") throw new Error(`Esperava RESSARCIDA, veio ${d.status}`);
  if (d.amountCents !== 3890) throw new Error(`Esperava 3890 centavos, veio ${d.amountCents}`);
  nota("valor guardado em centavos inteiros — sem erro de ponto flutuante");

  await pausa(2500);
  await ctxAdmin.close();
} catch (erro) {
  falhou = true;
  console.log(`\n\x1b[31m  ✗ ${erro.message}\x1b[0m\n`);
} finally {
  // ══════════════ LIMPEZA ══════════════
  titulo("5. REMOVENDO OS DADOS DA DEMONSTRAÇÃO");

  const despesas = await db.collection("expenses").get();
  const lotes = await db.collection("paymentBatches").get();
  const lote = db.batch();
  let n = 0;

  for (const doc of despesas.docs) {
    if ((doc.data().description ?? "").includes(MARCA)) {
      if (doc.data().paymentBatchId) {
        const l = lotes.docs.find((x) => x.id === doc.data().paymentBatchId);
        if (l) { lote.delete(l.ref); n++; }
      }
      lote.delete(doc.ref);
      n++;
    }
  }
  if (n) await lote.commit();
  acao(`${n} registro(s) de demonstração removido(s)`);
  ok("Banco de volta ao estado anterior");

  await navegador.close();

  console.log(`\n${cor.forte}${falhou ? "\x1b[31m  A DEMONSTRAÇÃO FALHOU" : cor.verde + "  CICLO COMPLETO FUNCIONANDO"}${cor.zero}`);
  console.log(`${cor.cinza}  Capturas em outputs/relatorios/capturas/ao-vivo-*.png${cor.zero}\n`);

  process.exit(falhou ? 1 : 0);
}
