"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { alterarPapel, aprovarUsuario, bloquearUsuario } from "@/actions/admin-users";
import { descreverDadosBancarios } from "@/lib/core/dados-bancarios";
import type { UserProfile, UserStatus } from "@/types";

const ROTULO: Record<UserStatus, { texto: string; cor: string; fundo: string }> = {
  PENDING: { texto: "AGUARDANDO", cor: "#ffc107", fundo: "rgba(255, 193, 7, 0.12)" },
  ACTIVE: { texto: "ATIVO", cor: "var(--color-accent)", fundo: "var(--color-accent-dim)" },
  BLOCKED: { texto: "BLOQUEADO", cor: "var(--color-danger)", fundo: "var(--color-danger-dim)" },
};

function formatarData(data: Date | null) {
  if (!data || data.getTime() === 0) return "—";
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short" }).format(new Date(data));
}

export function UsuariosClient({
  usuarios,
  uidAtual,
}: {
  usuarios: UserProfile[];
  uidAtual: string;
}) {
  const router = useRouter();
  const [pendente, startTransition] = useTransition();
  const [erro, setErro] = useState("");
  const [aviso, setAviso] = useState("");
  const [emAcao, setEmAcao] = useState<string | null>(null);

  const aguardando = usuarios.filter((u) => u.status === "PENDING").length;
  // Quem já pode usar o sistema mas ainda não disse como quer receber. Não é
  // erro — é a fila do portão: no próximo acesso, essas pessoas preenchem.
  const semDadosBancarios = usuarios.filter(
    (u) => u.status === "ACTIVE" && !u.dadosBancarios,
  ).length;

  function executar(uid: string, acao: () => Promise<{ ok: boolean; error?: string }>, sucesso: string) {
    setErro("");
    setAviso("");
    setEmAcao(uid);
    startTransition(async () => {
      const r = await acao();
      setEmAcao(null);
      if (!r.ok) {
        setErro(r.error ?? "Não foi possível concluir.");
        return;
      }
      setAviso(sucesso);
      router.refresh();
    });
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
      <div className="animate-fade-up">
        <h1 style={{ fontSize: "1.5rem", marginBottom: "0.25rem" }}>Usuários</h1>
        <p style={{ color: "var(--color-muted)", fontSize: "0.875rem" }}>
          {usuarios.length} cadastrado(s)
          {aguardando > 0 && (
            <span style={{ color: "#ffc107", fontWeight: 600 }}>
              {" · "}
              {aguardando} aguardando liberação
            </span>
          )}
          {semDadosBancarios > 0 && (
            <span style={{ color: "#f59e0b" }}>
              {" · "}
              {semDadosBancarios} sem dados para reembolso
            </span>
          )}
        </p>
      </div>

      {erro && (
        <div
          className="card"
          style={{ borderLeft: "3px solid var(--color-danger)", color: "var(--color-danger)", fontSize: "0.875rem" }}
        >
          {erro}
        </div>
      )}
      {aviso && (
        <div
          className="card"
          style={{ borderLeft: "3px solid var(--color-accent)", color: "var(--color-accent)", fontSize: "0.875rem" }}
        >
          {aviso}
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
        {usuarios.map((u) => {
          const marca = ROTULO[u.status];
          const souEu = u.uid === uidAtual;
          const ocupado = pendente && emAcao === u.uid;

          return (
            <div
              key={u.uid}
              className="card animate-fade-up"
              style={{
                display: "flex",
                flexWrap: "wrap",
                gap: "1rem",
                alignItems: "center",
                justifyContent: "space-between",
                borderLeft: `3px solid ${marca.cor}`,
                opacity: ocupado ? 0.6 : 1,
              }}
            >
              <div style={{ minWidth: "200px", flex: 1 }}>
                <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", flexWrap: "wrap" }}>
                  <strong style={{ fontSize: "0.95rem" }}>{u.name}</strong>
                  {souEu && (
                    <span style={{ fontSize: "0.65rem", color: "var(--color-muted)" }}>(você)</span>
                  )}
                  <span
                    className="badge"
                    style={{ backgroundColor: marca.fundo, color: marca.cor, fontSize: "0.6rem" }}
                  >
                    {marca.texto}
                  </span>
                  {u.role === "ADMIN" && (
                    <span
                      className="badge"
                      style={{
                        backgroundColor: "rgba(96, 165, 250, 0.12)",
                        color: "#60a5fa",
                        fontSize: "0.6rem",
                      }}
                    >
                      ADMIN
                    </span>
                  )}
                </div>
                <div style={{ fontSize: "0.75rem", color: "var(--color-muted)", marginTop: "3px" }}>
                  {u.email ?? "sem e-mail"} · cadastro {formatarData(u.createdAt)} · último acesso{" "}
                  {formatarData(u.lastSignInAt)}
                </div>

                {/* Para onde vai o reembolso desta pessoa. Recolhido: é dado
                    pessoal, e o painel é usado para gerenciar acesso (Art. 4). */}
                {u.dadosBancarios ? (
                  <details style={{ marginTop: "0.5rem" }}>
                    <summary
                      style={{ fontSize: "0.72rem", color: "var(--color-muted)", cursor: "pointer" }}
                    >
                      Dados para reembolso
                    </summary>
                    <div
                      style={{
                        marginTop: "0.5rem",
                        padding: "0.5rem 0.625rem",
                        backgroundColor: "var(--color-surface-2)",
                        borderRadius: "2px",
                        display: "flex",
                        flexDirection: "column",
                        gap: "2px",
                      }}
                    >
                      {descreverDadosBancarios(u.dadosBancarios).map((linha) => (
                        <div
                          key={linha.rotulo}
                          style={{ display: "flex", gap: "0.5rem", fontSize: "0.72rem", flexWrap: "wrap" }}
                        >
                          <span style={{ color: "var(--color-muted)", flex: "0 0 auto", minWidth: "96px" }}>
                            {linha.rotulo}
                          </span>
                          {/* Chave PIX de e-mail ou aleatória é longa e não tem
                              espaço para quebrar sozinha: sem isto ela empurra
                              o cartão para além da tela do celular. */}
                          <span style={{ fontWeight: 500, minWidth: 0, overflowWrap: "anywhere" }}>
                            {linha.valor}
                          </span>
                        </div>
                      ))}
                      <div style={{ fontSize: "0.68rem", color: "var(--color-muted)", marginTop: "3px" }}>
                        atualizado em {formatarData(u.dadosBancarios.atualizadoEm)}
                      </div>
                    </div>
                  </details>
                ) : (
                  u.status === "ACTIVE" && (
                    <div style={{ fontSize: "0.72rem", color: "#f59e0b", marginTop: "0.4rem" }}>
                      sem dados para reembolso — será pedido no próximo acesso
                    </div>
                  )
                )}
              </div>

              <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
                {u.status !== "ACTIVE" && (
                  <button
                    className="btn btn-primary"
                    disabled={pendente}
                    onClick={() =>
                      executar(u.uid, () => aprovarUsuario(u.uid), `${u.name} foi liberado.`)
                    }
                    style={{ fontSize: "0.8rem" }}
                  >
                    {u.status === "PENDING" ? "Liberar" : "Desbloquear"}
                  </button>
                )}

                {u.status === "ACTIVE" && !souEu && (
                  <>
                    <button
                      className="btn btn-ghost"
                      disabled={pendente}
                      onClick={() => {
                        const novo = u.role === "ADMIN" ? "COLABORADOR" : "ADMIN";
                        if (
                          !confirm(
                            `Alterar ${u.name} para ${novo === "ADMIN" ? "administrador" : "colaborador"}?` +
                              (novo === "ADMIN"
                                ? "\n\nATENÇÃO: administrador aprova reembolsos e enxerga TODOS os lançamentos de TODAS as pessoas — inclusive os marcados como particulares, e inclusive os seus."
                                : ""),
                          )
                        )
                          return;
                        executar(
                          u.uid,
                          () => alterarPapel(u.uid, novo),
                          `${u.name} agora é ${novo === "ADMIN" ? "administrador" : "colaborador"}.`,
                        );
                      }}
                      style={{ fontSize: "0.8rem" }}
                    >
                      {u.role === "ADMIN" ? "Tornar colaborador" : "Tornar admin"}
                    </button>

                    <button
                      className="btn btn-danger"
                      disabled={pendente}
                      onClick={() => {
                        if (!confirm(`Bloquear ${u.name}?\n\nPerde o acesso na próxima ação.`)) return;
                        executar(u.uid, () => bloquearUsuario(u.uid), `${u.name} foi bloqueado.`);
                      }}
                      style={{ fontSize: "0.8rem" }}
                    >
                      Bloquear
                    </button>
                  </>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <p style={{ fontSize: "0.75rem", color: "var(--color-muted)" }}>
        Quem acabou de ser liberado precisa sair e entrar novamente para a permissão valer.
      </p>
    </div>
  );
}
