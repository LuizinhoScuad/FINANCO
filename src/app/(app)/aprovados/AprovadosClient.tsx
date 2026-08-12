"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { fecharLoteDePagamento, getPreviaDeLote } from "@/actions/reembolsos";
import { exportarPedidosPDF, exportarPedidosXLSX, type LinhaPedido } from "@/lib/core/exports/cliente";
import { rotulo } from "@/lib/core/aprovacao";
import { paraCampoDeData } from "@/lib/core/datas";
import { somar } from "@/lib/core/money";
import { formatCurrency, formatDate } from "@/lib/utils";
import type { PedidoDeReembolso } from "@/types";

type Props = {
  isAdmin: boolean;
  pedidos: PedidoDeReembolso[];
};

/** Uma pessoa e tudo o que ela tem aprovado à espera do pagamento. */
type Bloco = {
  userId: string;
  nome: string;
  pedidos: PedidoDeReembolso[];
  total: number;
  maisAntigo: Date;
  desde: string;
  ate: string;
  semComprovante: number;
};

export function AprovadosClient({ isAdmin, pedidos }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [erro, setErro] = useState("");
  const [aviso, setAviso] = useState("");
  const [previa, setPrevia] = useState<{ bloco: Bloco; quantidade: number; totalCents: number } | null>(null);

  const blocos = useMemo<Bloco[]>(() => {
    const porPessoa = new Map<string, PedidoDeReembolso[]>();
    for (const p of pedidos) {
      porPessoa.set(p.userId, [...(porPessoa.get(p.userId) ?? []), p]);
    }

    return [...porPessoa.entries()]
      .map(([userId, lista]) => {
        const ordenados = [...lista].sort((a, b) => a.date.getTime() - b.date.getTime());
        return {
          userId,
          nome: ordenados[0].userName,
          pedidos: ordenados,
          total: somar(...ordenados.map((p) => p.amount)),
          maisAntigo: ordenados[0].date,
          // O período do fechamento sai dos próprios pedidos: ninguém digita
          // data e ninguém erra o recorte.
          desde: paraCampoDeData(ordenados[0].date),
          ate: paraCampoDeData(ordenados[ordenados.length - 1].date),
          semComprovante: ordenados.filter((p) => !p.receiptUrl).length,
        };
      })
      .sort((a, b) => b.total - a.total);
  }, [pedidos]);

  const total = somar(...pedidos.map((p) => p.amount));
  const semComprovante = pedidos.filter((p) => !p.receiptUrl).length;
  const maisAntigo = pedidos.reduce<Date | null>(
    (antigo, p) => (antigo === null || p.date < antigo ? p.date : antigo),
    null,
  );
  // O relógio é lido uma vez, na montagem: lê-lo a cada renderização faria o
  // número mudar sozinho conforme a tela redesenha.
  const [agora] = useState(() => Date.now());
  const diasParado =
    maisAntigo === null ? 0 : Math.max(0, Math.floor((agora - maisAntigo.getTime()) / 86_400_000));

  function linhas(lista: PedidoDeReembolso[]): LinhaPedido[] {
    return [...lista]
      .sort((a, b) => a.date.getTime() - b.date.getTime())
      .map((p) => ({
        data: p.date,
        pessoa: p.userName,
        descricao: p.description,
        categoria: p.categoryName,
        comprovante: Boolean(p.receiptUrl),
        situacao: rotulo(p.aprovacao),
        atendido: false,
        atendidoEm: null,
        valor: p.amount,
      }));
  }

  function exportar(formato: "pdf" | "xlsx") {
    setErro("");
    startTransition(async () => {
      try {
        if (formato === "pdf") {
          await exportarPedidosPDF(
            linhas(pedidos),
            "Aprovados a pagar",
            isAdmin ? "Toda a equipe" : "Meus pedidos aprovados",
          );
        } else {
          await exportarPedidosXLSX(linhas(pedidos), "aprovados-a-pagar");
        }
      } catch (e) {
        setErro("Não foi possível gerar o arquivo: " + (e instanceof Error ? e.message : ""));
      }
    });
  }

  /** Prévia obrigatória: nada é escrito antes de mostrar o impacto (Art. 1). */
  function verPrevia(bloco: Bloco) {
    setErro("");
    setAviso("");
    startTransition(async () => {
      const p = await getPreviaDeLote(bloco.userId, bloco.desde, bloco.ate);
      setPrevia({ bloco, ...p });
    });
  }

  function confirmarFechamento() {
    if (!previa) return;
    const { bloco } = previa;
    if (
      !confirm(
        `Fechar o pagamento de ${bloco.nome}?\n\n${previa.quantidade} pedido(s) serão marcados como ATENDIDOS de uma vez, somando ${formatCurrency(previa.totalCents / 100)}. Isso não se desfaz pela tela.`,
      )
    ) {
      return;
    }
    setErro("");
    startTransition(async () => {
      const res = await fecharLoteDePagamento(bloco.userId, bloco.desde, bloco.ate);
      if (!res.ok) {
        setErro(res.error);
        return;
      }
      setPrevia(null);
      setAviso(
        `Pagamento de ${bloco.nome} fechado: ${res.data.quantidade} pedido(s), ${formatCurrency(res.data.totalCents / 100)}. O comprovante em PDF está em Relatórios.`,
      );
      router.refresh();
    });
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
      <div>
        <h1 style={{ fontSize: "1.5rem", marginBottom: "0.25rem" }}>Aprovados a pagar</h1>
        <p style={{ color: "var(--color-muted)", fontSize: "0.875rem" }}>
          {isAdmin
            ? "Tudo o que já foi aprovado e ainda não foi pago, por pessoa. É esta a conta que a empresa deve hoje."
            : "Seus pedidos já aprovados, à espera do pagamento. Nada aqui precisa de ação sua."}
        </p>
      </div>

      {erro && <Faixa tom="erro">{erro}</Faixa>}
      {aviso && <Faixa tom="ok">{aviso}</Faixa>}

      <div style={{ display: "grid", gap: "0.75rem", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))" }}>
        <Cartao rotulo="Total a pagar" valor={formatCurrency(total)} cor="#60a5fa" destaque />
        <Cartao rotulo="Pedidos aprovados" valor={String(pedidos.length)} />
        {isAdmin && <Cartao rotulo="Pessoas a pagar" valor={String(blocos.length)} />}
        <Cartao
          rotulo="Espera do mais antigo"
          valor={pedidos.length === 0 ? "—" : `${diasParado} dia(s)`}
          cor={diasParado >= 30 ? "#ffc107" : undefined}
        />
      </div>

      {semComprovante > 0 && (
        <Faixa tom="atencao">
          {semComprovante} pedido(s) aprovado(s) sem comprovante anexado. Vale anexar antes de pagar — é o
          documento que sustenta a saída.
        </Faixa>
      )}

      {pedidos.length > 0 && (
        <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
          <button className="btn btn-ghost" onClick={() => exportar("pdf")} disabled={isPending}>
            ↓ PDF
          </button>
          <button className="btn btn-ghost" onClick={() => exportar("xlsx")} disabled={isPending}>
            ↓ Excel (XLSX)
          </button>
        </div>
      )}

      {pedidos.length === 0 ? (
        <div className="card" style={{ padding: "2rem", textAlign: "center", color: "var(--color-muted)" }}>
          {isAdmin
            ? "Nenhum pedido aprovado à espera de pagamento. Nada devendo."
            : "Você não tem pedidos aprovados aguardando pagamento."}
        </div>
      ) : (
        blocos.map((bloco) => (
          <div key={bloco.userId} className="card" style={{ padding: 0, overflow: "hidden" }}>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                gap: "0.75rem",
                flexWrap: "wrap",
                padding: "0.85rem 1rem",
                backgroundColor: "var(--color-surface-2)",
                borderBottom: "1px solid var(--color-border)",
              }}
            >
              <div>
                <div style={{ fontWeight: 600 }}>{isAdmin ? bloco.nome : "A receber"}</div>
                <div style={{ fontSize: "0.72rem", color: "var(--color-muted)" }}>
                  {bloco.pedidos.length} pedido(s) · {formatDate(bloco.desde)} a {formatDate(bloco.ate)}
                  {bloco.semComprovante > 0 && ` · ${bloco.semComprovante} sem comprovante`}
                </div>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
                <span style={{ fontWeight: 700, fontFamily: "var(--font-display)", fontSize: "1.05rem", color: "#60a5fa" }}>
                  {formatCurrency(bloco.total)}
                </span>
                {isAdmin && (
                  <button className="btn btn-primary" onClick={() => verPrevia(bloco)} disabled={isPending} style={{ fontSize: "0.78rem" }}>
                    {isPending ? "..." : "Fechar pagamento"}
                  </button>
                )}
              </div>
            </div>

            {previa?.bloco.userId === bloco.userId && (
              <div style={{ padding: "0.9rem 1rem", borderBottom: "1px solid var(--color-border)", backgroundColor: "rgba(96, 165, 250, 0.06)" }}>
                {previa.quantidade === 0 ? (
                  <p style={{ fontSize: "0.85rem", color: "var(--color-muted)" }}>
                    Nada elegível neste período. Alguém pode ter fechado o pagamento em outra aba — recarregue a tela.
                  </p>
                ) : (
                  <>
                    <p style={{ fontSize: "0.88rem" }}>
                      Vão ser marcados como pagos <strong>{previa.quantidade}</strong> pedido(s) de{" "}
                      <strong>{bloco.nome}</strong>, de {formatDate(bloco.desde)} a {formatDate(bloco.ate)}, somando{" "}
                      <strong style={{ color: "var(--color-accent)" }}>{formatCurrency(previa.totalCents / 100)}</strong>.
                    </p>
                    <div style={{ display: "flex", gap: "0.5rem", marginTop: "0.75rem" }}>
                      <button className="btn btn-primary" onClick={confirmarFechamento} disabled={isPending}>
                        Confirmar pagamento
                      </button>
                      <button className="btn btn-ghost" onClick={() => setPrevia(null)} disabled={isPending}>
                        Cancelar
                      </button>
                    </div>
                  </>
                )}
              </div>
            )}

            <div style={{ display: "flex", flexDirection: "column" }}>
              {bloco.pedidos.map((p) => (
                <div
                  key={`${p.userId}-${p.id}`}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    gap: "1rem",
                    flexWrap: "wrap",
                    padding: "0.75rem 1rem",
                    borderBottom: "1px solid var(--color-border)",
                  }}
                >
                  <div style={{ minWidth: "180px", flex: 1 }}>
                    <div style={{ fontSize: "0.9rem" }}>{p.description}</div>
                    <div style={{ fontSize: "0.72rem", color: "var(--color-muted)", marginTop: "2px" }}>
                      {formatDate(p.date)} · {p.categoryName}
                      {p.approvedByName && ` · aprovado por ${p.approvedByName}`}
                    </div>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
                    {p.receiptUrl ? (
                      <a href={p.receiptUrl} target="_blank" rel="noopener noreferrer" style={{ fontSize: "0.75rem", color: "var(--color-accent)", textDecoration: "none" }}>
                        🧾 ver
                      </a>
                    ) : (
                      <span style={{ fontSize: "0.72rem", color: "#ffc107" }}>sem comprovante</span>
                    )}
                    <span style={{ fontWeight: 700, fontFamily: "var(--font-display)", whiteSpace: "nowrap" }}>
                      {formatCurrency(p.amount)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))
      )}
    </div>
  );
}

function Cartao({ rotulo, valor, cor, destaque }: { rotulo: string; valor: string; cor?: string; destaque?: boolean }) {
  return (
    <div className="card" style={{ padding: "0.9rem 1rem", borderColor: destaque ? "rgba(96, 165, 250, 0.4)" : undefined }}>
      <div style={{ fontSize: "0.7rem", color: "var(--color-muted)", textTransform: "uppercase", letterSpacing: "0.06em" }}>
        {rotulo}
      </div>
      <div style={{ fontSize: destaque ? "1.4rem" : "1.15rem", fontWeight: 700, fontFamily: "var(--font-display)", marginTop: "0.3rem", color: cor ?? "inherit" }}>
        {valor}
      </div>
    </div>
  );
}

function Faixa({ tom, children }: { tom: "erro" | "ok" | "atencao"; children: React.ReactNode }) {
  const cores = {
    erro: { cor: "var(--color-danger)", fundo: "rgba(255, 77, 109, 0.1)" },
    ok: { cor: "var(--color-accent)", fundo: "rgba(0, 217, 139, 0.1)" },
    atencao: { cor: "#ffc107", fundo: "rgba(255, 193, 7, 0.08)" },
  }[tom];

  return (
    <div style={{ padding: "0.75rem 1rem", borderRadius: "4px", backgroundColor: cores.fundo, border: `1px solid ${cores.cor}`, color: cores.cor, fontSize: "0.85rem" }}>
      {children}
    </div>
  );
}
