/**
 * bootstrap-admin.mjs — define o primeiro administrador do Financo.
 *
 * É a migração do usuário que já existia antes de existirem papéis (Art. 10):
 * grava os custom claims (role/status) e cria o documento users/{uid}.
 *
 * Serve também de saída de emergência: se o painel de usuários ficar
 * inacessível (admin bloqueado por engano), é por aqui que se recupera.
 *
 * Uso:
 *   node scripts/bootstrap-admin.mjs --list                          lista (só lê)
 *   node scripts/bootstrap-admin.mjs <email>                         mostra o que faria
 *   node scripts/bootstrap-admin.mjs <email> --confirmar             libera como ADMIN
 *   node scripts/bootstrap-admin.mjs <email> --papel COLABORADOR --confirmar
 *
 * Art. 1: nada é gravado sem --confirmar.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";

const raiz = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

// --- credenciais ------------------------------------------------------------

function lerEnv() {
  const env = {};
  let texto;
  try {
    texto = readFileSync(join(raiz, ".env"), "utf8");
  } catch {
    return env; // em produção as credenciais vêm do ambiente
  }
  for (const linha of texto.split("\n")) {
    const m = linha.match(/^([A-Z_]+)="?([\s\S]*?)"?$/);
    if (m) env[m[1]] = m[2];
  }
  return env;
}

const env = { ...lerEnv(), ...process.env };
const projectId = env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ?? env.GCLOUD_PROJECT;
const clientEmail = env.FIREBASE_CLIENT_EMAIL;
const privateKey = env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n");

if (!projectId) {
  console.error("✗ Não encontrei o projeto. Confira o .env.");
  process.exit(1);
}

if (!getApps().length) {
  initializeApp(
    clientEmail && privateKey
      ? { credential: cert({ projectId, clientEmail, privateKey }), projectId }
      : { projectId },
  );
}

const auth = getAuth();
const db = getFirestore();

// --- comandos ---------------------------------------------------------------

const args = process.argv.slice(2);
const confirmar = args.includes("--confirmar");

const iPapel = args.indexOf("--papel");
const papel = iPapel >= 0 ? args[iPapel + 1]?.toUpperCase() : "ADMIN";

if (papel !== "ADMIN" && papel !== "COLABORADOR") {
  console.error(`✗ Papel inválido: ${papel}. Use ADMIN ou COLABORADOR.`);
  process.exit(1);
}

// o alvo é o primeiro argumento livre que não seja o valor de --papel
const alvo = args.find((a, i) => !a.startsWith("--") && i !== iPapel + 1);

function descreverClaims(claims) {
  if (!claims || Object.keys(claims).length === 0) return "nenhum";
  return `role=${claims.role ?? "—"} status=${claims.status ?? "—"}`;
}

async function listar() {
  const { users } = await auth.listUsers(100);
  console.log(`\nContas no Firebase Auth do projeto ${projectId}: ${users.length}\n`);
  for (const u of users) {
    const doc = await db.collection("users").doc(u.uid).get();
    console.log(`  ${u.email ?? "(sem e-mail)"}`);
    console.log(`    uid.......: ${u.uid}`);
    console.log(`    criada em.: ${u.metadata.creationTime}`);
    console.log(`    último login: ${u.metadata.lastSignInTime ?? "nunca"}`);
    console.log(`    claims....: ${descreverClaims(u.customClaims)}`);
    console.log(`    perfil users/{uid}: ${doc.exists ? "existe" : "NÃO existe"}`);
    console.log();
  }
}

async function promover(email) {
  const usuario = await auth.getUserByEmail(email).catch(() => null);
  if (!usuario) {
    console.error(`✗ Não existe conta com o e-mail ${email}.`);
    console.error("  Rode com --list para ver as contas disponíveis.");
    process.exit(1);
  }

  const perfilRef = db.collection("users").doc(usuario.uid);
  const perfil = await perfilRef.get();

  console.log("\nO que será feito:");
  console.log(`  conta.........: ${usuario.email} (${usuario.uid})`);
  console.log(`  claims agora..: ${descreverClaims(usuario.customClaims)}`);
  console.log(`  claims depois.: role=${papel} status=ACTIVE`);
  console.log(`  perfil........: ${perfil.exists ? "atualizar existente" : "criar novo"}`);

  if (!confirmar) {
    console.log("\n⚠ Nada foi gravado. Para aplicar, repita com --confirmar\n");
    return;
  }

  await auth.setCustomUserClaims(usuario.uid, { role: papel, status: "ACTIVE" });

  await perfilRef.set(
    {
      name: usuario.displayName ?? usuario.email?.split("@")[0] ?? "Usuário",
      email: usuario.email ?? null,
      role: papel,
      status: "ACTIVE",
      createdAt: perfil.exists ? (perfil.data()?.createdAt ?? new Date()) : new Date(),
      updatedAt: new Date(),
      bootstrappedAt: new Date(),
    },
    { merge: true },
  );

  console.log("\n✓ Pronto.");
  console.log("\n⚠ IMPORTANTE: saia do app e entre novamente.");
  console.log("  Os claims só entram no token na próxima autenticação — até lá");
  console.log("  o app continua enxergando você como antes.\n");
}

if (args.includes("--list") || !alvo) {
  await listar();
  if (!alvo) {
    console.log("Para promover alguém a administrador:");
    console.log("  node scripts/bootstrap-admin.mjs <email> --confirmar\n");
  }
} else {
  await promover(alvo);
}

process.exit(0);
