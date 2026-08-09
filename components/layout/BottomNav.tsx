"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const links = [
  {
    href: "/dashboard",
    label: "Dashboard",
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" />
        <rect x="14" y="14" width="7" height="7" /><rect x="3" y="14" width="7" height="7" />
      </svg>
    ),
  },
  {
    href: "/transacoes",
    label: "Transações",
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M7 16V4m0 0L3 8m4-4l4 4" /><path d="M17 8v12m0 0l4-4m-4 4l-4-4" />
      </svg>
    ),
  },
  {
    href: "/contas",
    label: "Contas",
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="2" y="5" width="20" height="14" rx="2" /><path d="M2 10h20" />
      </svg>
    ),
  },
  {
    href: "/categorias",
    label: "Categorias",
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z" />
        <line x1="7" y1="7" x2="7.01" y2="7" />
      </svg>
    ),
  },
  {
    href: "/orcamentos",
    label: "Orçamentos",
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10" /><path d="M12 8v4l3 3" />
      </svg>
    ),
  },
];

const linkRelatorios = {
  href: "/relatorios",
  label: "Relatórios",
  icon: (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><path d="M14 2v6h6" />
      <path d="M8 13h8M8 17h5" />
    </svg>
  ),
};

const linkAprovacoes = {
  href: "/admin/aprovacoes",
  label: "Aprovar",
  icon: (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 11l3 3L22 4" /><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
    </svg>
  ),
};

export function BottomNav({
  isAdmin = false,
  pendentes = 0,
  aprovacoes = 0,
  corrigir = 0,
}: {
  isAdmin?: boolean;
  pendentes?: number;
  aprovacoes?: number;
  corrigir?: number;
}) {
  const pathname = usePathname();

  // No celular o espaço é curto: cinco alvos de toque é o limite confortável.
  // Transações e Relatórios entram sempre — é o ciclo inteiro de quem está na
  // rua: lançar o gasto e depois mandar o relatório pelo WhatsApp.
  const itens = isAdmin
    ? [links[0], links[1], linkRelatorios, linkAprovacoes, { ...linkAprovacoes, href: "/admin/usuarios", label: "Usuários" }]
    : [links[0], links[1], linkRelatorios, links[2], links[4]];

  const badges: Record<string, number> = {
    "/transacoes": corrigir,
    "/admin/aprovacoes": aprovacoes,
    "/admin/usuarios": pendentes,
  };

  return (
    <nav
      style={{
        position: "fixed",
        bottom: 0,
        left: 0,
        right: 0,
        height: "64px",
        backgroundColor: "var(--color-surface)",
        borderTop: "1px solid var(--color-border)",
        display: "flex",
        alignItems: "stretch",
        zIndex: 100,
        paddingBottom: "env(safe-area-inset-bottom)",
      }}
    >
      {itens.map(({ href, label, icon }) => {
        const active = pathname === href || pathname.startsWith(href + "/");
        const contador = badges[href] ?? 0;
        const mostrarBadge = contador > 0;
        return (
          <Link
            key={href}
            href={href}
            style={{
              flex: 1,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              gap: "3px",
              textDecoration: "none",
              color: active ? "var(--color-accent)" : "var(--color-muted)",
              fontSize: "0.6rem",
              fontWeight: active ? 600 : 400,
              transition: "color 0.15s",
              position: "relative",
            }}
          >
            {icon}
            {label}
            {mostrarBadge && (
              <span
                style={{
                  position: "absolute",
                  top: "6px",
                  right: "22%",
                  minWidth: "16px",
                  height: "16px",
                  borderRadius: "8px",
                  backgroundColor: "#ffc107",
                  color: "#0a0e1a",
                  fontSize: "0.6rem",
                  fontWeight: 700,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  padding: "0 4px",
                }}
              >
                {contador}
              </span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}
