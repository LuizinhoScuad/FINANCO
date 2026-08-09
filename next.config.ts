import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Reduz o tamanho do artefato de deploy (App Hosting clona menos arquivo).
  output: "standalone",

  // tesseract.js carrega WASM e não pode ser empacotado no bundle do servidor.
  // Sem isso, o import dinâmico do OCR já causou 5xx em produção.
  serverExternalPackages: ["tesseract.js"],
};

export default nextConfig;
