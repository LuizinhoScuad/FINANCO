"use client";

import { useRouter } from "next/navigation";
import { signOut } from "firebase/auth";
import { firebaseAuth } from "@/lib/firebase-client";

export function SessionControls() {
  const router = useRouter();

  async function handleLogout() {
    await fetch("/api/auth/session", { method: "DELETE" });
    await signOut(firebaseAuth).catch(() => undefined);
    router.push("/login");
    router.refresh();
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
      <a
        href="/api/export"
        style={{
          textDecoration: "none",
          padding: "0.6rem 0.75rem",
          border: "1px solid var(--color-border)",
          borderRadius: "2px",
          color: "var(--color-text)",
          backgroundColor: "var(--color-surface-2)",
          textAlign: "center",
          fontSize: "0.85rem",
        }}
      >
        Exportar dados
      </a>
      <button
        type="button"
        onClick={handleLogout}
        style={{
          border: "1px solid var(--color-border)",
          borderRadius: "2px",
          padding: "0.6rem 0.75rem",
          backgroundColor: "transparent",
          color: "var(--color-muted)",
          cursor: "pointer",
          fontSize: "0.85rem",
        }}
      >
        Sair
      </button>
    </div>
  );
}
