/**
 * verificar-guardiao.mjs — prova que o Guardião não escreve.
 *
 * O `scan-financo.mjs` roda com credencial de administrador, que ignora as
 * regras de segurança. A única garantia real de que ele apenas observa (Art. 9)
 * é não conter nenhuma chamada de escrita — e isso precisa ser verificado por
 * máquina, não por confiança.
 *
 * A checagem distingue escrita no Firestore de uso legítimo de `Map`/`Set`:
 * só acusa quando o método de escrita é aplicado a algo que se parece com uma
 * referência do banco ou do Storage.
 *
 * Uso: node scripts/verificar-guardiao.mjs
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const raiz = join(dirname(fileURLToPath(import.meta.url)), "..");

const ALVOS = ["scripts/scan-financo.mjs"];

const METODOS_ESCRITA = ["set", "update", "delete", "add", "create", "commit", "save", "remove"];

/** Receptores que indicam banco ou armazenamento, e não estrutura em memória. */
const RECEPTORES = [
  "db",
  "firestore",
  "adminDb",
  "bucket",
  "storage",
  "batch",
  "lote",
  "t",
  "transaction",
];

const PADROES_DIRETOS = [
  /\.doc\([^)]*\)\s*\.\s*(set|update|delete|create)\(/,
  /\.collection\([^)]*\)\s*\.\s*(add|doc)\([^)]*\)\s*\.\s*(set|update|delete|create)\(/,
  /\.collection\([^)]*\)\s*\.\s*add\(/,
  /\.ref\s*\.\s*(set|update|delete|create)\(/,
  /\bwriteBatch\s*\(/,
  /\.batch\s*\(\s*\)/,
  /\brunTransaction\s*\(/,
  /\bbulkWriter\s*\(/,
  /\.file\([^)]*\)\s*\.\s*(save|delete)\(/,
];

const receptorRegex = new RegExp(
  `\\b(${RECEPTORES.join("|")})\\s*\\.\\s*(${METODOS_ESCRITA.join("|")})\\s*\\(`,
);

let problemas = 0;

for (const alvo of ALVOS) {
  const caminho = join(raiz, alvo);
  const linhas = readFileSync(caminho, "utf8").split("\n");

  console.log(`\nVerificando ${alvo}`);
  console.log("─".repeat(60));

  linhas.forEach((linha, i) => {
    const semComentario = linha.replace(/^\s*(\*|\/\/).*/, "");
    if (!semComentario.trim()) return;

    const acusacoes = [];

    for (const padrao of PADROES_DIRETOS) {
      if (padrao.test(semComentario)) acusacoes.push(padrao.source.slice(0, 40));
    }
    if (receptorRegex.test(semComentario)) {
      acusacoes.push("escrita em referência do banco");
    }

    if (acusacoes.length) {
      problemas++;
      console.log(`  ✗ linha ${i + 1}: ${linha.trim().slice(0, 80)}`);
      console.log(`      ${acusacoes[0]}`);
    }
  });

  if (problemas === 0) {
    console.log("  ✓ nenhuma escrita no Firestore ou no Storage");
    console.log("  ✓ Map.set() e Set.add() em memória não contam — foram distinguidos");
  }
}

console.log("\n" + "─".repeat(60));
if (problemas === 0) {
  console.log("✓ GUARDIÃO ÍNTEGRO: observa, não age (Art. 9).\n");
  process.exit(0);
} else {
  console.log(`✗ ${problemas} escrita(s) encontrada(s) — o Guardião NÃO pode escrever.\n`);
  process.exit(1);
}
