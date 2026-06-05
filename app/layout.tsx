import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Financo - Controle Financeiro",
  description: "Sistema de controle financeiro domestico pessoal",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
