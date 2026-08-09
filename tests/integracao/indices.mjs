import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

import { GoogleAuth } from "google-auth-library";

const env = {};
for (const l of readFileSync(join(RAIZ, ".env"), "utf8").split("\n")) {
  const m = l.match(/^([A-Z_]+)="?([\s\S]*?)"?$/);
  if (m) env[m[1]] = m[2];
}
const cfg = { ...env, ...process.env };
const projeto = cfg.NEXT_PUBLIC_FIREBASE_PROJECT_ID;

const auth = new GoogleAuth({
  credentials: {
    client_email: cfg.FIREBASE_CLIENT_EMAIL,
    private_key: cfg.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n"),
  },
  scopes: ["https://www.googleapis.com/auth/datastore"],
});
const cliente = await auth.getClient();
const base = `https://firestore.googleapis.com/v1/projects/${projeto}/databases/(default)/collectionGroups`;

const idx = await cliente.request({ url: `${base}/transactions/indexes` });
console.log("COMPOSTOS (transactions):");
for (const i of idx.data.indexes ?? []) {
  const campos = (i.fields ?? []).map((f) => `${f.fieldPath}:${f.order ?? f.arrayConfig}`).join(", ");
  console.log(`  [${i.state}] ${i.queryScope} -> ${campos}`);
}

const campos = await cliente.request({ url: `${base}/transactions/fields?filter=indexConfig.usesAncestorConfig=false` });
console.log("\nCAMPO ÚNICO com configuração própria:");
for (const f of campos.data.fields ?? []) {
  const nome = f.name.split("/fields/")[1];
  const lista = (f.indexConfig?.indexes ?? [])
    .map((i) => `${i.queryScope}:${i.order ?? i.arrayConfig}`)
    .join(", ");
  console.log(`  ${nome} -> ${lista || "(nenhum)"}`);
  console.log(`     pronto: ${f.indexConfig?.reverting === true ? "revertendo" : "sim"}`);
}
