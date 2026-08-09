"use client";

import { useEffect } from "react";

/** Erro dentro da área autenticada — mantém o usuário no contexto do app. */
export default function ErroDoApp({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[financo] erro na área autenticada:", error);
  }, [error]);

  return (
    <div className="card animate-fade-up" style={{ borderLeft: "3px solid var(--color-danger)", maxWidth: "560px" }}>
      <h1 style={{ fontSize: "1.1rem", marginBottom: "0.5rem" }}>Não foi possível carregar esta tela</h1>

      <p style={{ color: "var(--color-muted)", fontSize: "0.875rem", marginBottom: "1rem" }}>
        Pode ter sido uma falha momentânea de conexão com o banco de dados.
      </p>

      {error.digest && (
        <p style={{ fontSize: "0.7rem", color: "var(--color-muted)", marginBottom: "1rem" }}>
          Código: <code>{error.digest}</code>
        </p>
      )}

      <button className="btn btn-primary" onClick={reset}>
        Tentar de novo
      </button>
    </div>
  );
}
