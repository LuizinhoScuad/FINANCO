/**
 * verificar-estrutura.mjs — faz valer o `specs/01-HARNESS.md`.
 *
 * Regra escrita e não verificada é decoração. Este script transforma cada regra
 * de organização do repositório num portão que falha em voz alta.
 *
 * Não lê banco, não precisa de credencial, roda em milissegundos — por isso
 * pode ficar no portão de integração contínua.
 *
 * Uso:  npm run verificar:estrutura
 */
import { readdirSync, existsSync, readFileSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, relative } from "node:path";

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

const problemas = [];
const avisos = [];

const falhar = (regra, detalhe) => problemas.push({ regra, detalhe });
const avisar = (regra, detalhe) => avisos.push({ regra, detalhe });

// --- 1. Raiz limpa ------------------------------------------------------------
//
// A lista é fechada de propósito. Arquivo novo na raiz obriga alguém a vir aqui
// e justificar — é o atrito que impede a bagunça de voltar.

const RAIZ_PERMITIDA = new Set([
  // exigência de ferramenta (ver HARNESS §2)
  "package.json", "package-lock.json",
  "next.config.ts", "next-env.d.ts",
  "tsconfig.json", "postcss.config.mjs",
  "firebase.json", ".firebaserc", "apphosting.yaml",
  ".gitignore", ".env",
  // carregado automaticamente pelo assistente a partir da raiz
  "CLAUDE.md",
  // artefatos locais, já ignorados pelo git
  "tsconfig.tsbuildinfo",
]);

const PASTAS_PERMITIDAS = new Set([
  ".git", ".github", ".claude", ".next", "node_modules",
  "src",        // todo o código-fonte (convenção do Next)
  "public",     // estáticos — o Next exige na raiz
  "tests", "scripts", "specs", "docs", "firebase", "outputs",
  "config",     // o que aceitou sair da raiz: eslint e o modelo de .env
]);

// O que precisa estar DENTRO de src/, e não solto na raiz.
for (const codigo of ["app", "lib", "actions", "components", "types", "middleware.ts"]) {
  if (existsSync(join(RAIZ, codigo))) {
    falhar("código em src/", `${codigo} voltou para a raiz — o lugar dele é src/${codigo}`);
  }
  if (!existsSync(join(RAIZ, "src", codigo))) {
    falhar("código em src/", `faltando src/${codigo}`);
  }
}

for (const item of readdirSync(RAIZ)) {
  const ehPasta = statSync(join(RAIZ, item)).isDirectory();
  if (ehPasta) {
    if (!PASTAS_PERMITIDAS.has(item)) {
      falhar("raiz limpa", `pasta inesperada na raiz: ${item}/ — dê um lugar a ela ou adicione à lista em ${relative(RAIZ, fileURLToPath(import.meta.url))}`);
    }
  } else if (!RAIZ_PERMITIDA.has(item)) {
    falhar("raiz limpa", `arquivo solto na raiz: ${item} — mova para a pasta certa (HARNESS §2) ou justifique na lista`);
  }
}

// --- 2. Nada de trabalho descartável esquecido --------------------------------

if (existsSync(join(RAIZ, "scripts", "tmp"))) {
  falhar("sem descartáveis", "scripts/tmp/ existe — trabalho temporário vai para fora do repositório (HARNESS §4)");
}

function varrer(pasta, aoAchar) {
  if (!existsSync(pasta)) return;
  for (const item of readdirSync(pasta)) {
    const caminho = join(pasta, item);
    if (statSync(caminho).isDirectory()) {
      if (item === "node_modules" || item === ".next" || item === ".git") continue;
      varrer(caminho, aoAchar);
    } else {
      aoAchar(caminho, item);
    }
  }
}

for (const pasta of ["scripts", "tests", "src"]) {
  varrer(join(RAIZ, pasta), (caminho, nome) => {
    if (/^tmp[-_]/i.test(nome) || /\.tmp\.[a-z]+$/i.test(nome)) {
      falhar("sem descartáveis", `arquivo temporário versionado: ${relative(RAIZ, caminho)}`);
    }
  });
}

// --- 3. Regras e índices no lugar --------------------------------------------

for (const arquivo of ["firestore.rules", "firestore.indexes.json", "storage.rules"]) {
  if (existsSync(join(RAIZ, arquivo))) {
    falhar("firebase/", `${arquivo} voltou para a raiz — o lugar dele é firebase/`);
  }
  if (!existsSync(join(RAIZ, "firebase", arquivo))) {
    falhar("firebase/", `faltando firebase/${arquivo}`);
  }
}

if (existsSync(join(RAIZ, "firebase.json"))) {
  const cfg = JSON.parse(readFileSync(join(RAIZ, "firebase.json"), "utf8"));
  const caminhos = [
    cfg.firestore?.rules,
    cfg.firestore?.indexes,
    cfg.storage?.rules,
  ].filter(Boolean);

  for (const caminho of caminhos) {
    if (!existsSync(join(RAIZ, caminho))) {
      falhar("firebase.json", `aponta para ${caminho}, que não existe`);
    }
  }
}

// --- 4. O portão de teste não pode tocar o banco ------------------------------

const configVitest = readFileSync(join(RAIZ, "tests", "vitest.config.mts"), "utf8");
if (!configVitest.includes("tests/integracao")) {
  falhar("portão rápido", "tests/vitest.config.mts não exclui tests/integracao — o portão passaria a exigir credencial e a escrever no Firestore real");
}

varrer(join(RAIZ, "tests"), (caminho, nome) => {
  const dentroDaIntegracao = relative(RAIZ, caminho).replace(/\\/g, "/").startsWith("tests/integracao/");
  if (dentroDaIntegracao || !nome.endsWith(".test.ts")) return;

  const conteudo = readFileSync(caminho, "utf8");
  if (/firebase-admin|adminDb|collectionGroup|repositories\//.test(conteudo)) {
    falhar(
      "portão rápido",
      `${relative(RAIZ, caminho)} toca banco mas está fora de tests/integracao/ — mova (HARNESS §3)`,
    );
  }
});

// --- 4b. Sonda de linha de comando mora em sondas/ ---------------------------

for (const item of readdirSync(join(RAIZ, "tests", "integracao"))) {
  if (item.endsWith(".mjs")) {
    falhar("sondas organizadas", `tests/integracao/${item} está solto — sondas .mjs moram em tests/integracao/sondas/`);
  }
}

// --- 5. Semeadura de teste tem prefixo reconhecível ---------------------------
//
// Sem o prefixo, resíduo esquecido vira usuário fantasma no painel do admin —
// já aconteceu, e é por isso que esta regra existe.

varrer(join(RAIZ, "tests", "integracao"), (caminho, nome) => {
  if (!/\.(mjs|ts)$/.test(nome) || nome.startsWith("vitest.config")) return;
  const conteudo = readFileSync(caminho, "utf8");
  const semeia = /\.set\(|createUser\(/.test(conteudo);
  if (semeia && !conteudo.includes("zzz-teste")) {
    falhar(
      "semeadura rastreável",
      `${relative(RAIZ, caminho)} grava no banco sem usar o prefixo zzz-teste- (HARNESS §3)`,
    );
  }
});

// --- 6. Todo script é declarado no HARNESS ------------------------------------
//
// A regra forte não é adivinhar o que o script faz lendo o código — é exigir que
// alguém tenha escrito, em português, o que ele faz e se escreve no banco. Um
// script que ninguém documentou é exatamente o que vira lixo esquecido.

const harness = readFileSync(join(RAIZ, "specs", "01-HARNESS.md"), "utf8");

/**
 * Linhas da tabela §4: | `subpasta/arquivo` | papel | escreve? |
 *
 * A leitura é recortada à seção 4 de propósito: outras seções também citam
 * nomes de arquivo entre crases, e varrer o documento inteiro fazia o
 * verificador cobrar scripts que nunca existiram.
 */
const secao4 = harness.slice(
  harness.indexOf("## 4."),
  harness.indexOf("## 5.") > 0 ? harness.indexOf("## 5.") : undefined,
);

const declarados = new Map();
for (const linha of secao4.split(/\r?\n/)) {
  const m = linha.match(/^\|\s*`([\w./-]+\.(?:mjs|bat))`\s*\|([^|]*)\|([^|]*)\|/);
  if (m) declarados.set(m[1], { papel: m[2].trim(), escreve: /^sim/i.test(m[3].trim()) });
}

/**
 * Nada de script solto: cada um mora numa subpasta com propósito claro.
 * Nove arquivos misturados numa pasta só era metade da bagunça reclamada.
 */
const SUBPASTAS_SCRIPTS = ["guardiao", "dados", "dev"];
const naPasta = [];

for (const item of readdirSync(join(RAIZ, "scripts"))) {
  const caminho = join(RAIZ, "scripts", item);
  if (statSync(caminho).isDirectory()) {
    if (!SUBPASTAS_SCRIPTS.includes(item)) {
      falhar("scripts organizados", `subpasta inesperada scripts/${item}/ — use guardiao/, dados/ ou dev/`);
      continue;
    }
    for (const arquivo of readdirSync(caminho)) {
      if (/\.(mjs|bat)$/.test(arquivo)) naPasta.push(`${item}/${arquivo}`);
    }
  } else if (/\.(mjs|bat)$/.test(item)) {
    falhar("scripts organizados", `scripts/${item} está solto — mova para guardiao/, dados/ ou dev/`);
  }
}

for (const nome of naPasta) {
  if (!declarados.has(nome)) {
    falhar("script declarado", `scripts/${nome} não está na tabela de specs/01-HARNESS.md §4 — documente o que faz e se escreve`);
  }
  if (nome.endsWith(".mjs")) {
    const conteudo = readFileSync(join(RAIZ, "scripts", nome), "utf8");
    if (!conteudo.trimStart().startsWith("/**")) {
      avisar("cabeçalho", `scripts/${nome} não começa com um comentário dizendo o que faz e por que existe`);
    }
    // Quem se declara escritor precisa oferecer volta (Art. 1).
    const declarado = declarados.get(nome);
    if (declarado?.escreve && !/--limpar|--desfazer|--aplicar/.test(conteudo) && !nome.endsWith("bootstrap-admin.mjs") && !nome.endsWith("limpar-residuo-teste.mjs")) {
      falhar("desfazer", `scripts/${nome} escreve no banco sem prévia nem caminho de volta (Art. 1, HARNESS §4)`);
    }
  }
}

for (const nome of declarados.keys()) {
  if (!naPasta.includes(nome)) {
    falhar("script declarado", `specs/01-HARNESS.md §4 lista scripts/${nome}, que não existe mais — remova a linha`);
  }
}

// --- 7. A prova de que o Guardião não escreve continua no lugar ---------------
//
// Quem faz essa verificação é `guardiao/verificar.mjs`, que sabe distinguir
// `Map.set()` em memória de escrita no banco. Aqui só se garante que a prova
// não foi desligada.

const pacote = JSON.parse(readFileSync(join(RAIZ, "package.json"), "utf8"));
if (!pacote.scripts?.["scan:verificar"]) {
  falhar("Art. 9", "o comando scan:verificar sumiu do package.json — é a prova de que o Guardião não escreve");
}
if (!existsSync(join(RAIZ, "scripts", "guardiao", "verificar.mjs"))) {
  falhar("Art. 9", "scripts/guardiao/verificar.mjs sumiu — sem ele nada prova que o Guardião só observa");
}

// --- 8. Documentos de governo presentes ---------------------------------------

for (const doc of [
  "specs/00-CONSTITUTION.md",
  "specs/01-HARNESS.md",
  "specs/financo/01-SPEC.md",
  "specs/financo/02-PLAN.md",
  "docs/PROGRESSO.md",
]) {
  if (!existsSync(join(RAIZ, doc))) falhar("governo", `faltando ${doc}`);
}

// --- saída --------------------------------------------------------------------

const linha = "─".repeat(64);
console.log(`\nVERIFICAÇÃO DE ESTRUTURA — specs/01-HARNESS.md`);
console.log(linha);

if (avisos.length) {
  for (const a of avisos) console.log(`  ~ ${a.regra}: ${a.detalhe}`);
  console.log("");
}

if (problemas.length === 0) {
  console.log(`✓ ESTRUTURA ÍNTEGRA${avisos.length ? `  (${avisos.length} aviso(s) acima)` : ""}\n`);
  process.exit(0);
}

for (const p of problemas) console.log(`  ✗ [${p.regra}] ${p.detalhe}`);
console.log(linha);
console.log(`${problemas.length} problema(s) de estrutura. Corrija ou ajuste a regra em specs/01-HARNESS.md.\n`);
process.exit(1);
