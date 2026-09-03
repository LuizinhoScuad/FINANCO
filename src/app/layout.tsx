import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Financo - Controle Financeiro",
  description: "Sistema de controle financeiro domestico pessoal",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Financo",
  },
  icons: {
    icon: "/icon.jpg",
    apple: "/icon.jpg",
  },
};

export const viewport: Viewport = {
  themeColor: "#00d98b",
  width: "device-width",
  initialScale: 1,
  // Sem isto, `env(safe-area-inset-*)` vale zero e as folgas que reservamos
  // para a faixa de gestos do iPhone não reservam nada.
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
