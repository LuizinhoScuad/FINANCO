import Link from "next/link";

export const dynamic = "force-dynamic";

/**
 * Tela de espera de aprovação.
 *
 * Fica FORA do grupo (app) de propósito: se estivesse dentro, o layout
 * autenticado redirecionaria para cá de novo, criando laço infinito.
 *
 * A Fase 3 acrescenta o fluxo completo de cadastro que leva até aqui.
 */
export default function AguardandoPage() {
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
        <div style={{ fontSize: "2.5rem", marginBottom: "0.75rem" }}>🔒</div>

        <h1 style={{ fontSize: "1.25rem", marginBottom: "0.75rem" }}>
          Cadastro aguardando liberação
        </h1>

        <p style={{ color: "var(--color-muted)", fontSize: "0.875rem", marginBottom: "1.25rem" }}>
          Sua conta foi criada, mas ainda precisa ser liberada por um
          administrador. Assim que isso acontecer, entre novamente para acessar
          o sistema.
        </p>

        <Link href="/login" className="btn btn-ghost" style={{ width: "100%", justifyContent: "center" }}>
          Voltar ao login
        </Link>
      </div>
    </div>
  );
}
