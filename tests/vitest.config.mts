import { defineConfig } from "vitest/config";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Portão rápido: função pura — aritmética de dinheiro, máquina de estados e
 * validação. Nada aqui toca banco ou rede, então roda em milissegundos e pode
 * ser portão de integração sem incomodar ninguém (Art. 7).
 *
 * Os que tocam banco vivem em `tests/integracao/`, com config própria.
 *
 * `root` é declarado de propósito: como este arquivo não está mais na raiz do
 * repositório, sem isso o vitest resolveria `include` a partir de `tests/` e
 * não acharia nada.
 */
const RAIZ = resolve(fileURLToPath(new URL(".", import.meta.url)), "..");

export default defineConfig({
  root: RAIZ,
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    // Integração toca o Firestore real e exige credencial: fica de fora do
    // portão. Roda à parte, com `npm run test:integracao`.
    exclude: ["tests/integracao/**"],
    reporters: ["default"],
  },
  resolve: {
    // O código-fonte mora em src/ (convenção do Next), e o alias segue junto.
    alias: { "@": resolve(RAIZ, "src") },
  },
});
