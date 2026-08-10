"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut } from "firebase/auth";
import { firebaseAuth } from "@/lib/firebase-client";
import { registrarCadastro } from "@/actions/signup";

type Mode = "login" | "register";

/** Recusa por status da conta — não é erro, é fluxo previsto. */
class ContaNaoLiberada extends Error {
  constructor(
    readonly codigo: "PENDENTE" | "BLOQUEADA",
    mensagem: string,
  ) {
    super(mensagem);
  }
}

async function startSession() {
  const user = firebaseAuth.currentUser;
  if (!user) throw new Error("Não foi possível autenticar.");

  const idToken = await user.getIdToken(true);
  const response = await fetch("/api/auth/session", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ idToken }),
  });

  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as
      | { error?: string; codigo?: "PENDENTE" | "BLOQUEADA" }
      | null;

    // Sem sessão no servidor, não faz sentido seguir autenticado no navegador.
    await signOut(firebaseAuth).catch(() => {});

    if (payload?.codigo) {
      throw new ContaNaoLiberada(payload.codigo, payload.error ?? "Conta não liberada.");
    }
    throw new Error(payload?.error ?? "Falha ao iniciar a sessão.");
  }
}

export function LoginClient({ aviso }: { aviso?: string }) {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("login");
  const [nome, setNome] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(aviso ?? "");

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError("");

    try {
      if (mode === "register") {
        // Cadastro NÃO entra: cria a conta como pendente e vai para a espera.
        const credencial = await createUserWithEmailAndPassword(firebaseAuth, email, password);
        const idToken = await credencial.user.getIdToken(true);

        const registro = await registrarCadastro({ idToken, name: nome });
        await signOut(firebaseAuth).catch(() => {});

        if (!registro.ok) {
          setError(registro.error);
          return;
        }

        router.push("/aguardando");
        return;
      }

      await signInWithEmailAndPassword(firebaseAuth, email, password);
      await startSession();
      router.push("/dashboard");
      router.refresh();
    } catch (err) {
      if (err instanceof ContaNaoLiberada && err.codigo === "PENDENTE") {
        router.push("/aguardando");
        return;
      }
      const message = err instanceof Error ? err.message : "Falha no login.";
      setError(message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "grid",
        placeItems: "center",
        padding: "2rem",
        background:
          "radial-gradient(circle at top left, rgba(0, 217, 139, 0.18), transparent 35%), linear-gradient(180deg, #f3f5ef, #ece9e1)",
      }}
    >
      <div
        className="card"
        style={{
          width: "100%",
          maxWidth: "420px",
          display: "flex",
          flexDirection: "column",
          gap: "1.25rem",
          borderTop: "3px solid var(--color-accent)",
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: "0.35rem" }}>
          <div style={{ fontFamily: "var(--font-display)", fontSize: "1.5rem", fontWeight: 700 }}>FINANCO</div>
          <h1 style={{ fontSize: "1.2rem" }}>{mode === "login" ? "Entrar" : "Criar conta"}</h1>
          <p style={{ color: "var(--color-muted)", fontSize: "0.9rem" }}>
            {mode === "login"
              ? "Acesse com seu e-mail e senha."
              : "Crie sua conta. Ela precisa ser liberada por um administrador antes do primeiro acesso."}
          </p>
        </div>

        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "0.9rem" }}>
          {mode === "register" && (
            <label style={{ display: "flex", flexDirection: "column", gap: "0.35rem", fontSize: "0.9rem" }}>
              Nome completo
              <input
                type="text"
                value={nome}
                onChange={(event) => setNome(event.target.value)}
                required
                minLength={2}
                placeholder="Como você aparece para o gestor"
                style={{
                  border: "1px solid var(--color-border)",
                  borderRadius: "2px",
                  padding: "0.75rem",
                  backgroundColor: "var(--color-surface-2)",
                }}
              />
            </label>
          )}

          <label style={{ display: "flex", flexDirection: "column", gap: "0.35rem", fontSize: "0.9rem" }}>
            Email
            <input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
              style={{
                border: "1px solid var(--color-border)",
                borderRadius: "2px",
                padding: "0.75rem",
                backgroundColor: "var(--color-surface-2)",
              }}
            />
          </label>

          <label style={{ display: "flex", flexDirection: "column", gap: "0.35rem", fontSize: "0.9rem" }}>
            Senha
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
              minLength={6}
              style={{
                border: "1px solid var(--color-border)",
                borderRadius: "2px",
                padding: "0.75rem",
                backgroundColor: "var(--color-surface-2)",
              }}
            />
          </label>

          {error ? (
            <div
              style={{
                backgroundColor: "rgba(217, 45, 32, 0.08)",
                color: "var(--color-danger)",
                padding: "0.75rem",
                borderRadius: "2px",
                fontSize: "0.85rem",
              }}
            >
              {error}
            </div>
          ) : null}

          <button
            type="submit"
            disabled={loading}
            style={{
              padding: "0.8rem 1rem",
              backgroundColor: "var(--color-accent)",
              color: "#06291d",
              border: "none",
              borderRadius: "2px",
              fontWeight: 700,
              cursor: loading ? "wait" : "pointer",
              opacity: loading ? 0.75 : 1,
            }}
          >
            {loading ? "Processando..." : mode === "login" ? "Entrar" : "Criar conta"}
          </button>
        </form>

        <button
          type="button"
          onClick={() => {
            setMode(mode === "login" ? "register" : "login");
            setError("");
          }}
          style={{
            border: "none",
            background: "transparent",
            color: "var(--color-accent)",
            textAlign: "left",
            padding: 0,
            cursor: "pointer",
            fontSize: "0.9rem",
          }}
        >
          {mode === "login" ? "Nao tem conta? Criar agora" : "Ja tem conta? Entrar"}
        </button>
      </div>
    </div>
  );
}
