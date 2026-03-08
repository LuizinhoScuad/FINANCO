"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { SessionControls } from "@/components/layout/SessionControls";

const links = [
  { href: "/dashboard", label: "Dashboard", icon: "◧" },
  { href: "/transacoes", label: "Transacoes", icon: "⇄" },
  { href: "/contas", label: "Contas", icon: "▦" },
  { href: "/categorias", label: "Categorias", icon: "⌘" },
  { href: "/orcamentos", label: "Orcamentos", icon: "◎" },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside
      style={{
        width: "220px",
        minHeight: "100vh",
        backgroundColor: "var(--color-surface)",
        borderRight: "1px solid var(--color-border)",
        display: "flex",
        flexDirection: "column",
        flexShrink: 0,
      }}
    >
      <div
        style={{
          padding: "1.5rem 1.25rem",
          borderBottom: "1px solid var(--color-border)",
        }}
      >
        <span
          style={{
            fontFamily: "var(--font-display)",
            fontSize: "1.25rem",
            fontWeight: 700,
            color: "var(--color-accent)",
            letterSpacing: "-0.04em",
          }}
        >
          FIN<span style={{ color: "var(--color-text)" }}>ANCO</span>
        </span>
      </div>

      <nav style={{ flex: 1, padding: "1rem 0.75rem", display: "flex", flexDirection: "column", gap: "2px" }}>
        {links.map(({ href, label, icon }) => {
          const active = pathname === href || pathname.startsWith(href + "/");
          return (
            <Link
              key={href}
              href={href}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "0.625rem",
                padding: "0.5rem 0.75rem",
                borderRadius: "2px",
                fontSize: "0.875rem",
                fontWeight: active ? 600 : 400,
                color: active ? "var(--color-accent)" : "var(--color-muted)",
                backgroundColor: active ? "var(--color-accent-dim)" : "transparent",
                textDecoration: "none",
                transition: "all 0.15s",
                borderLeft: active ? "2px solid var(--color-accent)" : "2px solid transparent",
              }}
              onMouseEnter={(event) => {
                if (!active) {
                  event.currentTarget.style.color = "var(--color-text)";
                  event.currentTarget.style.backgroundColor = "var(--color-surface-2)";
                }
              }}
              onMouseLeave={(event) => {
                if (!active) {
                  event.currentTarget.style.color = "var(--color-muted)";
                  event.currentTarget.style.backgroundColor = "transparent";
                }
              }}
            >
              <span>{icon}</span>
              {label}
            </Link>
          );
        })}
      </nav>

      <div
        style={{
          padding: "1rem 1.25rem",
          borderTop: "1px solid var(--color-border)",
          display: "flex",
          flexDirection: "column",
          gap: "0.75rem",
        }}
      >
        <SessionControls />
        <div style={{ fontSize: "0.75rem", color: "var(--color-muted)" }}>v1.0 · uso pessoal</div>
      </div>
    </aside>
  );
}
