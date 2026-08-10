"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { signOut } from "firebase/auth";
import { firebaseAuth } from "@/lib/firebase-client";

export function SessionControls() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [importing, setImporting] = useState(false);

  async function handleLogout() {
    await fetch("/api/auth/session", { method: "DELETE" });
    await signOut(firebaseAuth).catch(() => undefined);
    router.push("/login");
    router.refresh();
  }

  async function handleImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!confirm(`Restaurar backup "${file.name}"?\n\nISSO VAI APAGAR todos os dados atuais e substituir pelo backup.`)) {
      e.target.value = "";
      return;
    }

    setImporting(true);
    try {
      const text = await file.text();
      const payload = JSON.parse(text);
      const res = await fetch("/api/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const result = await res.json();
      if (!res.ok) {
        alert(`Erro: ${result.error}`);
      } else {
        const { restored } = result;
        alert(
          `Backup restaurado com sucesso!\n\n` +
          `• ${restored.transactions} transações\n` +
          `• ${restored.accounts} contas\n` +
          `• ${restored.categories} categorias\n` +
          `• ${restored.budgets} orçamentos`
        );
        router.refresh();
      }
    } catch {
      alert("Erro ao ler o arquivo. Verifique se é um backup válido do Financo.");
    } finally {
      setImporting(false);
      e.target.value = "";
    }
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
      <input
        ref={fileInputRef}
        type="file"
        accept=".json"
        style={{ display: "none" }}
        onChange={handleImport}
      />
      <button
        type="button"
        onClick={() => fileInputRef.current?.click()}
        disabled={importing}
        style={{
          border: "1px solid var(--color-border)",
          borderRadius: "2px",
          padding: "0.6rem 0.75rem",
          backgroundColor: "var(--color-surface-2)",
          color: "var(--color-text)",
          cursor: importing ? "not-allowed" : "pointer",
          fontSize: "0.85rem",
          opacity: importing ? 0.6 : 1,
        }}
      >
        {importing ? "Restaurando..." : "Restaurar backup"}
      </button>
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
