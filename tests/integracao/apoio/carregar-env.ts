import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

/**
 * Credenciais do `.env` para os testes que falam com o Firestore de verdade.
 *
 * O que já vier do ambiente tem precedência — é assim que a integração contínua
 * injeta segredo sem depender de arquivo no disco.
 */
const raiz = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");

for (const linha of readFileSync(join(raiz, ".env"), "utf8").split(/\r?\n/)) {
  const m = linha.match(/^([A-Z_]+)="?([\s\S]*?)"?$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
}
