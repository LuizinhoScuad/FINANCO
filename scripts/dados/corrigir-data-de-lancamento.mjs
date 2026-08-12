/**
 * corrigir-data-de-lancamento.mjs
 *
 * Corrige a DATA de um lançamento já gravado — inclusive de um pedido que já
 * foi pago, que a tela recusa alterar de propósito (Art. 2).
 *
 * Por que existe: em 12/08/2026 apareceu um lançamento de R$ 37,00 com o ano
 * errado. Ele foi pago junto com os outros, mas o gasto ficou carimbado fora de
 * 2026 — então caía fora de qualquer relatório recortado por período. Pedido
 * pago é lastro de pagamento e nenhuma tela o altera; consertar o carimbo é ato
 * deliberado, com prévia, cópia e caminho de volta (Art. 1, HARNESS §5).
 *
 * O que NÃO toca:
 *   - valor, tipo, situação de aprovação, lote de pagamento
 *   - saldo das contas: o saldo não depende da data, só de valor/tipo/status
 *
 * A data nova é gravada ao MEIO-DIA UTC, como manda src/lib/core/datas.ts — é o
 * que garante que o dia digitado seja o dia exibido.
 *
 * Uso:
 *   node scripts/dados/corrigir-data-de-lancamento.mjs --valor 37 --para 2026-05-05
 *       prévia: lista os candidatos e não grava nada
 *
 *   ... --email pessoa@empresa.com     restringe a busca a uma pessoa
 *   ... --id <docId> --uid <uid>       alvo exato, sem ambiguidade
 *   ... --aplicar                      grava (exige alvo único)
 *   ... --desfazer                     lista o que este script mudou
 *   ... --desfazer --aplicar           devolve a data original
 *
 * ANTES DE --aplicar, rode a cópia de segurança:  npm run backup
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

const env = {};
try {
  for (const l of readFileSync(join(RAIZ, ".env"), "utf8").split(/\r?\n/)) {
    const m = l.match(/^([A-Z_]+)="?([\s\S]*?)"?$/);
    if (m) env[m[1]] = m[2];
  }
} catch {
  /* em produção as credenciais vêm do ambiente */
}
const cfg = { ...env, ...process.env };

// Este script roda na máquina de quem opera, nunca no servidor: sem a conta de
// serviço no .env não há como chegar ao banco. Dizer isso aqui é melhor do que
// deixar o erro aparecer vinte quadros adiante, dentro do Firestore.
const faltando = [
  ["NEXT_PUBLIC_FIREBASE_PROJECT_ID", cfg.NEXT_PUBLIC_FIREBASE_PROJECT_ID],
  ["FIREBASE_CLIENT_EMAIL", cfg.FIREBASE_CLIENT_EMAIL],
  ["FIREBASE_PRIVATE_KEY", cfg.FIREBASE_PRIVATE_KEY],
].filter(([, v]) => !v?.trim());

if (faltando.length) {
  console.error(`\nFalta credencial no .env da raiz: ${faltando.map(([k]) => k).join(", ")}.`);
  console.error("Sem ela este script não fala com o banco. Veja o próprio .env: cada");
  console.error("variável tem, acima dela, onde buscar o valor no console do Firebase.\n");
  process.exit(1);
}

if (!getApps().length) {
  try {
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
  } catch (erro) {
    // Sem isto, um .env pela metade cospe um erro de decodificação de chave que
    // não diz a ninguém o que fazer.
    console.error("\nNão foi possível usar a credencial do .env.");
    console.error("Confira FIREBASE_CLIENT_EMAIL e FIREBASE_PRIVATE_KEY — a chave vai");
    console.error("inteira, em uma linha, entre aspas, e sem comentário na mesma linha.");
    console.error(`\nDetalhe: ${erro instanceof Error ? erro.message : erro}\n`);
    process.exit(1);
  }
}

const db = getFirestore();

const arg = (nome) => {
  const i = process.argv.indexOf(`--${nome}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
};
const tem = (nome) => process.argv.includes(`--${nome}`);

const aplicar = tem("aplicar");
const desfazer = tem("desfazer");
const valor = arg("valor") ? Number(String(arg("valor")).replace(",", ".")) : undefined;
const para = arg("para");
const email = arg("email");
const idAlvo = arg("id");
const uidAlvo = arg("uid");

/** Marca de proveniência: permite desfazer só o que ESTE script mudou. */
const MARCA = "correcao-de-data";

const dinheiro = (v) => Number(v || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const comoData = (v) => {
  const d = v?.toDate ? v.toDate() : v ? new Date(v) : null;
  return d && !Number.isNaN(d.getTime())
    ? new Intl.DateTimeFormat("pt-BR", { timeZone: "UTC" }).format(d)
    : "—";
};

/** "2026-05-05" → 2026-05-05T12:00:00Z (mesma regra de src/lib/core/datas.ts). */
function diaDeCalendario(dia) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dia ?? "");
  if (!m) {
    console.error(`\nData inválida: "${dia}". Use o formato AAAA-MM-DD, por exemplo 2026-05-05.\n`);
    process.exit(1);
  }
  return new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12, 0, 0, 0));
}

// --- quem procurar -----------------------------------------------------------

const usuarios = (await db.collection("users").get()).docs.filter((d) => {
  if (uidAlvo) return d.id === uidAlvo;
  if (email) return d.data().email === email;
  return true;
});

if (!usuarios.length) {
  console.error("\nNenhuma pessoa encontrada com esse recorte.\n");
  process.exit(1);
}

// --- candidatos --------------------------------------------------------------

const candidatos = [];

for (const usuario of usuarios) {
  const snap = await usuario.ref.collection("transactions").get();

  for (const doc of snap.docs) {
    const d = doc.data();

    if (desfazer) {
      if (d.correcaoDeData === MARCA) candidatos.push({ usuario, doc, d });
      continue;
    }
    if (idAlvo && doc.id !== idAlvo) continue;
    if (!idAlvo && valor !== undefined && Number(d.amount) !== valor) continue;
    if (!idAlvo && valor === undefined) continue; // sem critério, não lista tudo
    candidatos.push({ usuario, doc, d });
  }
}

const modo = desfazer ? "DESFAZER" : aplicar ? "APLICANDO" : "PRÉVIA (nada será gravado)";
console.log(`\n${modo}\n${"─".repeat(70)}`);

if (!desfazer && valor === undefined && !idAlvo) {
  console.error("Informe --valor (ex: --valor 37) ou --id <docId>, e --para AAAA-MM-DD.\n");
  process.exit(1);
}

if (!candidatos.length) {
  console.log(desfazer ? "Nada foi corrigido por este script — não há o que desfazer.\n" : "Nenhum lançamento encontrado com esse critério.\n");
  process.exit(0);
}

for (const { usuario, doc, d } of candidatos) {
  const perfil = usuario.data();
  console.log(`  ${perfil.name ?? perfil.email ?? usuario.id}`);
  console.log(`    id .......... ${doc.id}`);
  console.log(`    uid ......... ${usuario.id}`);
  console.log(`    descrição ... ${d.description ?? "—"}`);
  console.log(`    valor ....... ${dinheiro(d.amount)}`);
  console.log(`    data atual .. ${comoData(d.date)}`);
  if (desfazer) {
    console.log(`    voltaria a .. ${comoData(d.dataOriginalCorrigida)}`);
  } else {
    console.log(`    passaria a .. ${comoData(diaDeCalendario(para))}`);
  }
  console.log(`    situação .... ${d.aprovacao ?? "particular"}${d.paymentBatchId ? " · em lote de pagamento" : ""}`);
  console.log("");
}

// --- guarda-corpo ------------------------------------------------------------

if (!desfazer && !para) {
  console.error("Falta --para AAAA-MM-DD com a data correta.\n");
  process.exit(1);
}

if (candidatos.length > 1 && !desfazer) {
  console.error(
    `${candidatos.length} lançamentos batem com o critério. Escolha um pelo identificador:\n` +
      `  --id <id> --uid <uid> --para ${para} --aplicar\n`,
  );
  process.exit(1);
}

if (!aplicar) {
  console.log("─".repeat(70));
  console.log("Nada foi gravado. Rode `npm run backup` e repita com --aplicar para valer.\n");
  process.exit(0);
}

// --- escrita -----------------------------------------------------------------

const pagos = candidatos.filter(({ d }) => d.aprovacao === "RESSARCIDA" || d.aprovacao === "APROVADA");
if (pagos.length && !desfazer) {
  console.log("⚠ Este lançamento já foi decidido (aprovado ou pago). A tela recusaria a alteração;");
  console.log("  o registro do lote de pagamento NÃO muda, apenas a data do gasto.\n");
}

const escrita = db.batch();
const agora = new Date();

for (const { usuario, doc, d } of candidatos) {
  const ref = usuario.ref.collection("transactions").doc(doc.id);

  escrita.update(
    ref,
    desfazer
      ? {
          date: d.dataOriginalCorrigida ?? d.date,
          dataOriginalCorrigida: null,
          correcaoDeData: null,
          updatedAt: agora,
        }
      : {
          date: diaDeCalendario(para),
          // Guarda o carimbo antigo: é o que torna o --desfazer possível.
          dataOriginalCorrigida: d.date,
          correcaoDeData: MARCA,
          updatedAt: agora,
        },
  );
}

await escrita.commit();

console.log("─".repeat(70));
console.log(`✓ ${candidatos.length} lançamento(s) ${desfazer ? "devolvido(s) à data original" : "corrigido(s)"}.`);
console.log(desfazer ? "" : "  Para voltar atrás: repita com --desfazer --aplicar\n");
