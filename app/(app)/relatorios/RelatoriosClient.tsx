"use client";

import { useMemo, useState, useTransition } from "react";
import { getPedidos } from "@/actions/reembolsos";
import { corDoStatus, jaAtendido, rotulo, rotuloCurto } from "@/lib/core/aprovacao";
import { formatCurrency, formatDate } from "@/lib/utils";
import { somar } from "@/lib/core/money";
import {
  exportarComprovanteDeLote,
  exportarPedidosPDF,
  exportarPedidosXLSX,
  type LinhaPedido,
} from "@/lib/core/exports/cliente";
import type { AprovacaoStatus, PaymentBatch, PedidoDeReembolso } from "@/types";

const SITUACOES: AprovacaoStatus[] = ["ENVIADA", "APROVADA", "REJEITADA", "RESSARCIDA"];

type Props = {
  isAdmin: boolean;
  pedidos: PedidoDeReembolso[];
  lotes: PaymentBatch[];
  equipe: Array<{ uid: string; name: string }>;
};

export function RelatoriosClient({ isAdmin, pedidos: iniciais, lotes, equipe }: Props) {
  const [pedidos, setPedidos] = useState(iniciais);
  const [pessoa, setPessoa] = useState("");
  const [situacao, setSituacao] = useState("");
  const [desde, setDesde] = useState("");
  const [ate, setAte] = useState("");
  const [erro, setErro] = useState("");
  const [isPending, startTransition] = useTransition();

  function aplicarFiltros() {
    setErro("");
    startTransition(async () => {
      try {
        setPedidos(await getPedidos({ userId: pessoa || undefined, situacao: situacao || undefined, desde, ate }));
      } catch {
        setErro("Não foi possível carregar os pedidos.");
      }
    });
  }

  function limpar() {
    setPessoa("");
    setSituacao("");
    setDesde("");
    setAte("");
    setErro("");
    startTransition(async () => setPedidos(await getPedidos({})));
  }

  // Separar atendido de em aberto é a informação central desta tela: é o que
  // impede alguém de cobrar de novo o que já recebeu.
  const totais = useMemo(() => {
    const atendidos = pedidos.filter((p) => jaAtendido(p.aprovacao));
    const emAberto = pedidos.filter((p) => !jaAtendido(p.aprovacao));
    return {
      atendidos,
      emAberto,
      totalAtendido: somar(...atendidos.map((p) => p.amount)),
      totalEmAberto: somar(...emAberto.map((p) => p.amount)),
      total: somar(...pedidos.map((p) => p.amount)),
      semComprovante: pedidos.filter((p) => !p.receiptUrl).length,
    };
  }, [pedidos]);

  const periodo =
    desde || ate
      ? `${desde ? formatDate(new Date(`${desde}T12:00:00`)) : "início"} a ${ate ? formatDate(new Date(`${ate}T12:00:00`)) : "hoje"}`
      : "todo o período";

  function linhas(lista: PedidoDeReembolso[]): LinhaPedido[] {
    return [...lista]
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
      .map((p) => ({
        data: p.date,
        pessoa: p.userName,
        descricao: p.description,
        categoria: p.categoryName,
        comprovante: Boolean(p.receiptUrl),
        situacao: rotulo(p.aprovacao),
        atendido: jaAtendido(p.aprovacao),
        atendidoEm: p.reimbursedAt,
        valor: p.amount,
      }));
  }

  function exportar(formato: "pdf" | "xlsx") {
    setErro("");
    startTransition(async () => {
      try {
        const quem = pessoa ? equipe.find((e) => e.uid === pessoa)?.name : isAdmin ? "Toda a equipe" : "";
        if (formato === "pdf") {
          await exportarPedidosPDF(linhas(pedidos), "Pedidos de reembolso", [quem, periodo].filter(Boolean).join(" · "));
        } else {
          await exportarPedidosXLSX(linhas(pedidos), "pedidos-de-reembolso");
        }
      } catch (e) {
        setErro("Não foi possível gerar o arquivo: " + (e instanceof Error ? e.message : ""));
      }
    });
  }

  function baixarComprovante(lote: PaymentBatch) {
    setErro("");
    startTransition(async () => {
      try {
        const doLote = pedidos.filter((p) => p.paymentBatchId === lote.id);
        await exportarComprovanteDeLote(lote, linhas(doLote));
      } catch (e) {
        setErro("Não foi possível gerar o comprovante: " + (e instanceof Error ? e.message : ""));
      }
    });
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
      <div>
        <h1 style={{ fontSize: "1.5rem", marginBottom: "0.25rem" }}>Relatórios</h1>
        <p style={{ color: "var(--color-muted)", fontSize: "0.875rem" }}>
          {isAdmin
            ? "Pedidos de reembolso de toda a equipe. Exporte em PDF ou Excel para enviar por WhatsApp."
            : "Seus pedidos de reembolso. Exporte em PDF ou Excel para enviar por WhatsApp."}
        </p>
      </div>

      {erro && (
        <div style={{ padding: "0.75rem 1rem", borderRadius: "4px", backgroundColor: "rgba(255, 77, 109, 0.1)", border: "1px solid rgba(255, 77, 109, 0.3)", color: "var(--color-danger)", fontSize: "0.85rem" }}>
          {erro}
        </div>
      )}

      {/* Filtros */}
      <div className="card" style={{ padding: "1rem", display: "grid", gap: "0.75rem", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", alignItems: "end" }}>
        {isAdmin && (
          <div>
            <label className="rot">Pessoa</label>
            <select className="input-base" value={pessoa} onChange={(e) => setPessoa(e.target.value)}>
              <option value="">Toda a equipe</option>
              {equipe.map((u) => (
                <option key={u.uid} value={u.uid}>{u.name}</option>
              ))}
            </select>
          </div>
        )}
        <div>
          <label className="rot">Situação</label>
          <select className="input-base" value={situacao} onChange={(e) => setSituacao(e.target.value)}>
            <option value="">Todas</option>
            {SITUACOES.map((s) => (
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
        <div style={{ display: "flex", gap: "0.5rem" }}>
          <button className="btn btn-primary" onClick={aplicarFiltros} disabled={isPending} style={{ flex: 1 }}>
            {isPending ? "..." : "Filtrar"}
          </button>
          <button className="btn btn-ghost" onClick={limpar} disabled={isPending}>Limpar</button>
        </div>
      </div>

      {/* Exportação */}
      <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
        <button className="btn btn-ghost" onClick={() => exportar("pdf")} disabled={isPending || pedidos.length === 0}>
          ↓ PDF
        </button>
        <button className="btn btn-ghost" onClick={() => exportar("xlsx")} disabled={isPending || pedidos.length === 0}>
          ↓ Excel (XLSX)
        </button>
      </div>

      {/* Totais — atendido separado de em aberto, sempre */}
      <div style={{ display: "grid", gap: "0.75rem", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))" }}>
        <Cartao rotulo="Pedidos no período" valor={String(pedidos.length)} />
        <Cartao
          rotulo={`A receber (${totais.emAberto.length})`}
          valor={formatCurrency(totais.totalEmAberto)}
          cor="#ffc107"
        />
        <Cartao
          rotulo={`Já atendidos (${totais.atendidos.length})`}
          valor={formatCurrency(totais.totalAtendido)}
          cor="var(--color-accent)"
        />
        <Cartao rotulo="Total geral" valor={formatCurrency(totais.total)} />
      </div>

      {totais.semComprovante > 0 && (
        <div style={{ padding: "0.75rem 1rem", borderRadius: "4px", backgroundColor: "rgba(255, 193, 7, 0.08)", border: "1px solid rgba(255, 193, 7, 0.3)", color: "#ffc107", fontSize: "0.82rem" }}>
          {totais.semComprovante} pedido(s) sem comprovante anexado. Sem a foto, a aprovação costuma demorar mais.
        </div>
      )}

      {/* Lista */}
      <div className="card" style={{ padding: 0, overflow: "hidden" }}>
        {pedidos.length === 0 ? (
          <p style={{ padding: "2rem", textAlign: "center", color: "var(--color-muted)" }}>
            Nenhum pedido de reembolso no período. Marque “Pedir reembolso” ao lançar em Transações.
          </p>
        ) : (
          <div style={{ overflowX: "auto", WebkitOverflowScrolling: "touch" }}>
            <table style={{ width: "100%", minWidth: "760px", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ backgroundColor: "var(--color-surface-2)", borderBottom: "1px solid var(--color-border)" }}>
                  {["Data", isAdmin ? "Pessoa" : "Descrição", isAdmin ? "Descrição" : "Categoria", "Comprov.", "Situação", "Valor"].map((h) => (
                    <th key={h} style={{ padding: "0.75rem 1rem", textAlign: "left", fontSize: "0.72rem", color: "var(--color-muted)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em" }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {pedidos.map((p) => {
                  const atendido = jaAtendido(p.aprovacao);
                  return (
                    <tr key={`${p.userId}-${p.id}`} style={{ borderBottom: "1px solid var(--color-border)", opacity: atendido ? 0.75 : 1 }}>
                      <td style={{ padding: "0.75rem 1rem", color: "var(--color-muted)", whiteSpace: "nowrap" }}>{formatDate(p.date)}</td>
                      {isAdmin && <td style={{ padding: "0.75rem 1rem" }}>{p.userName}</td>}
                      <td style={{ padding: "0.75rem 1rem" }}>
                        <div>{p.description}</div>
                        <div style={{ fontSize: "0.7rem", color: "var(--color-muted)", marginTop: "2px" }}>{p.categoryName}</div>
                        {p.aprovacao === "REJEITADA" && p.rejectionReason && (
                          <div style={{ fontSize: "0.7rem", color: "var(--color-danger)", marginTop: "2px" }}>
                            Motivo: {p.rejectionReason}
                          </div>
                        )}
                      </td>
                      {!isAdmin && <td style={{ padding: "0.75rem 1rem", color: "var(--color-muted)" }}>{p.categoryName}</td>}
                      <td style={{ padding: "0.75rem 1rem" }}>
                        {p.receiptUrl ? (
                          <a href={p.receiptUrl} target="_blank" rel="noopener noreferrer" style={{ color: "var(--color-accent)", textDecoration: "none" }}>
                            🧾 ver
                          </a>
                        ) : (
                          <span style={{ color: "#ffc107", fontSize: "0.72rem" }}>sem comprovante</span>
                        )}
                      </td>
                      <td style={{ padding: "0.75rem 1rem" }}>
                        <span style={{ fontSize: "0.68rem", fontWeight: 700, padding: "3px 8px", borderRadius: "3px", whiteSpace: "nowrap", color: corDoStatus(p.aprovacao).cor, backgroundColor: corDoStatus(p.aprovacao).fundo }}>
                          {rotuloCurto(p.aprovacao)}
                        </span>
                        {atendido && p.reimbursedAt && (
                          <div style={{ fontSize: "0.68rem", color: "var(--color-accent)", marginTop: "3px" }}>
                            pago em {formatDate(p.reimbursedAt)}
                          </div>
                        )}
                      </td>
                      <td style={{ padding: "0.75rem 1rem", fontWeight: 700, fontFamily: "var(--font-display)", whiteSpace: "nowrap", textDecoration: atendido ? "line-through" : "none", color: atendido ? "var(--color-muted)" : "inherit" }}>
                        {formatCurrency(p.amount)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Fechamentos já pagos */}
      {lotes.length > 0 && (
        <div className="card" style={{ padding: "1rem" }}>
          <h2 style={{ fontSize: "0.8rem", color: "var(--color-muted)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: "0.75rem" }}>
            Pagamentos fechados
          </h2>
          <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
            {lotes.map((lote) => (
              <div key={lote.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "0.75rem", padding: "0.65rem 0.75rem", borderRadius: "4px", backgroundColor: "var(--color-surface-2)", flexWrap: "wrap" }}>
                <div>
                  <div style={{ fontSize: "0.85rem", fontWeight: 600 }}>{lote.userName}</div>
                  <div style={{ fontSize: "0.7rem", color: "var(--color-muted)" }}>
                    {formatDate(lote.periodStart)} a {formatDate(lote.periodEnd)} · {lote.expenseCount} pedido(s)
                    {lote.paidAt && ` · pago em ${formatDate(lote.paidAt)}`}
                  </div>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
                  <span style={{ fontWeight: 700, fontFamily: "var(--font-display)", color: "var(--color-accent)" }}>
                    {formatCurrency(lote.totalCents / 100)}
                  </span>
                  <button className="btn btn-ghost" onClick={() => baixarComprovante(lote)} disabled={isPending} style={{ fontSize: "0.75rem" }}>
                    ↓ Comprovante
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <style jsx>{`
        .rot {
          font-size: 0.72rem;
          color: var(--color-muted);
          display: block;
          margin-bottom: 0.35rem;
        }
      `}</style>
    </div>
  );
}

function Cartao({ rotulo, valor, cor }: { rotulo: string; valor: string; cor?: string }) {
  return (
    <div className="card" style={{ padding: "0.9rem 1rem" }}>
      <div style={{ fontSize: "0.7rem", color: "var(--color-muted)", textTransform: "uppercase", letterSpacing: "0.06em" }}>
        {rotulo}
      </div>
      <div style={{ fontSize: "1.15rem", fontWeight: 700, fontFamily: "var(--font-display)", marginTop: "0.3rem", color: cor ?? "inherit" }}>
        {valor}
      </div>
    </div>
  );
}
