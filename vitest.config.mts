import { defineConfig } from "vitest/config";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Os testes cobrem função pura — aritmética de dinheiro, máquina de estados e
 * validação. Nada aqui toca banco ou rede, então roda em milissegundos e pode
 * ser portão de integração sem incomodar ninguém (Art. 7).
 */
export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    reporters: ["default"],
  },
  resolve: {
    alias: { "@": resolve(fileURLToPath(new URL(".", import.meta.url))) },
  },
});
