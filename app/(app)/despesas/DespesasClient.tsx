"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  corrigirDespesa,
  registrarDespesa,
  reenviarDespesa,
  removerDespesa,
} from "@/actions/expenses";
import { corDoStatus, podeEditar, rotulo } from "@/lib/core/expense-status";
import { formatarCentavos, paraReais } from "@/lib/core/money";
import { formatDate } from "@/lib/utils";
import { Aviso } from "@/components/ui/Aviso";
import { exportarDespesasPDF, exportarDespesasXLSX } from "@/lib/core/exports/cliente";
import type { Expense, ExpenseCategory } from "@/types";

type Aba = "lista" | "nova";

export function DespesasClient({
  despesas,
  categorias,
}: {
  despesas: Expense[];
  categorias: ExpenseCategory[];
}) {
  const router = useRouter();
  const [pendente, startTransition] = useTransition();
  const [aba, setAba] = useState<Aba>("lista");
  const [erro, setErro] = useState("");
  const [sucesso, setSucesso] = useState("");
  const [editando, setEditando] = useState<Expense | null>(null);

  // formulário
  const [valor, setValor] = useState("");
  const [data, setData] = useState(new Date().toISOString().split("T")[0]);
  const [categoriaId, setCategoriaId] = useState("");
  const [descricao, setDescricao] = useState("");
  const [receiptUrl, setReceiptUrl] = useState("");
  const [receiptPath, setReceiptPath] = useState("");
  const [previa, setPrevia] = useState("");
  const [statusFoto, setStatusFoto] = useState("");
  const [enviandoFoto, setEnviandoFoto] = useState(false);
  const [idEnvio, setIdEnvio] = useState(() => crypto.randomUUID());
  const cameraRef = useRef<HTMLInputElement>(null);

  const totais = useMemo(() => {
    const porStatus = (s: Expense["status"]) =>
      despesas.filter((d) => d.status === s).reduce((t, d) => t + d.amountCents, 0);
    return {
      aguardando: porStatus("ENVIADA"),
      aprovada: porStatus("APROVADA"),
      ressarcida: porStatus("RESSARCIDA"),
      corrigir: despesas.filter((d) => d.status === "REJEITADA").length,
    };
  }, [despesas]);

  function limparFormulario() {
    setValor("");
    setData(new Date().toISOString().split("T")[0]);
    setCategoriaId("");
    setDescricao("");
    setReceiptUrl("");
    setReceiptPath("");
    setPrevia("");
    setStatusFoto("");
    setEditando(null);
    setIdEnvio(crypto.randomUUID());
  }

  /**
   * Envia a foto separadamente do formulário.
   *
   * Falha de upload não pode apagar o que já foi digitado: na rua, com sinal
   * ruim, isso significaria perder a despesa (RNF-02).
   */
  async function handleFoto(e: React.ChangeEvent<HTMLInputElement>) {
    const arquivo = e.target.files?.[0];
    if (!arquivo) return;
    if (cameraRef.current) cameraRef.current.value = "";

    setPrevia(URL.createObjectURL(arquivo));
    setEnviandoFoto(true);
    setStatusFoto("Enviando foto...");

    try {
      const { uploadReceipt } = await import("@/lib/firebase-storage");
      const url = await Promise.race([
        uploadReceipt(arquivo, "expenses"),
        new Promise<never>((_, rej) => setTimeout(() => rej(new Error("demorou demais")), 30000)),
      ]);
      setReceiptUrl(url);
      setStatusFoto("✓ Foto anexada");
    } catch (err) {
      setStatusFoto(
        `⚠ A foto não subiu (${err instanceof Error ? err.message : "erro"}). Você pode registrar sem ela.`,
      );
    } finally {
      setEnviandoFoto(false);
    }

    // OCR é um bônus: se falhar, ninguém fica sabendo e o registro segue.
    try {
      const { createWorker } = await import("tesseract.js");
      const leitura = createWorker("por").then(async (w) => {
        const r = await w.recognize(arquivo);
        await w.terminate();
        return r.data.text;
      });
      const texto = await Promise.race([
        leitura,
        new Promise<null>((res) => setTimeout(() => res(null), 20000)),
      ]);
      if (!texto) return;

      const achado =
        texto.match(/R\$\s*([\d.,]+)/i)?.[1] ??
        texto.match(/(?:TOTAL|VALOR|PAGO)[^\d]*([\d.,]+)/i)?.[1];
      if (achado && !valor) setValor(achado.replace(/\./g, "").replace(",", "."));
    } catch {
      /* silêncio proposital */
    }
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    fd.set("submissionId", idEnvio);
    if (receiptUrl) fd.set("receiptUrl", receiptUrl);
    if (receiptPath) fd.set("receiptPath", receiptPath);

    setErro("");
    startTransition(async () => {
      const res = editando ? await corrigirDespesa(editando.id, fd) : await registrarDespesa(fd);

      if (!res.ok) {
        setErro(res.error);
        return;
      }

      const semFoto = !editando && res.data?.semComprovante;
      setSucesso(
        semFoto
          ? "Despesa registrada sem comprovante — o gestor verá esse aviso."
          : editando
            ? "Despesa corrigida e pronta para reenviar."
            : "Despesa registrada e enviada.",
      );
      limparFormulario();
      setAba("lista");
      router.refresh();
    });
  }

  function acao(fn: () => Promise<{ ok: boolean; error?: string }>, msg: string) {
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

  function editar(d: Expense) {
    setEditando(d);
    setValor(String(paraReais(d.amountCents)));
    setData(new Date(d.date).toISOString().split("T")[0]);
    setCategoriaId(d.categoryId);
    setDescricao(d.description);
    setReceiptUrl(d.receiptUrl ?? "");
    setPrevia(d.receiptUrl ?? "");
    setStatusFoto(d.receiptUrl ? "✓ Foto anexada" : "");
    setAba("nova");
  }

  const nomeCategoria = (id: string) => categorias.find((c) => c.id === id)?.name ?? "—";
  const iconeCategoria = (id: string) => categorias.find((c) => c.id === id)?.icon ?? "📌";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
      <div className="animate-fade-up">
        <h1 style={{ fontSize: "1.5rem", marginBottom: "0.25rem" }}>Minhas despesas</h1>
        <p style={{ color: "var(--color-muted)", fontSize: "0.875rem" }}>
          Gastos de rua para ressarcimento
        </p>
      </div>

      {erro && <Aviso tipo="erro" mensagem={erro} onFechar={() => setErro("")} />}
      {sucesso && <Aviso tipo="sucesso" mensagem={sucesso} autoFecharMs={5000} onFechar={() => setSucesso("")} />}
      {totais.corrigir > 0 && aba === "lista" && (
        <Aviso
          tipo="atencao"
          mensagem={`${totais.corrigir} despesa(s) foram rejeitadas e aguardam sua correção.`}
        />
      )}

      <div style={{ display: "flex", gap: "0.5rem" }}>
        <button
          className={aba === "lista" ? "btn btn-primary" : "btn btn-ghost"}
          onClick={() => setAba("lista")}
          style={{ flex: 1, justifyContent: "center" }}
        >
          Minhas despesas
        </button>
        <button
          className={aba === "nova" ? "btn btn-primary" : "btn btn-ghost"}
          onClick={() => {
            limparFormulario();
            setAba("nova");
          }}
          style={{ flex: 1, justifyContent: "center" }}
        >
          + Registrar
        </button>
      </div>

      {aba === "nova" && (
        <form onSubmit={handleSubmit} className="card" style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
          <h2 style={{ fontSize: "1rem" }}>{editando ? "Corrigir despesa" : "Nova despesa"}</h2>

          {editando?.rejectionReason && (
            <Aviso tipo="atencao" mensagem={`Motivo da rejeição: ${editando.rejectionReason}`} />
          )}

          <input ref={cameraRef} type="file" accept="image/*" capture="environment" style={{ display: "none" }} onChange={handleFoto} />

          <button
            type="button"
            className="btn btn-ghost"
            onClick={() => cameraRef.current?.click()}
            disabled={enviandoFoto}
            style={{
              width: "100%",
              justifyContent: "center",
              borderStyle: "dashed",
              borderColor: "var(--color-accent)",
              color: enviandoFoto ? "var(--color-muted)" : "var(--color-accent)",
              padding: "1rem",
            }}
          >
            {enviandoFoto ? "⏳ enviando..." : previa ? "📷 Trocar foto" : "📷 Fotografar comprovante"}
          </button>

          {previa && (
            <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={previa} alt="Comprovante" style={{ width: "56px", height: "56px", objectFit: "cover", borderRadius: "4px", border: "1px solid var(--color-border)" }} />
              <span style={{ fontSize: "0.75rem", color: statusFoto.startsWith("⚠") ? "var(--color-danger)" : "var(--color-accent)" }}>
                {statusFoto}
              </span>
            </div>
          )}

          <p style={{ fontSize: "0.7rem", color: "var(--color-muted)", marginTop: "-0.5rem" }}>
            A foto é opcional. Sem ela, a despesa fica marcada como “sem comprovante”.
          </p>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem" }}>
            <div>
              <label className="rotulo">Valor (R$)</label>
              <input
                name="amount"
                type="number"
                inputMode="decimal"
                step="0.01"
                min="0.01"
                className="input-base"
                placeholder="0,00"
                value={valor}
                onChange={(e) => setValor(e.target.value)}
                required
                style={{ fontSize: "1.1rem", fontWeight: 600 }}
              />
            </div>
            <div>
              <label className="rotulo">Data</label>
              <input name="date" type="date" className="input-base" value={data} onChange={(e) => setData(e.target.value)} required />
            </div>
          </div>

          <div>
            <label className="rotulo">Categoria</label>
            <select name="categoryId" className="input-base" value={categoriaId} onChange={(e) => setCategoriaId(e.target.value)} required>
              <option value="">Escolher</option>
              {categorias.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.icon} {c.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="rotulo">Descrição</label>
            <input
              name="description"
              className="input-base"
              placeholder="Ex: almoço com cliente"
              value={descricao}
              onChange={(e) => setDescricao(e.target.value)}
              required
              minLength={2}
            />
          </div>

          <div style={{ display: "flex", gap: "0.75rem" }}>
            <button type="button" className="btn btn-ghost" onClick={() => { limparFormulario(); setAba("lista"); }} style={{ flex: 1, justifyContent: "center" }}>
              Cancelar
            </button>
            <button type="submit" className="btn btn-primary" disabled={pendente || enviandoFoto} style={{ flex: 2, justifyContent: "center" }}>
              {pendente ? "Salvando..." : enviandoFoto ? "Aguarde a foto..." : editando ? "Salvar correção" : "Registrar e enviar"}
            </button>
          </div>

          <style jsx>{`
            .rotulo {
              font-size: 0.75rem;
              color: var(--color-muted);
              display: block;
              margin-bottom: 0.375rem;
            }
          `}</style>
        </form>
      )}

      {aba === "lista" && (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))", gap: "0.5rem" }}>
            {[
              { r: "Aguardando", v: totais.aguardando, c: "#ffc107" },
              { r: "Aprovado", v: totais.aprovada, c: "#60a5fa" },
              { r: "Ressarcido", v: totais.ressarcida, c: "var(--color-accent)" },
            ].map(({ r, v, c }) => (
              <div key={r} className="card" style={{ padding: "0.75rem", borderLeft: `3px solid ${c}` }}>
                <div style={{ fontSize: "0.65rem", color: "var(--color-muted)", textTransform: "uppercase", letterSpacing: "0.06em" }}>{r}</div>
                <div style={{ fontWeight: 700, fontFamily: "var(--font-display)", color: c }}>{formatarCentavos(v)}</div>
              </div>
            ))}
          </div>

          {despesas.length > 0 && (
            <div style={{ display: "flex", gap: "0.5rem" }}>
              <button className="btn btn-ghost" style={{ flex: 1, justifyContent: "center", fontSize: "0.8rem" }} onClick={() => exportarDespesasPDF(despesas, categorias, "Minhas despesas")}>
                ↓ PDF
              </button>
              <button className="btn btn-ghost" style={{ flex: 1, justifyContent: "center", fontSize: "0.8rem" }} onClick={() => exportarDespesasXLSX(despesas, categorias, "minhas-despesas")}>
                ↓ XLSX
              </button>
            </div>
          )}

          <div style={{ display: "flex", flexDirection: "column", gap: "0.625rem" }}>
            {despesas.length === 0 && (
              <p className="card" style={{ textAlign: "center", color: "var(--color-muted)", padding: "2rem" }}>
                Nenhuma despesa registrada ainda.
              </p>
            )}

            {despesas.map((d) => {
              const marca = corDoStatus(d.status);
              return (
                <div key={d.id} className="card animate-fade-up" style={{ borderLeft: `3px solid ${marca.cor}`, display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: "0.75rem", alignItems: "flex-start" }}>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontWeight: 600 }}>
                        {iconeCategoria(d.categoryId)} {d.description}
                      </div>
                      <div style={{ fontSize: "0.7rem", color: "var(--color-muted)", marginTop: "2px" }}>
                        {nomeCategoria(d.categoryId)} · {formatDate(d.date)}
                      </div>
                    </div>
                    <div style={{ textAlign: "right", flexShrink: 0 }}>
                      <div style={{ fontWeight: 700, fontFamily: "var(--font-display)" }}>{formatarCentavos(d.amountCents)}</div>
                      <span className="badge" style={{ backgroundColor: marca.fundo, color: marca.cor, fontSize: "0.6rem", marginTop: "2px" }}>
                        {rotulo(d.status)}
                      </span>
                    </div>
                  </div>

                  <div style={{ display: "flex", gap: "0.5rem", alignItems: "center", flexWrap: "wrap", fontSize: "0.7rem" }}>
                    {d.receiptUrl ? (
                      <a href={d.receiptUrl} target="_blank" rel="noopener noreferrer" style={{ color: "var(--color-accent)", textDecoration: "none" }}>
                        🧾 ver comprovante
                      </a>
                    ) : (
                      <span style={{ color: "#f59e0b" }}>⚠ sem comprovante</span>
                    )}

                    {d.status === "REJEITADA" && d.rejectionReason && (
                      <span style={{ color: "var(--color-danger)" }}>· {d.rejectionReason}</span>
                    )}
                    {d.status === "RESSARCIDA" && d.reimbursedAt && (
                      <span style={{ color: "var(--color-muted)" }}>· pago em {formatDate(d.reimbursedAt)}</span>
                    )}
                  </div>

                  {podeEditar(d.status) && (
                    <div style={{ display: "flex", gap: "0.5rem" }}>
                      <button className="btn btn-ghost" style={{ fontSize: "0.75rem" }} onClick={() => editar(d)} disabled={pendente}>
                        Corrigir
                      </button>
                      {d.status === "REJEITADA" && (
                        <button className="btn btn-primary" style={{ fontSize: "0.75rem" }} disabled={pendente} onClick={() => acao(() => reenviarDespesa(d.id), "Despesa reenviada.")}>
                          Reenviar
                        </button>
                      )}
                      <button
                        className="btn btn-danger"
                        style={{ fontSize: "0.75rem", marginLeft: "auto" }}
                        disabled={pendente}
                        onClick={() => {
                          if (!confirm(`Excluir a despesa "${d.description}"?`)) return;
                          acao(() => removerDespesa(d.id), "Despesa excluída.");
                        }}
                      >
                        Excluir
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
