"use client";

import { useState } from "react";
import { formatCurrency, formatDate } from "@/lib/utils";
import { estornoAposPagamento, rotulo } from "@/lib/core/aprovacao";
import type { PedidoDeReembolso } from "@/types";

/**
 * Confirmação do estorno — o motivo é obrigatório e fica na cópia (RF-67).
 *
 * Um componente para a fila, Aprovados e o histórico: a mesma pergunta, feita
 * do mesmo jeito. O aviso de "já foi pago" aparece sozinho quando é o caso.
 */
export function ModalEstorno({
  pedido,
  ocupado,
  onConfirmar,
  onCancelar,
}: {
  pedido: PedidoDeReembolso;
  ocupado: boolean;
  onConfirmar: (motivo: string) => void;
  onCancelar: () => void;
}) {
  const [motivo, setMotivo] = useState("");
  const [erro, setErro] = useState("");
  const pago = estornoAposPagamento(pedido.aprovacao);

  function confirmar() {
    if (motivo.trim().length < 3) {
      setErro("Escreva o motivo do estorno — ele fica guardado junto com a cópia do lançamento.");
      return;
    }
    onConfirmar(motivo.trim());
  }

  return (
    <div className="overlay-modal" style={{ zIndex: 200 }} onClick={onCancelar}>
      <div className="card" style={{ padding: "1.25rem", maxWidth: "440px", width: "100%" }} onClick={(e) => e.stopPropagation()}>
        <h2 style={{ fontSize: "1.05rem", marginBottom: "0.35rem" }}>Estornar lançamento</h2>
        <p style={{ fontSize: "0.8rem", color: "var(--color-muted)", marginBottom: "0.5rem" }}>
          {pedido.userName} · {pedido.description} · {formatDate(pedido.date)} ·{" "}
          <strong style={{ color: "inherit" }}>{formatCurrency(pedido.amount)}</strong>
          {pedido.reembolso && ` · ${rotulo(pedido.aprovacao)}`}
        </p>

        <p style={{ fontSize: "0.78rem", color: "var(--color-muted)", marginBottom: "0.85rem", lineHeight: 1.5 }}>
          O lançamento sai de Transações da pessoa e o saldo da conta dela volta. Uma cópia fica
          guardada com o motivo, para auditoria e para reverter se for preciso.
        </p>

        {pago && (
          <p
            style={{
              fontSize: "0.8rem",
              color: "#f59e0b",
              padding: "0.6rem 0.75rem",
              borderRadius: "4px",
              border: "1px solid rgba(245, 158, 11, 0.4)",
              backgroundColor: "rgba(245, 158, 11, 0.08)",
              marginBottom: "0.85rem",
              lineHeight: 1.5,
            }}
          >
            ⚠ Este pedido <strong>já foi pago</strong>. O total do lote não muda — o dinheiro já saiu. O
            valor passa a constar como <strong>a compensar</strong> no comprovante, e o acerto é feito por
            fora, no próximo pagamento.
          </p>
        )}

        {erro && <p style={{ fontSize: "0.78rem", color: "var(--color-danger)", marginBottom: "0.5rem" }}>{erro}</p>}

        <label style={{ fontSize: "0.72rem", color: "var(--color-muted)", display: "block", marginBottom: "0.35rem" }}>
          Motivo (fica na cópia guardada)
        </label>
        <textarea
          className="input-base"
          rows={3}
          value={motivo}
          onChange={(e) => setMotivo(e.target.value)}
          placeholder="Ex: lançado em duplicidade — o mesmo almoço já estava no pedido anterior"
          style={{ resize: "none" }}
          autoFocus
        />

        <div style={{ display: "flex", gap: "0.5rem", justifyContent: "flex-end", marginTop: "0.85rem" }}>
          <button className="btn btn-ghost" onClick={onCancelar} disabled={ocupado}>Cancelar</button>
          <button className="btn btn-danger" onClick={confirmar} disabled={ocupado}>
            {ocupado ? "Estornando..." : "Estornar"}
          </button>
        </div>
      </div>
    </div>
  );
}

/** Marcador de gêmeo — o mesmo desenho na fila e em Aprovados (RF-71). */
export function SeloDuplicidade() {
  return (
    <span
      title="Há outro lançamento desta pessoa com o mesmo valor na mesma data"
      style={{
        fontSize: "0.65rem",
        fontWeight: 700,
        padding: "2px 6px",
        borderRadius: "3px",
        whiteSpace: "nowrap",
        color: "#f59e0b",
        backgroundColor: "rgba(245, 158, 11, 0.12)",
        border: "1px solid rgba(245, 158, 11, 0.35)",
      }}
    >
      ⚠ possível duplicidade
    </span>
  );
}
