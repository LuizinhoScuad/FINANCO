import { defineConfig } from "vitest/config";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const raiz = resolve(fileURLToPath(new URL("../..", import.meta.url)));

/**
 * Testes de INTEGRAÇÃO — tocam o Firestore de verdade.
 *
 * Ficam fora do `npm test` de propósito: o portão de integração precisa rodar
 * em milissegundos e sem credencial. Estes aqui gravam e apagam documentos sob
 * um usuário descartável (`zzz-teste-*`), e por isso são chamados à mão, com
 * `npm run test:integracao`.
 *
 * O alias de `server-only` existe porque os repositórios o importam para
 * impedir uso no navegador; fora do runtime do Next esse módulo lança ao ser
 * importado, e aqui ele não tem função.
 */
export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/integracao/**/*.test.ts"],
    setupFiles: ["tests/integracao/apoio/carregar-env.ts"],
    testTimeout: 60000,
    hookTimeout: 60000,
  },
  resolve: {
    alias: {
      "server-only": resolve(raiz, "tests/integracao/apoio/server-only.ts"),
      // O código-fonte mora em src/.
      "@": resolve(raiz, "src"),
    },
  },
});
