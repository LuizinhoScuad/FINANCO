"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { aprovarDespesa, rejeitarDespesa } from "@/actions/expenses";
import { formatarCentavos } from "@/lib/core/money";
import { formatDate } from "@/lib/utils";
import { Aviso } from "@/components/ui/Aviso";
import type { Expense, ExpenseCategory } from "@/types";

export function AprovacoesClient({
  fila,
  categorias,
}: {
  fila: Expense[];
  categorias: ExpenseCategory[];
}) {
  const router = useRouter();
  const [pendente, startTransition] = useTransition();
  const [erro, setErro] = useState("");
  const [sucesso, setSucesso] = useState("");
  const [rejeitando, setRejeitando] = useState<Expense | null>(null);
  const [motivo, setMotivo] = useState("");
  const [ampliada, setAmpliada] = useState<string | null>(null);

  const nome = (id: string) => categorias.find((c) => c.id === id)?.name ?? "—";
  const icone = (id: string) => categorias.find((c) => c.id === id)?.icon ?? "📌";
  const total = fila.reduce((s, d) => s + d.amountCents, 0);
  const semComprovante = fila.filter((d) => !d.receiptUrl).length;

  function agir(fn: () => Promise<{ ok: boolean; error?: string }>, msg: string) {
    setErro("");
    startTransition(async () => {
      const r = await fn();
      if (!r.ok) {
        setErro(r.error ?? "Não foi possível concluir.");
        return;
      }
      setSucesso(msg);
      router.refresh();
    });
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
      <div className="animate-fade-up">
        <h1 style={{ fontSize: "1.5rem", marginBottom: "0.25rem" }}>Aprovações</h1>
        <p style={{ color: "var(--color-muted)", fontSize: "0.875rem" }}>
          {fila.length} despesa(s) aguardando · {formatarCentavos(total)}
          {semComprovante > 0 && (
            <span style={{ color: "#f59e0b" }}> · {semComprovante} sem comprovante</span>
          )}
        </p>
      </div>

      {erro && <Aviso tipo="erro" mensagem={erro} onFechar={() => setErro("")} />}
      {sucesso && <Aviso tipo="sucesso" mensagem={sucesso} autoFecharMs={4000} onFechar={() => setSucesso("")} />}

      {fila.length === 0 && (
        <p className="card" style={{ textAlign: "center", color: "var(--color-muted)", padding: "2.5rem" }}>
          Nada aguardando decisão. 👍
        </p>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
        {fila.map((d) => (
          <div
            key={d.id}
            className="card animate-fade-up"
            style={{ borderLeft: "3px solid #ffc107", display: "flex", flexDirection: "column", gap: "0.75rem" }}
          >
            <div style={{ display: "flex", gap: "0.875rem", alignItems: "flex-start" }}>
              {d.receiptUrl ? (
                <button
                  onClick={() => setAmpliada(d.receiptUrl)}
                  style={{ padding: 0, border: "none", background: "none", cursor: "zoom-in", flexShrink: 0 }}
                  title="Ampliar comprovante"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={d.receiptUrl}
                    alt="Comprovante"
                    style={{ width: "64px", height: "64px", objectFit: "cover", borderRadius: "4px", border: "1px solid var(--color-border)" }}
                  />
                </button>
              ) : (
                <div
                  style={{
                    width: "64px",
                    height: "64px",
                    flexShrink: 0,
                    borderRadius: "4px",
                    border: "1px dashed #f59e0b",
                    color: "#f59e0b",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: "0.6rem",
                    textAlign: "center",
                    padding: "0.25rem",
                    lineHeight: 1.2,
                  }}
                >
                  sem<br />comprov.
                </div>
              )}

              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 600 }}>{d.description}</div>
                <div style={{ fontSize: "0.75rem", color: "var(--color-muted)", marginTop: "2px" }}>
                  <strong style={{ color: "var(--color-accent)" }}>{d.userName}</strong> ·{" "}
                  {icone(d.categoryId)} {nome(d.categoryId)} · {formatDate(d.date)}
                </div>
              </div>

              <div style={{ fontWeight: 700, fontFamily: "var(--font-display)", fontSize: "1.05rem", flexShrink: 0 }}>
                {formatarCentavos(d.amountCents)}
              </div>
            </div>

            <div style={{ display: "flex", gap: "0.5rem" }}>
              <button
                className="btn btn-primary"
                style={{ flex: 1, justifyContent: "center" }}
                disabled={pendente}
                onClick={() => agir(() => aprovarDespesa(d.id), `Despesa de ${d.userName} aprovada.`)}
              >
                ✓ Aprovar
              </button>
              <button
                className="btn btn-danger"
                style={{ flex: 1, justifyContent: "center" }}
                disabled={pendente}
                onClick={() => {
                  setRejeitando(d);
                  setMotivo("");
                }}
              >
                ✕ Rejeitar
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Rejeição: motivo obrigatório (RF-15) */}
      {rejeitando && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            backgroundColor: "rgba(0,0,0,0.8)",
            backdropFilter: "blur(4px)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 60,
            padding: "1rem",
          }}
          onClick={(e) => e.target === e.currentTarget && setRejeitando(null)}
        >
          <div className="card" style={{ width: "100%", maxWidth: "440px", borderTop: "3px solid var(--color-danger)" }}>
            <h2 style={{ fontSize: "1.05rem", marginBottom: "0.5rem" }}>
              Rejeitar “{rejeitando.description}”
            </h2>
            <p style={{ fontSize: "0.8rem", color: "var(--color-muted)", marginBottom: "1rem" }}>
              {rejeitando.userName} verá este motivo e poderá corrigir e reenviar.
            </p>

            <textarea
              className="input-base"
              rows={3}
              placeholder="Ex: falta o comprovante; valor divergente do recibo"
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              style={{ resize: "none", marginBottom: "1rem" }}
              autoFocus
            />

            <div style={{ display: "flex", gap: "0.75rem", justifyContent: "flex-end" }}>
              <button className="btn btn-ghost" onClick={() => setRejeitando(null)} disabled={pendente}>
                Cancelar
              </button>
              <button
                className="btn btn-danger"
                disabled={pendente || !motivo.trim()}
                onClick={() => {
                  const alvo = rejeitando;
                  setRejeitando(null);
                  agir(() => rejeitarDespesa(alvo.id, motivo), `Despesa de ${alvo.userName} rejeitada.`);
                }}
              >
                Rejeitar
              </button>
            </div>
          </div>
        </div>
      )}

      {ampliada && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            backgroundColor: "rgba(0,0,0,0.92)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 70,
            padding: "1rem",
            cursor: "zoom-out",
          }}
          onClick={() => setAmpliada(null)}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={ampliada} alt="Comprovante ampliado" style={{ maxWidth: "100%", maxHeight: "92vh", objectFit: "contain" }} />
        </div>
      )}
    </div>
  );
}
