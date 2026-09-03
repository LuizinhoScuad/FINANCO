"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  aprovarPedido,
  aprovarTodosDaPessoa,
  fecharLoteDePagamento,
  getPreviaDeLote,
  rejeitarPedido,
} from "@/actions/reembolsos";
import { formatCurrency, formatDate } from "@/lib/utils";
import { somar } from "@/lib/core/money";
import type { PedidoDeReembolso } from "@/types";

type Props = {
  fila: PedidoDeReembolso[];
  equipe: Array<{ uid: string; name: string }>;
};

export function AprovacoesClient({ fila, equipe }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [erro, setErro] = useState("");
  const [aviso, setAviso] = useState("");
  const [rejeitando, setRejeitando] = useState<PedidoDeReembolso | null>(null);
  const [motivo, setMotivo] = useState("");

  // Fechamento de lote
  const [pessoa, setPessoa] = useState("");
  const [desde, setDesde] = useState("");
  const [ate, setAte] = useState("");
  const [previa, setPrevia] = useState<{
    quantidade: number;
    totalCents: number;
    semDadosBancarios: boolean;
  } | null>(null);

  // Filtro da fila. Com uma pessoa só o painel é curto; com sete, decidir
  // pedido a pedido misturando todo mundo vira caça ao tesouro.
  const [filtroPessoa, setFiltroPessoa] = useState("");

  /** Quem realmente tem pedido esperando — não a equipe inteira. */
  const naFila = useMemo(() => {
    const contagem = new Map<string, { nome: string; quantos: number; soma: number }>();
    for (const p of fila) {
      const atual = contagem.get(p.userId) ?? { nome: p.userName, quantos: 0, soma: 0 };
      atual.quantos++;
      atual.soma = somar(atual.soma, p.amount);
      contagem.set(p.userId, atual);
    }
    return [...contagem.entries()].sort((a, b) => a[1].nome.localeCompare(b[1].nome, "pt-BR"));
  }, [fila]);

  const visiveis = filtroPessoa ? fila.filter((p) => p.userId === filtroPessoa) : fila;
  const total = somar(...visiveis.map((p) => p.amount));
  const nomeFiltrado = naFila.find(([uid]) => uid === filtroPessoa)?.[1].nome ?? "";

  function aprovarTudoDaPessoa() {
    if (!filtroPessoa) return;
    if (!confirm(`Aprovar de uma vez os ${visiveis.length} pedido(s) de ${nomeFiltrado}, somando ${formatCurrency(total)}?`)) {
      return;
    }
    setErro("");
    setAviso("");
    startTransition(async () => {
      const res = await aprovarTodosDaPessoa(filtroPessoa);
      if (!res.ok) {
        setErro(res.error);
        return;
      }
      const { aprovados, falharam, primeiroErro } = res.data;
      setAviso(
        falharam === 0
          ? `${aprovados} pedido(s) de ${nomeFiltrado} aprovados. Agora feche o pagamento abaixo.`
          : `${aprovados} aprovado(s), ${falharam} não passaram. ${primeiroErro ?? ""}`,
      );
      router.refresh();
    });
  }

  function executar(acao: () => Promise<{ ok: boolean; error?: string }>, sucesso: string) {
    setErro("");
    setAviso("");
    startTransition(async () => {
      const res = await acao();
      if (!res.ok) {
        setErro(res.error ?? "Não foi possível concluir.");
        return;
      }
      setAviso(sucesso);
      router.refresh();
    });
  }

  function confirmarRejeicao() {
    if (!rejeitando) return;
    const alvo = rejeitando;
    if (motivo.trim().length < 3) {
      setErro("Escreva o motivo da rejeição — a pessoa precisa saber o que corrigir.");
      return;
    }
    executar(
      () => rejeitarPedido(alvo.userId, alvo.id, motivo.trim()),
      `Pedido de ${alvo.userName} rejeitado. Ela pode corrigir e reenviar.`,
    );
    setRejeitando(null);
    setMotivo("");
  }

  /** Prévia obrigatória antes de escrever qualquer coisa (Art. 1). */
  function verPrevia() {
    setErro("");
    setAviso("");
    if (!pessoa || !desde || !ate) {
      setErro("Escolha a pessoa e o período do fechamento.");
      return;
    }
    startTransition(async () => setPrevia(await getPreviaDeLote(pessoa, desde, ate)));
  }

  function confirmarFechamento() {
    const nome = equipe.find((e) => e.uid === pessoa)?.name ?? "";
    if (!confirm(`Fechar o pagamento de ${nome}?\n\n${previa?.quantidade} pedido(s) serão marcados como ATENDIDOS de uma vez. Isso não se desfaz pela tela.`)) {
      return;
    }
    setErro("");
    startTransition(async () => {
      const res = await fecharLoteDePagamento(pessoa, desde, ate);
      if (!res.ok) {
        setErro(res.error);
        return;
      }
      setPrevia(null);
      setAviso(
        `Lote fechado: ${res.data.quantidade} pedido(s) de ${nome}, ${formatCurrency(res.data.totalCents / 100)}. O comprovante em PDF está em Relatórios.`,
      );
      router.refresh();
    });
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
      <div>
        <h1 style={{ fontSize: "1.5rem", marginBottom: "0.25rem" }}>Aprovações</h1>
        <p style={{ color: "var(--color-muted)", fontSize: "0.875rem" }}>
          {visiveis.length} pedido(s) aguardando decisão · {formatCurrency(total)}
          {filtroPessoa && ` · ${nomeFiltrado}`}
        </p>
      </div>

      {erro && <Faixa tom="erro">{erro}</Faixa>}
      {aviso && <Faixa tom="ok">{aviso}</Faixa>}

      {/* Filtro por pessoa + aprovação em bloco */}
      {naFila.length > 0 && (
        <div className="card" style={{ padding: "0.85rem 1rem", display: "flex", gap: "0.75rem", alignItems: "center", flexWrap: "wrap" }}>
          <span style={{ fontSize: "0.75rem", color: "var(--color-muted)", textTransform: "uppercase", letterSpacing: "0.06em" }}>
            Pessoa
          </span>

          <button
            className="btn btn-ghost"
            onClick={() => setFiltroPessoa("")}
            style={{
              fontSize: "0.8rem",
              padding: "0.25rem 0.75rem",
              color: !filtroPessoa ? "var(--color-accent)" : undefined,
              borderColor: !filtroPessoa ? "var(--color-accent)" : undefined,
            }}
          >
            Todas ({fila.length})
          </button>

          {naFila.map(([uid, info]) => (
            <button
              key={uid}
              className="btn btn-ghost"
              onClick={() => setFiltroPessoa(uid)}
              title={`${info.quantos} pedido(s) · ${formatCurrency(info.soma)}`}
              style={{
                fontSize: "0.8rem",
                padding: "0.25rem 0.75rem",
                color: filtroPessoa === uid ? "var(--color-accent)" : undefined,
                borderColor: filtroPessoa === uid ? "var(--color-accent)" : undefined,
              }}
            >
              {info.nome} ({info.quantos})
            </button>
          ))}

          {filtroPessoa && (
            <button
              className="btn btn-primary"
              onClick={aprovarTudoDaPessoa}
              disabled={isPending || visiveis.length === 0}
              style={{ marginLeft: "auto", fontSize: "0.8rem" }}
            >
              {isPending ? "..." : `✓ Aprovar os ${visiveis.length} de ${nomeFiltrado}`}
            </button>
          )}
        </div>
      )}

      {/* Fila */}
      <div className="card" style={{ padding: 0, overflow: "hidden" }}>
        {visiveis.length === 0 ? (
          <p style={{ padding: "2rem", textAlign: "center", color: "var(--color-muted)" }}>
            {fila.length === 0
              ? "Nada aguardando decisão. Tudo em dia."
              : `Nada aguardando decisão de ${nomeFiltrado}.`}
          </p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column" }}>
            {visiveis.map((p) => (
              <div
                key={`${p.userId}-${p.id}`}
                style={{ padding: "1rem", borderBottom: "1px solid var(--color-border)", display: "flex", gap: "1rem", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap" }}
              >
                <div style={{ minWidth: "200px", flex: 1 }}>
                  <div style={{ fontWeight: 600 }}>{p.description}</div>
                  <div style={{ fontSize: "0.75rem", color: "var(--color-muted)", marginTop: "3px" }}>
                    {p.userName} · {p.categoryName} · {formatDate(p.date)}
                  </div>
                  <div style={{ marginTop: "0.4rem" }}>
                    {p.receiptUrl ? (
                      <a href={p.receiptUrl} target="_blank" rel="noopener noreferrer" style={{ color: "var(--color-accent)", fontSize: "0.78rem", textDecoration: "none" }}>
                        🧾 ver comprovante
                      </a>
                    ) : (
                      <span style={{ color: "#ffc107", fontSize: "0.75rem", fontWeight: 600 }}>
                        ⚠ sem comprovante
                      </span>
                    )}
                  </div>
                </div>

                <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", flexWrap: "wrap" }}>
                  <span style={{ fontWeight: 700, fontFamily: "var(--font-display)", fontSize: "1.05rem" }}>
                    {formatCurrency(p.amount)}
                  </span>
                  <button
                    className="btn btn-primary"
                    disabled={isPending}
                    onClick={() => executar(() => aprovarPedido(p.userId, p.id), `Pedido de ${p.userName} aprovado.`)}
                    style={{ fontSize: "0.8rem" }}
                  >
                    Aprovar
                  </button>
                  <button
                    className="btn btn-danger"
                    disabled={isPending}
                    onClick={() => { setRejeitando(p); setMotivo(""); setErro(""); }}
                    style={{ fontSize: "0.8rem" }}
                  >
                    Rejeitar
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Fechamento de pagamento */}
      <div className="card" style={{ padding: "1rem" }}>
        <h2 style={{ fontSize: "0.8rem", color: "var(--color-muted)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: "0.75rem" }}>
          Fechar pagamento
        </h2>
        <p style={{ fontSize: "0.78rem", color: "var(--color-muted)", marginBottom: "0.85rem" }}>
          Marca de uma vez, como atendidos, todos os pedidos <strong>já aprovados</strong> daquela pessoa no período. O comprovante em PDF fica disponível em Relatórios.
        </p>

        <div style={{ display: "grid", gap: "0.75rem", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", alignItems: "end" }}>
          <div>
            <label className="rot">Pessoa</label>
            <select className="input-base" value={pessoa || filtroPessoa} onChange={(e) => { setPessoa(e.target.value); setPrevia(null); }}>
              <option value="">Selecionar</option>
              {equipe.map((u) => (
                <option key={u.uid} value={u.uid}>{u.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="rot">De</label>
            <input type="date" className="input-base" value={desde} onChange={(e) => { setDesde(e.target.value); setPrevia(null); }} />
          </div>
          <div>
            <label className="rot">Até</label>
            <input type="date" className="input-base" value={ate} onChange={(e) => { setAte(e.target.value); setPrevia(null); }} />
          </div>
          <button className="btn btn-ghost" onClick={verPrevia} disabled={isPending}>
            {isPending ? "..." : "Ver prévia"}
          </button>
        </div>

        {previa && (
          <div style={{ marginTop: "1rem", padding: "0.9rem", borderRadius: "4px", border: "1px dashed var(--color-border)", backgroundColor: "var(--color-surface-2)" }}>
            {previa.quantidade === 0 ? (
              <p style={{ fontSize: "0.85rem", color: "var(--color-muted)" }}>
                Nenhum pedido aprovado nesse período para essa pessoa. Aprove primeiro na fila acima.
              </p>
            ) : (
              <>
                <p style={{ fontSize: "0.9rem" }}>
                  <strong>{previa.quantidade}</strong> pedido(s) aprovado(s), somando{" "}
                  <strong style={{ color: "var(--color-accent)" }}>{formatCurrency(previa.totalCents / 100)}</strong>.
                </p>

                {previa.semDadosBancarios && (
                  <p style={{ fontSize: "0.82rem", color: "#f59e0b", marginTop: "0.5rem" }}>
                    ⚠ Esta pessoa ainda não cadastrou os dados para reembolso — o
                    comprovante sairá sem PIX e sem conta.
                  </p>
                )}

                <button className="btn btn-primary" onClick={confirmarFechamento} disabled={isPending} style={{ marginTop: "0.75rem" }}>
                  Confirmar fechamento
                </button>
              </>
            )}
          </div>
        )}
      </div>

      {/* Rejeição — o motivo é obrigatório */}
      {rejeitando && (
        <div
          className="overlay-modal"
          style={{ zIndex: 200 }}
          onClick={() => setRejeitando(null)}
        >
          <div className="card" style={{ padding: "1.25rem", maxWidth: "420px", width: "100%" }} onClick={(e) => e.stopPropagation()}>
            <h2 style={{ fontSize: "1.05rem", marginBottom: "0.35rem" }}>Rejeitar pedido</h2>
            <p style={{ fontSize: "0.8rem", color: "var(--color-muted)", marginBottom: "0.85rem" }}>
              {rejeitando.userName} · {rejeitando.description} · {formatCurrency(rejeitando.amount)}
            </p>
            <label className="rot">Motivo (a pessoa vai ler isto)</label>
            <textarea
              className="input-base"
              rows={3}
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              placeholder="Ex: falta a foto do comprovante"
              style={{ resize: "none" }}
            />
            <div style={{ display: "flex", gap: "0.5rem", justifyContent: "flex-end", marginTop: "0.85rem" }}>
              <button className="btn btn-ghost" onClick={() => setRejeitando(null)}>Cancelar</button>
              <button className="btn btn-danger" onClick={confirmarRejeicao} disabled={isPending}>Rejeitar</button>
            </div>
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

function Faixa({ tom, children }: { tom: "erro" | "ok"; children: React.ReactNode }) {
  const cor = tom === "erro" ? "var(--color-danger)" : "var(--color-accent)";
  const fundo = tom === "erro" ? "rgba(255, 77, 109, 0.1)" : "rgba(0, 217, 139, 0.1)";
  return (
    <div style={{ padding: "0.75rem 1rem", borderRadius: "4px", backgroundColor: fundo, border: `1px solid ${cor}`, color: cor, fontSize: "0.85rem" }}>
      {children}
    </div>
  );
}
