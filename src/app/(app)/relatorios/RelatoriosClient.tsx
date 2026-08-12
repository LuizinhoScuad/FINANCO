"use client";

import { useMemo, useState, useTransition } from "react";
import { getPedidos } from "@/actions/reembolsos";
import { corDoStatus, jaAtendido, rotulo, rotuloCurto } from "@/lib/core/aprovacao";
import {
  hojeNoCampo,
  primeiroDiaDoMes,
  somarDias,
  ultimoDiaDoMes,
} from "@/lib/core/datas";
import { formatCurrency, formatDate, formatDateTime } from "@/lib/utils";
import { arredondar, somar } from "@/lib/core/money";
import {
  exportarComprovanteDeLote,
  exportarPedidosPDF,
  exportarPedidosXLSX,
  type LinhaPedido,
} from "@/lib/core/exports/cliente";
import type { AprovacaoStatus, PaymentBatch, PedidoDeReembolso } from "@/types";

/**
 * Relatórios — o filtro é a tela.
 *
 * O QUE MUDOU E POR QUÊ. Antes havia quatro campos soltos e um botão "Filtrar":
 * era preciso digitar duas datas para ver o mês passado, a situação era uma só
 * por vez, e o total mostrado não dizia o que tinha ficado de fora. Quem
 * filtrava por engano via um número menor sem nenhuma pista do motivo — e foi
 * assim que um lançamento aprovado pareceu ter sumido da conta.
 *
 * Agora:
 *   - o período tem atalhos (este mês, mês passado, últimos 30/90 dias, este
 *     ano) e só ele vai ao servidor: é o único recorte que precisa de consulta;
 *   - situação, pessoa, busca e comprovante filtram na hora, sobre o que já está
 *     na tela — a mesma resposta para qualquer pessoa, sem ida ao banco;
 *   - os totais são separados POR SITUAÇÃO e a tela diz, em texto, quanto o
 *     filtro está escondendo. Nenhum valor some em silêncio.
 */

const SITUACOES: AprovacaoStatus[] = ["ENVIADA", "APROVADA", "REJEITADA", "RESSARCIDA"];

type Comprovante = "todos" | "com" | "sem";
type Ordem = "data-desc" | "data-asc" | "valor-desc" | "valor-asc" | "pessoa";

const ORDENS: Array<{ valor: Ordem; texto: string }> = [
  { valor: "data-desc", texto: "Data — mais recente" },
  { valor: "data-asc", texto: "Data — mais antiga" },
  { valor: "valor-desc", texto: "Valor — maior" },
  { valor: "valor-asc", texto: "Valor — menor" },
  { valor: "pessoa", texto: "Pessoa (A–Z)" },
];

type Props = {
  isAdmin: boolean;
  pedidos: PedidoDeReembolso[];
  lotes: PaymentBatch[];
  equipe: Array<{ uid: string; name: string }>;
};

/** Atalhos de período. Calculados pelo relógio de quem usa, não pelo do servidor. */
function atalhos(): Array<{ id: string; texto: string; desde: string; ate: string }> {
  const hoje = hojeNoCampo();
  const mesPassado = somarDias(primeiroDiaDoMes(hoje), -1);

  return [
    { id: "mes", texto: "Este mês", desde: primeiroDiaDoMes(hoje), ate: ultimoDiaDoMes(hoje) },
    {
      id: "mes-passado",
      texto: "Mês passado",
      desde: primeiroDiaDoMes(mesPassado),
      ate: ultimoDiaDoMes(mesPassado),
    },
    { id: "30", texto: "Últimos 30 dias", desde: somarDias(hoje, -29), ate: hoje },
    { id: "90", texto: "Últimos 90 dias", desde: somarDias(hoje, -89), ate: hoje },
    { id: "ano", texto: "Este ano", desde: `${hoje.slice(0, 4)}-01-01`, ate: `${hoje.slice(0, 4)}-12-31` },
  ];
}

export function RelatoriosClient({ isAdmin, pedidos: iniciais, lotes, equipe }: Props) {
  // Do servidor: só o recorte de período mexe nisto.
  const [doPeriodo, setDoPeriodo] = useState(iniciais);
  const [desde, setDesde] = useState("");
  const [ate, setAte] = useState("");

  // Na tela: respondem na hora, sem ida ao banco.
  const [situacoes, setSituacoes] = useState<Set<AprovacaoStatus>>(new Set(SITUACOES));
  const [pessoa, setPessoa] = useState("");
  const [busca, setBusca] = useState("");
  const [comprovante, setComprovante] = useState<Comprovante>("todos");
  const [ordem, setOrdem] = useState<Ordem>("data-desc");
  const [agrupar, setAgrupar] = useState(false);

  const [erro, setErro] = useState("");
  const [isPending, startTransition] = useTransition();

  // Calculado uma vez, na montagem: os atalhos leem o relógio, e ler o relógio
  // durante a renderização deixaria a tela dependendo de quando ela redesenha.
  const [opcoes] = useState(atalhos);

  function carregar(novoDesde: string, novoAte: string) {
    setErro("");
    setDesde(novoDesde);
    setAte(novoAte);
    startTransition(async () => {
      try {
        setDoPeriodo(await getPedidos({ desde: novoDesde, ate: novoAte }));
      } catch {
        setErro("Não foi possível carregar os pedidos.");
      }
    });
  }

  function limparTudo() {
    setSituacoes(new Set(SITUACOES));
    setPessoa("");
    setBusca("");
    setComprovante("todos");
    setOrdem("data-desc");
    carregar("", "");
  }

  function alternarSituacao(s: AprovacaoStatus) {
    setSituacoes((atual) => {
      const proxima = new Set(atual);
      if (proxima.has(s)) proxima.delete(s);
      else proxima.add(s);
      // Nenhuma situação marcada mostraria uma tela vazia sem explicação:
      // desmarcar a última equivale a marcar todas de novo.
      return proxima.size === 0 ? new Set(SITUACOES) : proxima;
    });
  }

  const termo = busca.trim().toLowerCase();

  const filtrados = useMemo(() => {
    const lista = doPeriodo.filter((p) => {
      if (p.aprovacao && !situacoes.has(p.aprovacao)) return false;
      if (pessoa && p.userId !== pessoa) return false;
      if (comprovante === "com" && !p.receiptUrl) return false;
      if (comprovante === "sem" && p.receiptUrl) return false;
      if (termo) {
        const alvo = [p.description, p.categoryName, p.userName, p.payee ?? "", p.notes ?? ""]
          .join(" ")
          .toLowerCase();
        if (!alvo.includes(termo)) return false;
      }
      return true;
    });

    return lista.sort((a, b) => {
      switch (ordem) {
        case "data-asc":
          return a.date.getTime() - b.date.getTime();
        case "valor-desc":
          return b.amount - a.amount;
        case "valor-asc":
          return a.amount - b.amount;
        case "pessoa":
          return a.userName.localeCompare(b.userName, "pt-BR") || b.date.getTime() - a.date.getTime();
        default:
          return b.date.getTime() - a.date.getTime();
      }
    });
  }, [doPeriodo, situacoes, pessoa, comprovante, termo, ordem]);

  /** Totais por situação — nenhum valor fica escondido dentro de um balde só. */
  const totais = useMemo(() => {
    const por = (s: AprovacaoStatus) => filtrados.filter((p) => p.aprovacao === s);
    const aguardando = por("ENVIADA");
    const aPagar = por("APROVADA");
    const rejeitados = por("REJEITADA");
    const pagos = por("RESSARCIDA");

    return {
      aguardando,
      aPagar,
      rejeitados,
      pagos,
      totalAguardando: somar(...aguardando.map((p) => p.amount)),
      totalAPagar: somar(...aPagar.map((p) => p.amount)),
      totalRejeitado: somar(...rejeitados.map((p) => p.amount)),
      totalPago: somar(...pagos.map((p) => p.amount)),
      total: somar(...filtrados.map((p) => p.amount)),
      semComprovante: filtrados.filter((p) => !p.receiptUrl).length,
    };
  }, [filtrados]);

  /** O que o filtro deixou de fora — dito em número, não deduzido pelo usuário. */
  const ocultos = doPeriodo.length - filtrados.length;
  const valorOculto = arredondar(somar(...doPeriodo.map((p) => p.amount)) - totais.total);

  const porPessoa = useMemo(() => {
    if (!agrupar) return [];
    const mapa = new Map<string, { nome: string; quantos: number; total: number }>();
    for (const p of filtrados) {
      const atual = mapa.get(p.userId) ?? { nome: p.userName, quantos: 0, total: 0 };
      atual.quantos++;
      atual.total = somar(atual.total, p.amount);
      mapa.set(p.userId, atual);
    }
    return [...mapa.values()].sort((a, b) => b.total - a.total);
  }, [filtrados, agrupar]);

  const periodoTexto =
    desde || ate
      ? `${desde ? formatDate(desde) : "início"} a ${ate ? formatDate(ate) : "hoje"}`
      : "todo o período";

  const atalhoAtivo = opcoes.find((o) => o.desde === desde && o.ate === ate)?.id ?? (desde || ate ? "livre" : "tudo");

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
        // Exporta EXATAMENTE o que está na tela: o arquivo e a tela nunca
        // discordam, mesmo com filtro apertado.
        if (formato === "pdf") {
          await exportarPedidosPDF(
            linhas(filtrados),
            "Pedidos de reembolso",
            [quem, periodoTexto].filter(Boolean).join(" · "),
          );
        } else {
          await exportarPedidosXLSX(linhas(filtrados), "pedidos-de-reembolso");
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
        const doLote = doPeriodo.filter((p) => p.paymentBatchId === lote.id);
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

      <div className="card" style={{ padding: "1rem", display: "flex", flexDirection: "column", gap: "0.9rem" }}>
        {/* Período — o único filtro que vai ao servidor */}
        <div>
          <label className="rot">Período</label>
          <div style={{ display: "flex", gap: "0.4rem", flexWrap: "wrap" }}>
            <Chip texto="Tudo" ativo={atalhoAtivo === "tudo"} onClick={() => carregar("", "")} />
            {opcoes.map((o) => (
              <Chip key={o.id} texto={o.texto} ativo={atalhoAtivo === o.id} onClick={() => carregar(o.desde, o.ate)} />
            ))}
          </div>
        </div>

        <div style={{ display: "grid", gap: "0.75rem", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", alignItems: "end" }}>
          <div>
            <label className="rot">De</label>
            <input
              type="date"
              className="input-base"
              value={desde}
              max={ate || undefined}
              onChange={(e) => carregar(e.target.value, ate)}
            />
          </div>
          <div>
            <label className="rot">Até</label>
            <input
              type="date"
              className="input-base"
              value={ate}
              min={desde || undefined}
              onChange={(e) => carregar(desde, e.target.value)}
            />
          </div>
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
            <label className="rot">Comprovante</label>
            <select className="input-base" value={comprovante} onChange={(e) => setComprovante(e.target.value as Comprovante)}>
              <option value="todos">Tanto faz</option>
              <option value="com">Só com comprovante</option>
              <option value="sem">Só sem comprovante</option>
            </select>
          </div>
          <div>
            <label className="rot">Ordenar por</label>
            <select className="input-base" value={ordem} onChange={(e) => setOrdem(e.target.value as Ordem)}>
              {ORDENS.map((o) => (
                <option key={o.valor} value={o.valor}>{o.texto}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="rot">Buscar</label>
            <input
              type="search"
              className="input-base"
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="descrição, categoria, pessoa"
            />
          </div>
        </div>

        {/* Situação — várias ao mesmo tempo */}
        <div>
          <label className="rot">Situação (marque quantas quiser)</label>
          <div style={{ display: "flex", gap: "0.4rem", flexWrap: "wrap" }}>
            {SITUACOES.map((s) => (
              <Chip
                key={s}
                texto={rotuloCurto(s)}
                ativo={situacoes.has(s)}
                cor={corDoStatus(s).cor}
                onClick={() => alternarSituacao(s)}
              />
            ))}
            <Chip
              texto="Só o que falta receber"
              ativo={situacoes.size === 2 && situacoes.has("ENVIADA") && situacoes.has("APROVADA")}
              onClick={() => setSituacoes(new Set<AprovacaoStatus>(["ENVIADA", "APROVADA"]))}
            />
            <Chip texto="Todas" ativo={situacoes.size === SITUACOES.length} onClick={() => setSituacoes(new Set(SITUACOES))} />
          </div>
        </div>

        <div style={{ display: "flex", gap: "0.75rem", alignItems: "center", flexWrap: "wrap", justifyContent: "space-between" }}>
          <span style={{ fontSize: "0.78rem", color: "var(--color-muted)" }}>
            {isPending ? "Carregando…" : `Mostrando ${filtrados.length} de ${doPeriodo.length} pedido(s) · ${periodoTexto}`}
          </span>
          <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
            {isAdmin && (
              <button className="btn btn-ghost" onClick={() => setAgrupar((v) => !v)} style={{ fontSize: "0.78rem" }}>
                {agrupar ? "✓ Somar por pessoa" : "Somar por pessoa"}
              </button>
            )}
            <button className="btn btn-ghost" onClick={limparTudo} disabled={isPending} style={{ fontSize: "0.78rem" }}>
              Limpar filtros
            </button>
          </div>
        </div>

        {ocultos > 0 && (
          <div style={{ fontSize: "0.78rem", color: "#ffc107" }}>
            O filtro está escondendo {ocultos} pedido(s) do período, somando {formatCurrency(valorOculto)}. Eles não
            entram em nenhum total desta tela nem no arquivo exportado.
          </div>
        )}
      </div>

      {/* Exportação */}
      <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
        <button className="btn btn-ghost" onClick={() => exportar("pdf")} disabled={isPending || filtrados.length === 0}>
          ↓ PDF
        </button>
        <button className="btn btn-ghost" onClick={() => exportar("xlsx")} disabled={isPending || filtrados.length === 0}>
          ↓ Excel (XLSX)
        </button>
      </div>

      {/* Totais — um por situação, mais o geral */}
      <div style={{ display: "grid", gap: "0.75rem", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))" }}>
        <Cartao
          rotulo={`Aguardando (${totais.aguardando.length})`}
          valor={formatCurrency(totais.totalAguardando)}
          cor={corDoStatus("ENVIADA").cor}
        />
        <Cartao
          rotulo={`Aprovados a pagar (${totais.aPagar.length})`}
          valor={formatCurrency(totais.totalAPagar)}
          cor={corDoStatus("APROVADA").cor}
        />
        <Cartao
          rotulo={`Já pagos (${totais.pagos.length})`}
          valor={formatCurrency(totais.totalPago)}
          cor={corDoStatus("RESSARCIDA").cor}
        />
        <Cartao
          rotulo={`Rejeitados (${totais.rejeitados.length})`}
          valor={formatCurrency(totais.totalRejeitado)}
          cor={corDoStatus("REJEITADA").cor}
        />
        <Cartao rotulo={`Total do filtro (${filtrados.length})`} valor={formatCurrency(totais.total)} />
      </div>

      {agrupar && porPessoa.length > 0 && (
        <div className="card" style={{ padding: "1rem" }}>
          <h2 style={{ fontSize: "0.8rem", color: "var(--color-muted)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: "0.75rem" }}>
            Soma por pessoa
          </h2>
          <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem" }}>
            {porPessoa.map((p) => (
              <div key={p.nome} style={{ display: "flex", justifyContent: "space-between", gap: "0.75rem", fontSize: "0.85rem" }}>
                <span>{p.nome} <span style={{ color: "var(--color-muted)" }}>· {p.quantos} pedido(s)</span></span>
                <strong style={{ fontFamily: "var(--font-display)" }}>{formatCurrency(p.total)}</strong>
              </div>
            ))}
          </div>
        </div>
      )}

      {totais.semComprovante > 0 && (
        <div style={{ padding: "0.75rem 1rem", borderRadius: "4px", backgroundColor: "rgba(255, 193, 7, 0.08)", border: "1px solid rgba(255, 193, 7, 0.3)", color: "#ffc107", fontSize: "0.82rem" }}>
          {totais.semComprovante} pedido(s) sem comprovante anexado. Sem a foto, a aprovação costuma demorar mais.
        </div>
      )}

      {/* Lista */}
      <div className="card" style={{ padding: 0, overflow: "hidden" }}>
        {filtrados.length === 0 ? (
          <p style={{ padding: "2rem", textAlign: "center", color: "var(--color-muted)" }}>
            {doPeriodo.length === 0
              ? "Nenhum pedido de reembolso no período. Marque “Pedir reembolso” ao lançar em Transações."
              : "Nenhum pedido corresponde a estes filtros. Use “Limpar filtros” para ver o período inteiro."}
          </p>
        ) : (
          <>
          {/* Celular: cartão por pedido. A tabela escondia de lado justamente a
              coluna que mais importa aqui — a situação e o valor. */}
          <div className="so-celular cartao-lista">
            {filtrados.map((p) => {
              const atendido = jaAtendido(p.aprovacao);
              return (
                <div key={`m-${p.userId}-${p.id}`} className="cartao-item" style={{ opacity: atendido ? 0.75 : 1 }}>
                  <div className="cartao-topo">
                    <span className="cartao-titulo">{p.description}</span>
                    <span
                      className="cartao-valor"
                      style={{
                        textDecoration: atendido ? "line-through" : "none",
                        color: atendido ? "var(--color-muted)" : "inherit",
                      }}
                    >
                      {formatCurrency(p.amount)}
                    </span>
                  </div>

                  <div className="cartao-meta">
                    <span>{formatDate(p.date)}</span>
                    {isAdmin && <span>{p.userName}</span>}
                    <span>{p.categoryName}</span>
                  </div>

                  {p.aprovacao === "REJEITADA" && p.rejectionReason && (
                    <div style={{ fontSize: "0.72rem", color: "var(--color-danger)" }}>
                      Motivo: {p.rejectionReason}
                    </div>
                  )}

                  <div className="cartao-acoes">
                    <span
                      style={{
                        fontSize: "0.68rem",
                        fontWeight: 700,
                        padding: "4px 10px",
                        borderRadius: "4px",
                        color: corDoStatus(p.aprovacao).cor,
                        backgroundColor: corDoStatus(p.aprovacao).fundo,
                      }}
                    >
                      {rotuloCurto(p.aprovacao)}
                      {atendido && p.reimbursedAt && ` · pago em ${formatDateTime(p.reimbursedAt)}`}
                    </span>

                    {p.receiptUrl ? (
                      <a
                        href={p.receiptUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{ fontSize: "0.72rem", color: "var(--color-accent)", textDecoration: "none", alignSelf: "center" }}
                      >
                        🧾 ver comprovante
                      </a>
                    ) : (
                      <span style={{ fontSize: "0.7rem", color: "#ffc107", alignSelf: "center" }}>sem comprovante</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Computador: a tabela. */}
          <div className="so-computador" style={{ overflowX: "auto", WebkitOverflowScrolling: "touch" }}>
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
                {filtrados.map((p) => {
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
                            pago em {formatDateTime(p.reimbursedAt)}
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
          </>
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
                    {lote.paidAt && ` · pago em ${formatDateTime(lote.paidAt)}`}
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

/** Botão de filtro que mostra, pelo próprio desenho, se está ligado. */
function Chip({
  texto,
  ativo,
  cor,
  onClick,
}: {
  texto: string;
  ativo: boolean;
  cor?: string;
  onClick: () => void;
}) {
  const destaque = cor ?? "var(--color-accent)";
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={ativo}
      style={{
        fontSize: "0.75rem",
        fontWeight: ativo ? 700 : 500,
        padding: "0.3rem 0.7rem",
        borderRadius: "999px",
        cursor: "pointer",
        whiteSpace: "nowrap",
        color: ativo ? destaque : "var(--color-muted)",
        border: `1px solid ${ativo ? destaque : "var(--color-border)"}`,
        backgroundColor: ativo ? "var(--color-surface-2)" : "transparent",
        transition: "all 0.15s",
      }}
    >
      {texto}
    </button>
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
