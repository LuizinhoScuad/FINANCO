import { defineConfig } from "vitest/config";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Os testes cobrem função pura — aritmética de dinheiro, máquina de estados e
 * validação. Nada aqui toca banco ou rede, então roda em milissegundos e pode
 * ser portão de integração sem incomodar ninguém (Art. 7).
 *
 * Os que tocam banco vivem em `tests/integracao/`, com config própria.
 */
export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    // Integração toca o Firestore real e exige credencial: fica de fora do
    // portão. Roda à parte, com `npm run test:integracao`.
    exclude: ["tests/integracao/**"],
    reporters: ["default"],
  },
  resolve: {
    alias: { "@": resolve(fileURLToPath(new URL(".", import.meta.url))) },
  },
});
