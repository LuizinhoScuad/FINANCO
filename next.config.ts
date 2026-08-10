import type { NextConfig } from "next";

/**
 * Carimbo do build, gravado no momento em que o Next compila.
 *
 * Existe porque, num deploy de 09/08/2026, não havia como distinguir "a versão
 * nova subiu" de "o build falhou e produção seguiu servindo a anterior" — as
 * duas respondiam igual a todas as sondas. Com o carimbo, `/api/health` diz de
 * qual build veio a resposta, e o deploy vira verificável em vez de presumido
 * (Art. 3).
 */
const CARIMBO_DE_BUILD = new Date().toISOString();

const nextConfig: NextConfig = {
  env: { CARIMBO_DE_BUILD },

  // Reduz o tamanho do artefato de deploy (App Hosting clona menos arquivo).
  output: "standalone",

  // tesseract.js carrega WASM e não pode ser empacotado no bundle do servidor.
  // Sem isso, o import dinâmico do OCR já causou 5xx em produção.
  serverExternalPackages: ["tesseract.js"],
};

export default nextConfig;
