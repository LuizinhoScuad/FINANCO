"use client";

/**
 * Botão de filtro que mostra, pelo próprio desenho, se está ligado.
 *
 * Mora aqui porque Relatórios e Aprovados usam o mesmo: dois marcadores com
 * aparência ligeiramente diferente fariam a mesma pergunta parecer duas.
 */
export function Chip({
  texto,
  ativo,
  cor,
  onClick,
}: {
  texto: string;
  ativo: boolean;
  cor?: string;
  onClick: () => void;
}) {
  const destaque = cor ?? "var(--color-accent)";
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={ativo}
      style={{
        fontSize: "0.75rem",
        fontWeight: ativo ? 700 : 500,
        padding: "0.3rem 0.7rem",
        borderRadius: "999px",
        cursor: "pointer",
        whiteSpace: "nowrap",
        color: ativo ? destaque : "var(--color-muted)",
        border: `1px solid ${ativo ? destaque : "var(--color-border)"}`,
        backgroundColor: ativo ? "var(--color-surface-2)" : "transparent",
        transition: "all 0.15s",
      }}
    >
      {texto}
    </button>
  );
}
