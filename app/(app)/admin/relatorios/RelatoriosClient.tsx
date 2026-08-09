"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { fecharLoteDePagamento, obterPreviaFechamento } from "@/actions/expenses";
import { corDoStatus, rotulo } from "@/lib/core/expense-status";
import { formatarCentavos } from "@/lib/core/money";
import { formatDate } from "@/lib/utils";
import { Aviso } from "@/components/ui/Aviso";
import {
  exportarComprovanteDeLote,
  exportarDespesasPDF,
  exportarDespesasXLSX,
} from "@/lib/core/exports/cliente";
import type { Expense, ExpenseCategory, ExpenseStatus, PaymentBatch } from "@/types";

const STATUS: ExpenseStatus[] = ["ENVIADA", "APROVADA", "REJEITADA", "RESSARCIDA"];

function inicioDoMes() {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().split("T")[0];
}

export function RelatoriosClient({
  despesas,
  categorias,
  usuarios,
  lotes,
}: {
  despesas: Expense[];
  categorias: ExpenseCategory[];
  usuarios: Array<{ uid: string; name: string }>;
  lotes: PaymentBatch[];
}) {
  const router = useRouter();
  const [pendente, startTransition] = useTransition();
  const [erro, setErro] = useState("");
  const [sucesso, setSucesso] = useState("");

  const [pessoa, setPessoa] = useState("");
  const [situacao, setSituacao] = useState<"" | ExpenseStatus>("");
  const [desde, setDesde] = useState(inicioDoMes());
  const [ate, setAte] = useState(new Date().toISOString().split("T")[0]);

  const [fechando, setFechando] = useState<{ quantidade: number; totalCents: number } | null>(null);

  const filtradas = useMemo(() => {
    const d0 = new Date(desde);
    const d1 = new Date(`${ate}T23:59:59`);
    return despesas.filter((d) => {
      const data = new Date(d.date);
      if (pessoa && d.userId !== pessoa) return false;
      if (situacao && d.status !== situacao) return false;
      return data >= d0 && data <= d1;
    });
  }, [despesas, pessoa, situacao, desde, ate]);

  const porPessoa = useMemo(() => {
    const mapa = new Map<string, { nome: string; cents: number; qtd: number }>();
    for (const d of filtradas) {
      const atual = mapa.get(d.userId) ?? { nome: d.userName, cents: 0, qtd: 0 };
      atual.cents += d.amountCents;
      atual.qtd += 1;
      mapa.set(d.userId, atual);
    }
    return Array.from(mapa.values()).sort((a, b) => b.cents - a.cents);
  }, [filtradas]);

  const porCategoria = useMemo(() => {
    const mapa = new Map<string, number>();
    for (const d of filtradas) mapa.set(d.categoryId, (mapa.get(d.categoryId) ?? 0) + d.amountCents);
    return Array.from(mapa.entries())
      .map(([id, cents]) => ({ nome: categorias.find((c) => c.id === id)?.name ?? "—", cents }))
      .sort((a, b) => b.cents - a.cents);
  }, [filtradas, categorias]);

  const total = filtradas.reduce((s, d) => s + d.amountCents, 0);
  const nomePessoa = usuarios.find((u) => u.uid === pessoa)?.name ?? "";
  const periodo = `${formatDate(new Date(desde))} a ${formatDate(new Date(ate))}`;

  async function pedirFechamento() {
    setErro("");
    if (!pessoa) {
      setErro("Escolha a pessoa para fechar o lote.");
      return;
    }
    const r = await obterPreviaFechamento(pessoa, desde, ate);
    if (!r.ok) {
      setErro(r.error);
      return;
    }
    if (r.data.quantidade === 0) {
      setErro("Não há despesas aprovadas dessa pessoa nesse período.");
      return;
    }
    setFechando(r.data);
  }

  function confirmarFechamento() {
    setErro("");
    startTransition(async () => {
      const r = await fecharLoteDePagamento(pessoa, nomePessoa, desde, ate);
      setFechando(null);
      if (!r.ok) {
        setErro(r.error);
        return;
      }
      setSucesso(
        `Lote fechado: ${r.data.quantidade} despesa(s) de ${nomePessoa}, ${formatarCentavos(r.data.totalCents)}.`,
      );
      router.refresh();
    });
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
      <div className="animate-fade-up">
        <h1 style={{ fontSize: "1.5rem", marginBottom: "0.25rem" }}>Relatórios</h1>
        <p style={{ color: "var(--color-muted)", fontSize: "0.875rem" }}>
          {filtradas.length} despesa(s) · {formatarCentavos(total)}
        </p>
      </div>

      {erro && <Aviso tipo="erro" mensagem={erro} onFechar={() => setErro("")} />}
      {sucesso && <Aviso tipo="sucesso" mensagem={sucesso} autoFecharMs={6000} onFechar={() => setSucesso("")} />}

      {/* Filtros */}
      <div className="card" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: "0.75rem" }}>
        <div>
          <label className="rot">Pessoa</label>
          <select className="input-base" value={pessoa} onChange={(e) => setPessoa(e.target.value)}>
            <option value="">Todas</option>
            {usuarios.map((u) => (
              <option key={u.uid} value={u.uid}>{u.name}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="rot">Situação</label>
          <select className="input-base" value={situacao} onChange={(e) => setSituacao(e.target.value as ExpenseStatus | "")}>
            <option value="">Todas</option>
            {STATUS.map((s) => (
              <option key={s} value={s}>{rotulo(s)}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="rot">De</label>
          <input type="date" className="input-base" value={desde} onChange={(e) => setDesde(e.target.value)} />
        </div>
        <div>
          <label className="rot">Até</label>
          <input type="date" className="input-base" value={ate} onChange={(e) => setAte(e.target.value)} />
        </div>

        <style jsx>{`
          .rot {
            font-size: 0.7rem;
            color: var(--color-muted);
            display: block;
            margin-bottom: 0.3rem;
          }
        `}</style>
      </div>

      {/* Ações */}
      <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
        <button
          className="btn btn-ghost"
          style={{ fontSize: "0.8rem" }}
          disabled={filtradas.length === 0}
          onClick={() => exportarDespesasPDF(filtradas, categorias, "Relatório de despesas", `${nomePessoa || "Toda a equipe"} · ${periodo}`)}
        >
          ↓ PDF
        </button>
        <button
          className="btn btn-ghost"
          style={{ fontSize: "0.8rem" }}
          disabled={filtradas.length === 0}
          onClick={() => exportarDespesasXLSX(filtradas, categorias, "relatorio-despesas")}
        >
          ↓ XLSX
        </button>
        <button className="btn btn-primary" style={{ fontSize: "0.8rem", marginLeft: "auto" }} onClick={pedirFechamento} disabled={pendente}>
          Fechar lote de pagamento
        </button>
      </div>

      {/* Totais */}
      {porPessoa.length > 0 && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: "1rem" }}>
          <div className="card">
            <h2 style={{ fontSize: "0.8rem", color: "var(--color-muted)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: "0.75rem" }}>
              Por pessoa
            </h2>
            {porPessoa.map((p) => (
              <div key={p.nome} style={{ display: "flex", justifyContent: "space-between", fontSize: "0.85rem", padding: "0.25rem 0" }}>
                <span>{p.nome} <span style={{ color: "var(--color-muted)", fontSize: "0.7rem" }}>({p.qtd})</span></span>
                <strong>{formatarCentavos(p.cents)}</strong>
              </div>
            ))}
          </div>

          <div className="card">
            <h2 style={{ fontSize: "0.8rem", color: "var(--color-muted)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: "0.75rem" }}>
              Por categoria
            </h2>
            {porCategoria.map((c) => (
              <div key={c.nome} style={{ display: "flex", justifyContent: "space-between", fontSize: "0.85rem", padding: "0.25rem 0" }}>
                <span>{c.nome}</span>
                <strong>{formatarCentavos(c.cents)}</strong>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Lista */}
      <div className="card" style={{ padding: 0, overflow: "hidden" }}>
        <div style={{ overflowX: "auto", WebkitOverflowScrolling: "touch" }}>
          <table style={{ width: "100%", minWidth: "720px", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ backgroundColor: "var(--color-surface-2)", borderBottom: "1px solid var(--color-border)" }}>
                {["Data", "Pessoa", "Descrição", "Categoria", "Comprov.", "Situação", "Valor"].map((h) => (
                  <th key={h} style={{ padding: "0.7rem 0.9rem", textAlign: "left", fontSize: "0.7rem", color: "var(--color-muted)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em" }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtradas.length === 0 && (
                <tr><td colSpan={7} style={{ padding: "2rem", textAlign: "center", color: "var(--color-muted)" }}>Nada no período.</td></tr>
              )}
              {filtradas.map((d) => {
                const marca = corDoStatus(d.status);
                return (
                  <tr key={d.id} style={{ borderBottom: "1px solid var(--color-border)" }}>
                    <td style={{ padding: "0.6rem 0.9rem", whiteSpace: "nowrap", color: "var(--color-muted)" }}>{formatDate(d.date)}</td>
                    <td style={{ padding: "0.6rem 0.9rem" }}>{d.userName}</td>
                    <td style={{ padding: "0.6rem 0.9rem" }}>{d.description}</td>
                    <td style={{ padding: "0.6rem 0.9rem", color: "var(--color-muted)" }}>{categorias.find((c) => c.id === d.categoryId)?.name ?? "—"}</td>
                    <td style={{ padding: "0.6rem 0.9rem" }}>
                      {d.receiptUrl ? (
                        <a href={d.receiptUrl} target="_blank" rel="noopener noreferrer" style={{ color: "var(--color-accent)" }}>🧾</a>
                      ) : (
                        <span style={{ color: "#f59e0b", fontSize: "0.7rem" }}>⚠ não</span>
                      )}
                    </td>
                    <td style={{ padding: "0.6rem 0.9rem" }}>
                      <span className="badge" style={{ backgroundColor: marca.fundo, color: marca.cor, fontSize: "0.6rem" }}>{rotulo(d.status)}</span>
                    </td>
                    <td style={{ padding: "0.6rem 0.9rem", fontWeight: 700, fontFamily: "var(--font-display)", whiteSpace: "nowrap" }}>
                      {formatarCentavos(d.amountCents)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Lotes fechados */}
      {lotes.length > 0 && (
        <div className="card">
          <h2 style={{ fontSize: "0.8rem", color: "var(--color-muted)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: "0.75rem" }}>
            Fechamentos anteriores
          </h2>
          <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
            {lotes.map((l) => (
              <div key={l.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "0.75rem", flexWrap: "wrap", fontSize: "0.85rem", padding: "0.5rem", backgroundColor: "var(--color-surface-2)", borderRadius: "2px" }}>
                <div>
                  <strong>{l.userName}</strong>
                  <span style={{ color: "var(--color-muted)", fontSize: "0.7rem" }}>
                    {" "}· {formatDate(l.periodStart)} a {formatDate(l.periodEnd)} · {l.expenseCount} despesa(s)
                  </span>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
                  <strong style={{ color: "var(--color-accent)" }}>{formatarCentavos(l.totalCents)}</strong>
                  <button
                    className="btn btn-ghost"
                    style={{ fontSize: "0.7rem", padding: "0.2rem 0.5rem" }}
                    onClick={() =>
                      exportarComprovanteDeLote(
                        l,
                        despesas.filter((d) => d.paymentBatchId === l.id),
                        categorias,
                      )
                    }
                  >
                    ↓ comprovante
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Prévia obrigatória antes de fechar (Art. 1) */}
      {fechando && (
        <div
          style={{ position: "fixed", inset: 0, backgroundColor: "rgba(0,0,0,0.8)", backdropFilter: "blur(4px)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 60, padding: "1rem" }}
          onClick={(e) => e.target === e.currentTarget && !pendente && setFechando(null)}
        >
          <div className="card" style={{ width: "100%", maxWidth: "440px", borderTop: "3px solid var(--color-accent)" }}>
            <h2 style={{ fontSize: "1.05rem", marginBottom: "1rem" }}>Confirmar fechamento</h2>

            <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem", fontSize: "0.875rem", marginBottom: "1rem" }}>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span style={{ color: "var(--color-muted)" }}>Pessoa</span><strong>{nomePessoa}</strong>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span style={{ color: "var(--color-muted)" }}>Período</span><strong>{periodo}</strong>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span style={{ color: "var(--color-muted)" }}>Despesas aprovadas</span><strong>{fechando.quantidade}</strong>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", borderTop: "1px solid var(--color-border)", paddingTop: "0.5rem" }}>
                <span style={{ color: "var(--color-muted)" }}>Total a ressarcir</span>
                <strong style={{ color: "var(--color-accent)", fontSize: "1.05rem" }}>{formatarCentavos(fechando.totalCents)}</strong>
              </div>
            </div>

            <p style={{ fontSize: "0.75rem", color: "var(--color-muted)", marginBottom: "1rem" }}>
              As despesas serão marcadas como ressarcidas e não poderão mais ser alteradas.
            </p>

            <div style={{ display: "flex", gap: "0.75rem", justifyContent: "flex-end" }}>
              <button className="btn btn-ghost" onClick={() => setFechando(null)} disabled={pendente}>Cancelar</button>
              <button className="btn btn-primary" onClick={confirmarFechamento} disabled={pendente}>
                {pendente ? "Fechando..." : "Confirmar pagamento"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
