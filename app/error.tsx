"use client";

import { useEffect } from "react";

/**
 * Última linha de defesa da interface.
 *
 * Sem isto, um erro inesperado mostrava a tela de falha genérica do Next — sem
 * contexto, sem saída, e (em produção) sem nada que ajudasse a entender.
 */
export default function ErroGlobal({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[financo] erro não tratado:", error);
  }, [error]);

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "1.5rem",
      }}
    >
      <div className="card" style={{ maxWidth: "460px", borderTop: "3px solid var(--color-danger)" }}>
        <div style={{ fontSize: "2rem", marginBottom: "0.75rem" }}>⚠</div>

        <h1 style={{ fontSize: "1.2rem", marginBottom: "0.75rem" }}>Algo deu errado</h1>

        <p style={{ color: "var(--color-muted)", fontSize: "0.875rem", marginBottom: "1rem" }}>
          A operação não foi concluída. Seus dados não foram alterados por este
          erro — se você estava salvando algo, confira antes de repetir.
        </p>

        {error.digest && (
          <p style={{ fontSize: "0.7rem", color: "var(--color-muted)", marginBottom: "1rem" }}>
            Código para diagnóstico: <code>{error.digest}</code>
          </p>
        )}

        <div style={{ display: "flex", gap: "0.75rem" }}>
          <button className="btn btn-primary" onClick={reset}>
            Tentar de novo
          </button>
          <a className="btn btn-ghost" href="/dashboard">
            Ir ao painel
          </a>
        </div>
      </div>
    </div>
  );
}
