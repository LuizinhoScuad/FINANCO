"use client";

import { useEffect, useState } from "react";

/**
 * Aviso na tela — substitui o `alert()` do navegador e, principalmente, o
 * silêncio.
 *
 * Antes, três telas do sistema chamavam a action, recebiam o erro e o
 * descartavam: uma validação recusada fazia o formulário fechar como se tivesse
 * dado certo (Art. 6).
 */
export type TipoAviso = "erro" | "sucesso" | "atencao";

const ESTILO: Record<TipoAviso, { cor: string; icone: string }> = {
  erro: { cor: "var(--color-danger)", icone: "⚠" },
  sucesso: { cor: "var(--color-accent)", icone: "✓" },
  atencao: { cor: "#f59e0b", icone: "!" },
};

export function Aviso({
  tipo = "erro",
  mensagem,
  onFechar,
  autoFecharMs,
}: {
  tipo?: TipoAviso;
  mensagem: string;
  onFechar?: () => void;
  autoFecharMs?: number;
}) {
  const [visivel, setVisivel] = useState(true);
  const { cor, icone } = ESTILO[tipo];

  useEffect(() => {
    setVisivel(true);
    if (!autoFecharMs) return;
    const t = setTimeout(() => {
      setVisivel(false);
      onFechar?.();
    }, autoFecharMs);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mensagem, autoFecharMs]);

  if (!mensagem || !visivel) return null;

  return (
    <div
      role={tipo === "erro" ? "alert" : "status"}
      className="card animate-fade-up"
      style={{
        borderLeft: `3px solid ${cor}`,
        color: cor,
        fontSize: "0.875rem",
        display: "flex",
        alignItems: "center",
        gap: "0.75rem",
        padding: "0.75rem 1rem",
      }}
    >
      <span aria-hidden style={{ fontWeight: 700 }}>
        {icone}
      </span>
      <span style={{ flex: 1 }}>{mensagem}</span>
      {onFechar && (
        <button
          onClick={() => {
            setVisivel(false);
            onFechar();
          }}
          aria-label="Fechar aviso"
          style={{ background: "none", border: "none", color: "inherit", cursor: "pointer", fontSize: "1rem" }}
        >
          ✕
        </button>
      )}
    </div>
  );
}

/**
 * Confirmação que MOSTRA o impacto antes de agir (Art. 1).
 *
 * O `confirm()` do navegador não serve para operação destrutiva de dados: ele
 * pergunta "tem certeza?" sem dizer o que exatamente será perdido.
 */
export function ConfirmarDestrutivo({
  titulo,
  impacto,
  textoBotao = "Excluir",
  onConfirmar,
  onCancelar,
  ocupado,
}: {
  titulo: string;
  impacto: string[];
  textoBotao?: string;
  onConfirmar: () => void;
  onCancelar: () => void;
  ocupado?: boolean;
}) {
  return (
    <div
      className="overlay-modal"
      style={{ zIndex: 160 }}
      onClick={(e) => e.target === e.currentTarget && !ocupado && onCancelar()}
    >
      <div className="card" style={{ width: "100%", maxWidth: "440px", borderTop: "3px solid var(--color-danger)" }}>
        <h2 style={{ fontSize: "1.1rem", marginBottom: "0.75rem" }}>{titulo}</h2>

        <ul style={{ margin: "0 0 1.25rem 1rem", padding: 0, fontSize: "0.875rem", color: "var(--color-muted)" }}>
          {impacto.map((linha) => (
            <li key={linha} style={{ marginBottom: "0.35rem" }}>
              {linha}
            </li>
          ))}
        </ul>

        <p style={{ fontSize: "0.8rem", color: "var(--color-danger)", marginBottom: "1rem" }}>
          Esta ação não pode ser desfeita.
        </p>

        <div style={{ display: "flex", gap: "0.75rem", justifyContent: "flex-end" }}>
          <button className="btn btn-ghost" onClick={onCancelar} disabled={ocupado}>
            Cancelar
          </button>
          <button className="btn btn-danger" onClick={onConfirmar} disabled={ocupado}>
            {ocupado ? "Excluindo..." : textoBotao}
          </button>
        </div>
      </div>
    </div>
  );
}
