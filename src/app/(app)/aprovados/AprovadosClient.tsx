"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { fecharLoteDePagamento, getPedidos, getPreviaDeLote } from "@/actions/reembolsos";
import { exportarPedidosPDF, exportarPedidosXLSX, type LinhaPedido } from "@/lib/core/exports/cliente";
import { rotulo } from "@/lib/core/aprovacao";
import { atalhosDePeriodo, paraCampoDeData } from "@/lib/core/datas";
import { somar } from "@/lib/core/money";
import { Chip } from "@/components/ui/Chip";
import { formatCurrency, formatDate, formatDateTime } from "@/lib/utils";
import type { PedidoDeReembolso } from "@/types";

/**
 * Duas seções, duas perguntas diferentes.
 *
 *   A PAGAR — quanto a empresa deve hoje. Não tem filtro: filtro aqui só serviria
 *   para esconder dívida. É sempre tudo o que está aprovado.
 *
 *   PAGOS — o que já saiu. Este é histórico e cresce sem parar, então tem os
 *   filtros dele: período (que vai ao servidor), pessoa e busca (que respondem
 *   na hora). E diz, em texto, quanto o filtro está escondendo.
 */

type Props = {
  isAdmin: boolean;
  pedidos: PedidoDeReembolso[];
  pagos: PedidoDeReembolso[];
  equipe: Array<{ uid: string; name: string }>;
  /** Qual atalho de período o servidor já usou para carregar os pagos. */
  periodoInicial: string;
  /** Quantos pagamentos existem ao todo, ignorando período. */
  totalDePagos: number;
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

const AZUL = "#60a5fa";

export function AprovadosClient({ isAdmin, pedidos, pagos: pagosIniciais, equipe, periodoInicial, totalDePagos }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [erro, setErro] = useState("");
  const [aviso, setAviso] = useState("");
  const [previa, setPrevia] = useState<{ bloco: Bloco; quantidade: number; totalCents: number } | null>(null);

  // --- pagos: o que veio do servidor e os filtros de tela ---------------------
  const [pagos, setPagos] = useState(pagosIniciais);
  const [atalho, setAtalho] = useState(periodoInicial);
  const [pessoaPaga, setPessoaPaga] = useState("");
  const [buscaPaga, setBuscaPaga] = useState("");
  const [opcoes] = useState(atalhosDePeriodo);

  const [agora] = useState(() => Date.now());

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
  const diasParado =
    maisAntigo === null ? 0 : Math.max(0, Math.floor((agora - maisAntigo.getTime()) / 86_400_000));

  // --- pagos ------------------------------------------------------------------

  function carregarPagos(id: string) {
    const escolhido = opcoes.find((o) => o.id === id);
    setErro("");
    setAtalho(id);
    startTransition(async () => {
      try {
        setPagos(
          await getPedidos({
            situacao: "RESSARCIDA",
            desde: escolhido?.desde ?? "",
            ate: escolhido?.ate ?? "",
          }),
        );
      } catch {
        setErro("Não foi possível carregar os pagamentos do período.");
      }
    });
  }

  const termoPago = buscaPaga.trim().toLowerCase();

  const pagosFiltrados = useMemo(() => {
    return pagos
      .filter((p) => {
        if (pessoaPaga && p.userId !== pessoaPaga) return false;
        if (termoPago) {
          const alvo = [p.description, p.categoryName, p.userName, p.payee ?? ""].join(" ").toLowerCase();
          if (!alvo.includes(termoPago)) return false;
        }
        return true;
      })
      .sort((a, b) => {
        // Pelo pagamento, não pela data do gasto: aqui a pergunta é "o que saiu
        // do caixa, e quando".
        const pa = a.reimbursedAt?.getTime() ?? a.date.getTime();
        const pb = b.reimbursedAt?.getTime() ?? b.date.getTime();
        return pb - pa;
      });
  }, [pagos, pessoaPaga, termoPago]);

  const totalPago = somar(...pagosFiltrados.map((p) => p.amount));
  const ocultosPagos = pagos.length - pagosFiltrados.length;
  const valorOcultoPago = somar(
    ...pagos.map((p) => p.amount),
    -totalPago,
  );

  const foraDoPeriodo = Math.max(0, totalDePagos - pagos.length);

  const ultimoPagamento = pagosFiltrados.reduce<Date | null>(
    (ultimo, p) => (p.reimbursedAt && (ultimo === null || p.reimbursedAt > ultimo) ? p.reimbursedAt : ultimo),
    null,
  );

  const pagosPorPessoa = useMemo(() => {
    const mapa = new Map<string, { nome: string; quantos: number; total: number }>();
    for (const p of pagosFiltrados) {
      const atual = mapa.get(p.userId) ?? { nome: p.userName, quantos: 0, total: 0 };
      atual.quantos++;
      atual.total = somar(atual.total, p.amount);
      mapa.set(p.userId, atual);
    }
    return [...mapa.values()].sort((a, b) => b.total - a.total);
  }, [pagosFiltrados]);

  const periodoTexto = (() => {
    const o = opcoes.find((x) => x.id === atalho);
    return o ? `${o.texto.toLowerCase()} (${formatDate(o.desde)} a ${formatDate(o.ate)})` : "todo o período";
  })();

  // --- comum ------------------------------------------------------------------

  function linhas(lista: PedidoDeReembolso[], pago: boolean): LinhaPedido[] {
    return [...lista]
      .sort((a, b) => a.date.getTime() - b.date.getTime())
      .map((p) => ({
        data: p.date,
        pessoa: p.userName,
        descricao: p.description,
        categoria: p.categoryName,
        comprovante: Boolean(p.receiptUrl),
        situacao: rotulo(p.aprovacao),
        atendido: pago,
        atendidoEm: p.reimbursedAt,
        valor: p.amount,
      }));
  }

  function exportar(formato: "pdf" | "xlsx", quais: "a-pagar" | "pagos") {
    setErro("");
    startTransition(async () => {
      try {
        const pago = quais === "pagos";
        const lista = linhas(pago ? pagosFiltrados : pedidos, pago);
        const titulo = pago ? "Reembolsos pagos" : "Aprovados a pagar";
        const sub = pago
          ? [isAdmin ? (pessoaPaga ? equipe.find((e) => e.uid === pessoaPaga)?.name : "Toda a equipe") : "", periodoTexto]
              .filter(Boolean)
              .join(" · ")
          : isAdmin
            ? "Toda a equipe"
            : "Meus pedidos aprovados";

        if (formato === "pdf") {
          await exportarPedidosPDF(lista, titulo, sub);
        } else {
          await exportarPedidosXLSX(lista, pago ? "reembolsos-pagos" : "aprovados-a-pagar");
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
        <h1 style={{ fontSize: "1.5rem", marginBottom: "0.25rem" }}>Aprovados</h1>
        <p style={{ color: "var(--color-muted)", fontSize: "0.875rem" }}>
          {isAdmin
            ? "Em cima, o que a empresa deve hoje. Embaixo, o que já foi pago — com filtro de período."
            : "Em cima, o que você tem a receber. Embaixo, o que já foi pago a você."}
        </p>
      </div>

      {erro && <Faixa tom="erro">{erro}</Faixa>}
      {aviso && <Faixa tom="ok">{aviso}</Faixa>}

      {/* ================= A PAGAR ================= */}
      <Titulo texto="A pagar" cor={AZUL} detalhe="tudo o que está aprovado — sem filtro" />

      <div style={{ display: "grid", gap: "0.75rem", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))" }}>
        <Cartao rotulo="Total a pagar" valor={formatCurrency(total)} cor={AZUL} destaque />
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
          <button className="btn btn-ghost" onClick={() => exportar("pdf", "a-pagar")} disabled={isPending}>
            ↓ PDF
          </button>
          <button className="btn btn-ghost" onClick={() => exportar("xlsx", "a-pagar")} disabled={isPending}>
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
                <span style={{ fontWeight: 700, fontFamily: "var(--font-display)", fontSize: "1.05rem", color: AZUL }}>
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
                <Linha key={`${p.userId}-${p.id}`} pedido={p} />
              ))}
            </div>
          </div>
        ))
      )}

      {/* ================= PAGOS ================= */}
      <Titulo texto="Pagos" cor="var(--color-accent)" detalhe="o que já saiu do caixa" />

      <div className="card" style={{ padding: "1rem", display: "flex", flexDirection: "column", gap: "0.9rem" }}>
        <div>
          <label className="rot">Período — pela data do lançamento</label>
          <div style={{ display: "flex", gap: "0.4rem", flexWrap: "wrap" }}>
            {opcoes.map((o) => (
              <Chip key={o.id} texto={o.texto} ativo={atalho === o.id} onClick={() => carregarPagos(o.id)} />
            ))}
            <Chip texto="Tudo" ativo={atalho === "tudo"} onClick={() => carregarPagos("tudo")} />
          </div>
        </div>

        <div style={{ display: "grid", gap: "0.75rem", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", alignItems: "end" }}>
          {isAdmin && (
            <div>
              <label className="rot">Pessoa</label>
              <select className="input-base" value={pessoaPaga} onChange={(e) => setPessoaPaga(e.target.value)}>
                <option value="">Toda a equipe</option>
                {equipe.map((u) => (
                  <option key={u.uid} value={u.uid}>{u.name}</option>
                ))}
              </select>
            </div>
          )}
          <div>
            <label className="rot">Buscar</label>
            <input
              type="search"
              className="input-base"
              value={buscaPaga}
              onChange={(e) => setBuscaPaga(e.target.value)}
              placeholder="descrição, categoria, pessoa"
            />
          </div>
          <div style={{ display: "flex", gap: "0.5rem" }}>
            <button className="btn btn-ghost" onClick={() => exportar("pdf", "pagos")} disabled={isPending || pagosFiltrados.length === 0} style={{ flex: 1 }}>
              ↓ PDF
            </button>
            <button className="btn btn-ghost" onClick={() => exportar("xlsx", "pagos")} disabled={isPending || pagosFiltrados.length === 0} style={{ flex: 1 }}>
              ↓ Excel
            </button>
          </div>
        </div>

        <span style={{ fontSize: "0.78rem", color: "var(--color-muted)" }}>
          {isPending
            ? "Carregando…"
            : `Mostrando ${pagosFiltrados.length} de ${totalDePagos} pagamento(s) existentes · ${periodoTexto}`}
        </span>

        {/* O recorte de período acontece no BANCO: o que cai fora dele nem chega
            aqui. Sem este aviso, o total simplesmente vem menor — foi assim que
            um pagamento de R$ 37,00, carimbado em outro ano, sumiu da conta. */}
        {foraDoPeriodo > 0 && (
          <div style={{ fontSize: "0.78rem", color: "#ffc107" }}>
            {foraDoPeriodo} pagamento(s) estão fora deste período e não entram em nenhum total acima. Clique em
            “Tudo” para incluir — a data considerada é a do lançamento, não a do pagamento.
          </div>
        )}

        {ocultosPagos > 0 && (
          <div style={{ fontSize: "0.78rem", color: "#ffc107" }}>
            O filtro está escondendo {ocultosPagos} pagamento(s) do período, somando {formatCurrency(valorOcultoPago)}.
            Eles não entram nos totais desta seção nem no arquivo exportado.
          </div>
        )}
      </div>

      <div style={{ display: "grid", gap: "0.75rem", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))" }}>
        <Cartao rotulo="Total pago no período" valor={formatCurrency(totalPago)} cor="var(--color-accent)" destaque />
        <Cartao rotulo="Pagamentos" valor={String(pagosFiltrados.length)} />
        {isAdmin && <Cartao rotulo="Pessoas pagas" valor={String(pagosPorPessoa.length)} />}
        <Cartao rotulo="Último pagamento" valor={ultimoPagamento ? formatDate(ultimoPagamento) : "—"} />
      </div>

      {isAdmin && pagosPorPessoa.length > 1 && (
        <div className="card" style={{ padding: "1rem" }}>
          <h2 style={{ fontSize: "0.8rem", color: "var(--color-muted)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: "0.75rem" }}>
            Pago por pessoa
          </h2>
          <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem" }}>
            {pagosPorPessoa.map((p) => (
              <div key={p.nome} style={{ display: "flex", justifyContent: "space-between", gap: "0.75rem", fontSize: "0.85rem" }}>
                <span>{p.nome} <span style={{ color: "var(--color-muted)" }}>· {p.quantos} pagamento(s)</span></span>
                <strong style={{ fontFamily: "var(--font-display)" }}>{formatCurrency(p.total)}</strong>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="card" style={{ padding: 0, overflow: "hidden" }}>
        {pagosFiltrados.length === 0 ? (
          <p style={{ padding: "2rem", textAlign: "center", color: "var(--color-muted)" }}>
            {pagos.length === 0
              ? "Nenhum pagamento neste período. Experimente um período maior."
              : "Nenhum pagamento corresponde a estes filtros."}
          </p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column" }}>
            {pagosFiltrados.map((p) => (
              <Linha key={`pago-${p.userId}-${p.id}`} pedido={p} pago mostrarPessoa={isAdmin} />
            ))}
          </div>
        )}
      </div>

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

/** Um pedido na lista. O mesmo desenho nas duas seções, para não parecerem telas diferentes. */
function Linha({
  pedido: p,
  pago = false,
  mostrarPessoa = false,
}: {
  pedido: PedidoDeReembolso;
  pago?: boolean;
  mostrarPessoa?: boolean;
}) {
  return (
    <div
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
          {mostrarPessoa && ` · ${p.userName}`}
          {pago
            ? p.reimbursedAt && ` · pago em ${formatDateTime(p.reimbursedAt)}`
            : p.approvedByName && ` · aprovado por ${p.approvedByName}`}
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
        <span
          style={{
            fontWeight: 700,
            fontFamily: "var(--font-display)",
            whiteSpace: "nowrap",
            color: pago ? "var(--color-muted)" : "inherit",
          }}
        >
          {formatCurrency(p.amount)}
        </span>
      </div>
    </div>
  );
}

function Titulo({ texto, cor, detalhe }: { texto: string; cor: string; detalhe: string }) {
  return (
    <div style={{ display: "flex", alignItems: "baseline", gap: "0.6rem", flexWrap: "wrap", borderLeft: `3px solid ${cor}`, paddingLeft: "0.7rem" }}>
      <h2 style={{ fontSize: "1.05rem", color: cor }}>{texto}</h2>
      <span style={{ fontSize: "0.78rem", color: "var(--color-muted)" }}>{detalhe}</span>
    </div>
  );
}

function Cartao({ rotulo, valor, cor, destaque }: { rotulo: string; valor: string; cor?: string; destaque?: boolean }) {
  return (
    <div className="card" style={{ padding: "0.9rem 1rem", borderColor: destaque && cor ? `${cor}66` : undefined }}>
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
