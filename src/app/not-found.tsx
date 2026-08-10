import Link from "next/link";

export default function NaoEncontrado() {
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
      <div className="card" style={{ maxWidth: "420px", textAlign: "center" }}>
        <div style={{ fontSize: "2rem", marginBottom: "0.75rem" }}>🧭</div>

        <h1 style={{ fontSize: "1.2rem", marginBottom: "0.75rem" }}>Página não encontrada</h1>

        <p style={{ color: "var(--color-muted)", fontSize: "0.875rem", marginBottom: "1.25rem" }}>
          O endereço acessado não existe no Financo.
        </p>

        <Link href="/dashboard" className="btn btn-primary" style={{ justifyContent: "center" }}>
          Ir ao painel
        </Link>
      </div>
    </div>
  );
}
