"use client";

import { useState, useTransition, useRef } from "react";
import { useRouter } from "next/navigation";
import { createTransaction, deleteTransaction, toggleTransactionStatus, getTransactions, attachReceipt } from "@/actions/transactions";
import { formatCurrency, formatDate, formatDateTime } from "@/lib/utils";
import { hojeNoCampo } from "@/lib/core/datas";
import type { Account, Category, Transaction } from "@/types";
import {
    exportarTransacoesPDF,
    exportarTransacoesXLSX,
    type LinhaTransacao,
} from "@/lib/core/exports/cliente";
import { corDoStatus, rotuloCurto } from "@/lib/core/aprovacao";

function toInputDate(br: string) {
    const parts = br.split("/");
    if (parts[0].length === 4) return `${parts[0]}-${parts[1]}-${parts[2]}`; // YYYY/MM/DD
    const [d, m, y] = parts;
    return `${y}-${m}-${d}`; // DD/MM/YYYY
}


type TxWithRels = Transaction & { account: Account; category: Category };

type Props = {
    transactions: TxWithRels[];
    categories: Category[];
    accounts: Account[];
    month: number;
    year: number;
    /** Ignorando o recorte mensal: a lista traz o histórico inteiro. */
    tudo?: boolean;
    /** Verdadeiro quando a listagem bateu no teto e há mais coisa no banco. */
    truncado?: boolean;
};

const MONTHS = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];

export function TransacoesClient({ transactions, categories, accounts, month, year, tudo = false, truncado = false }: Props) {
    const router = useRouter();
    const [showForm, setShowForm] = useState(false);
    const [isPending, startTransition] = useTransition();
    const [filterType, setFilterType] = useState("all");
    const [txType, setTxType] = useState<"INCOME" | "EXPENSE">("EXPENSE");
    const [repeat, setRepeat] = useState(false);
    const [ocrLoading, setOcrLoading] = useState(false);
    const [ocrStatus, setOcrStatus] = useState("");
    const [ocrDesc, setOcrDesc] = useState("");
    const [ocrAmount, setOcrAmount] = useState("");
    const [ocrDate, setOcrDate] = useState(hojeNoCampo());
    const [receiptUrl, setReceiptUrl] = useState("");
    const [receiptPreview, setReceiptPreview] = useState("");
    const cameraRef = useRef<HTMLInputElement>(null);
    const attachRef = useRef<HTMLInputElement>(null);
    const [attachingId, setAttachingId] = useState<string | null>(null);
    const [erro, setErro] = useState("");
    const [idEnvio, setIdEnvio] = useState(() => crypto.randomUUID());
    // Marcado por padrão: o uso principal do app é pedir de volta o que se gastou
    // pela empresa. Quem estiver lançando algo pessoal desmarca.
    const [reembolso, setReembolso] = useState(true);

    async function handleOCR(e: React.ChangeEvent<HTMLInputElement>) {
        const file = e.target.files?.[0];
        if (!file) return;

        setOcrLoading(true);
        setOcrStatus("Enviando recibo...");
        setReceiptPreview(URL.createObjectURL(file));
        if (cameraRef.current) cameraRef.current.value = "";

        // 1. Upload com timeout de 30s
        let url = "";
        try {
            const { uploadReceipt } = await import("@/lib/firebase-storage");
            const uploadTimeout = new Promise<never>((_, reject) =>
                setTimeout(() => reject(new Error("timeout")), 30000)
            );
            url = await Promise.race([uploadReceipt(file), uploadTimeout]);
            setReceiptUrl(url);
        } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            console.error("[uploadReceipt] falhou:", msg);
            setOcrStatus(`⚠️ Recibo não salvo: ${msg}`);
            setOcrLoading(false);
            return;
        }
        setOcrStatus("Lendo recibo...");

        // 2. OCR com timeout de 20s — opcional, falha silenciosa
        try {
            const { createWorker } = await import("tesseract.js");

            const ocr = createWorker("por").then(async (worker) => {
                const result = await worker.recognize(file);
                await worker.terminate();
                return result.data.text;
            });

            const timeout = new Promise<null>((resolve) => setTimeout(() => resolve(null), 20000));
            const text = await Promise.race([ocr, timeout]);

            if (text) {
                // Valor: "R$ 1.234,56" | "1.234,56" | "TOTAL 12,50" | "VALOR: 99,90"
                const valorMatch =
                    text.match(/R\$\s*([\d.,]+)/i)?.[1] ??
                    text.match(/(?:TOTAL|VALOR|PAGO|PAGAR)[^\d]*([\d.,]+)/i)?.[1] ??
                    text.match(/(?:^|\s)([\d]{1,3}(?:\.\d{3})*,\d{2})(?:\s|$)/m)?.[1];
                const valor = valorMatch?.replace(/\./g, "").replace(",", ".");

                // Data: "10/04/2026" | "10-04-2026" | "2026-04-10"
                const dataMatch =
                    text.match(/(\d{2}[\/\-]\d{2}[\/\-]\d{4})/)?.[1] ??
                    text.match(/(\d{4}[\/\-]\d{2}[\/\-]\d{2})/)?.[1];
                const data = dataMatch?.replace(/-/g, "/");

                // Descrição: primeira linha não-vazia com mais de 3 chars, sem ser só números
                const descricao =
                    text.split("\n")
                        .map((l) => l.trim())
                        .find((l) => l.length > 3 && /[a-zA-ZÀ-ú]/.test(l)) ?? "";

                if (valor) setOcrAmount(valor);
                if (data) setOcrDate(toInputDate(data));
                if (descricao) setOcrDesc(descricao.slice(0, 60));
                setOcrStatus("✓ Recibo lido");
            } else {
                setOcrStatus("✓ Recibo salvo — preencha os campos manualmente");
            }
        } catch {
            setOcrStatus("✓ Recibo salvo — preencha os campos manualmente");
        } finally {
            setOcrLoading(false);
        }
    }

    async function handleAttachReceipt(e: React.ChangeEvent<HTMLInputElement>) {
        const file = e.target.files?.[0];
        if (!file || !attachingId) return;
        if (attachRef.current) attachRef.current.value = "";

        setErro("");
        try {
            const { uploadReceipt } = await import("@/lib/firebase-storage");
            const url = await uploadReceipt(file);
            const res = await attachReceipt(attachingId, url);
            if (!res.ok) {
                setErro(res.error);
                return;
            }
            router.refresh();
        } catch (err) {
            setErro("Não foi possível enviar o recibo: " + (err instanceof Error ? err.message : String(err)));
        } finally {
            setAttachingId(null);
        }
    }

    function handleMonthChange(delta: number) {
        let m = month + delta;
        let y = year;
        if (m > 12) { m = 1; y++; }
        if (m < 1) { m = 12; y--; }
        router.push(`/transacoes?month=${m}&year=${y}`);
    }

    const filtered = filterType === "all" ? transactions : transactions.filter((t) => t.type === filterType);

    async function handleCreate(e: React.FormEvent<HTMLFormElement>) {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        // Marca deste envio: num reenvio acidental (duplo clique) o valor é o
        // mesmo, e o servidor recusa em vez de duplicar lançamento e saldo.
        fd.set("submissionId", idEnvio);

        setErro("");
        startTransition(async () => {
            const res = await createTransaction(fd);
            if (!res.ok) {
                setErro(res.error);
                return;
            }
            setShowForm(false);
            setRepeat(false);
            setReembolso(true);
            setOcrDesc("");
            setOcrAmount("");
            setOcrDate(hojeNoCampo());
            setReceiptUrl("");
            setReceiptPreview("");
            setOcrStatus("");
            setIdEnvio(crypto.randomUUID());
            router.refresh();
        });
    }

    async function handleDelete(id: string) {
        if (!confirm("Excluir esta transação?")) return;
        setErro("");
        startTransition(async () => {
            const res = await deleteTransaction(id);
            if (!res.ok) {
                setErro(res.error);
                return;
            }
            router.refresh();
        });
    }

    function buildRows(txs: TxWithRels[]): LinhaTransacao[] {
        return [...txs]
            .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
            .map((tx) => ({
                data: formatDate(tx.date),
                descricao: tx.description,
                observacao: tx.payee ?? "",
                categoria: `${tx.category.icon} ${tx.category.name}`,
                conta: tx.account.name,
                tipo: tx.type === "INCOME" ? "Receita" : "Despesa",
                situacao: tx.status === "COMPLETED" ? "Pago" : "Pendente",
                valor: tx.type === "INCOME" ? Number(tx.amount) : -Number(tx.amount),
            }));
    }

    const periodo = tudo ? "todo o período" : `${MONTH_NAMES[month - 1]} ${year}`;

    function exportar(formato: "pdf" | "xlsx", escopo: "mes" | "tudo") {
        setErro("");
        startTransition(async () => {
            try {
                const dados = escopo === "mes" ? filtered : ((await getTransactions()) as TxWithRels[]);
                const linhas = buildRows(dados);
                const base = escopo === "mes" ? `transacoes-${periodo.toLowerCase().replace(" ", "-")}` : "transacoes-completo";

                if (formato === "pdf") {
                    await exportarTransacoesPDF(linhas, escopo === "mes" ? `Transações — ${periodo}` : "Transações — histórico completo");
                } else {
                    await exportarTransacoesXLSX(linhas, base);
                }
            } catch (e) {
                setErro("Não foi possível gerar o arquivo: " + (e instanceof Error ? e.message : ""));
            }
        });
    }

    async function handleToggleStatus(id: string) {
        setErro("");
        startTransition(async () => {
            const res = await toggleTransactionStatus(id);
            if (!res.ok) {
                // Antes seguia atualizando a tela mesmo com erro, dando a
                // impressão de que a mudança valeu.
                setErro(res.error);
                return;
            }
            router.refresh();
        });
    }

    return (
        <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
            {/* Header */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                <div className="animate-fade-up">
                    <h1 style={{ fontSize: "1.5rem", marginBottom: "0.25rem" }}>Transações</h1>
                    <p style={{ color: "var(--color-muted)", fontSize: "0.875rem" }}>
                        {transactions.length} registro(s) · {tudo ? "todo o período" : `${MONTH_NAMES[month - 1]} ${year}`}
                    </p>
                </div>
                <div style={{ display: "flex", gap: "0.375rem", flexWrap: "wrap", justifyContent: "flex-end" }}>
                    <button className="btn btn-ghost" onClick={() => exportar("pdf", "mes")} disabled={isPending} title={`PDF de ${periodo}`} style={{ fontSize: "0.8rem" }}>
                        ↓ PDF
                    </button>
                    <button className="btn btn-ghost" onClick={() => exportar("xlsx", "mes")} disabled={isPending} title={`XLSX de ${periodo}`} style={{ fontSize: "0.8rem" }}>
                        ↓ XLSX
                    </button>
                    <button className="btn btn-ghost" onClick={() => exportar("xlsx", "tudo")} disabled={isPending} title="XLSX do histórico completo" style={{ fontSize: "0.8rem" }}>
                        {isPending ? "..." : "↓ Tudo"}
                    </button>
                    <button className="btn btn-primary" onClick={() => setShowForm(true)}>
                        + Nova
                    </button>
                </div>
            </div>

            {erro && (
                <div
                    className="card animate-fade-up"
                    style={{
                        borderLeft: "3px solid var(--color-danger)",
                        color: "var(--color-danger)",
                        fontSize: "0.875rem",
                        display: "flex",
                        justifyContent: "space-between",
                        gap: "1rem",
                        alignItems: "center",
                    }}
                >
                    <span>{erro}</span>
                    <button
                        onClick={() => setErro("")}
                        style={{ background: "none", border: "none", color: "inherit", cursor: "pointer", fontSize: "1rem" }}
                        aria-label="Fechar aviso"
                    >
                        ✕
                    </button>
                </div>
            )}

            {/* Período + Filtro */}
            <div style={{ display: "flex", gap: "1rem", alignItems: "center", flexWrap: "wrap" }}>
                {tudo ? (
                    <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                        <span style={{ fontWeight: 600, color: "var(--color-accent)" }}>Todo o período</span>
                    </div>
                ) : (
                    <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                        <button className="btn btn-ghost" onClick={() => handleMonthChange(-1)} style={{ padding: "0.25rem 0.625rem" }}>‹</button>
                        <span style={{ fontWeight: 600, minWidth: "100px", textAlign: "center" }}>
                            {MONTH_NAMES[month - 1]} {year}
                        </span>
                        <button className="btn btn-ghost" onClick={() => handleMonthChange(1)} style={{ padding: "0.25rem 0.625rem" }}>›</button>
                    </div>
                )}

                {/* Sair da navegação mês a mês: sem isto, quem tem lançamento
                    espalhado no tempo abre a tela e vê "nenhuma transação".
                    O selo de truncamento evita a pior leitura possível — achar
                    que está vendo tudo quando o banco tem mais. */}
                <button
                    className="btn btn-ghost"
                    onClick={() => router.push(tudo ? "/transacoes" : "/transacoes?periodo=tudo")}
                    style={{
                        padding: "0.25rem 0.75rem",
                        fontSize: "0.8rem",
                        color: tudo ? "var(--color-accent)" : undefined,
                        borderColor: tudo ? "var(--color-accent)" : undefined,
                    }}
                >
                    {tudo ? "↩ Voltar ao mês" : "🗓 Todos os períodos"}
                </button>

                {truncado && (
                    <span style={{ fontSize: "0.72rem", color: "#ffc107" }}>
                        mostrando os 500 mais recentes — há mais no histórico
                    </span>
                )}
                <div style={{ display: "flex", gap: "0.25rem" }}>
                    {[["all", "Todos"], ["INCOME", "Receitas"], ["EXPENSE", "Despesas"]].map(([v, l]) => (
                        <button
                            key={v}
                            className="btn btn-ghost"
                            onClick={() => setFilterType(v)}
                            style={{
                                padding: "0.25rem 0.75rem",
                                fontSize: "0.8rem",
                                color: filterType === v ? "var(--color-accent)" : undefined,
                                borderColor: filterType === v ? "var(--color-accent)" : undefined,
                            }}
                        >
                            {l}
                        </button>
                    ))}
                </div>
            </div>

            {/* Table */}
            <div className="card animate-fade-up" style={{ padding: 0, overflow: "hidden" }}>
                {filtered.length === 0 ? (
                    <p style={{ padding: "2rem", textAlign: "center", color: "var(--color-muted)" }}>
                        Nenhuma transação encontrada.
                    </p>
                ) : (
                    <>
                    {/* Celular: cada lançamento vira um cartão que cabe na tela.
                        A tabela larga, mesmo com rolagem lateral, escondia mais de
                        400px de conteúdo — inclusive o valor e a situação. */}
                    <div className="so-celular cartao-lista">
                        {filtered.map((tx) => (
                            <div key={tx.id} className="cartao-item">
                                <div className="cartao-topo">
                                    <span className="cartao-titulo">{tx.description}</span>
                                    <span
                                        className="cartao-valor"
                                        style={{ color: tx.type === "INCOME" ? "var(--color-accent)" : "var(--color-danger)" }}
                                    >
                                        {tx.type === "INCOME" ? "+" : "-"}{formatCurrency(Number(tx.amount))}
                                    </span>
                                </div>

                                <div className="cartao-meta">
                                    <span>{formatDate(tx.date)}</span>
                                    <span>{tx.category.icon} {tx.category.name}</span>
                                    <span>{tx.account.name}</span>
                                    {tx.isInstallment && <span>parcela {tx.installment}/{tx.totalInstallments}</span>}
                                    {tx.payee && <span style={{ color: "var(--color-accent)" }}>{tx.payee}</span>}
                                </div>

                                {tx.aprovacao === "REJEITADA" && tx.rejectionReason && (
                                    <div style={{ fontSize: "0.72rem", color: "var(--color-danger)" }}>
                                        Rejeitada: {tx.rejectionReason} — corrija e salve para reenviar.
                                    </div>
                                )}

                                <div className="cartao-acoes">
                                    <button
                                        onClick={() => handleToggleStatus(tx.id)}
                                        disabled={isPending}
                                        style={{
                                            backgroundColor: tx.status === "COMPLETED" ? "rgba(0, 217, 139, 0.1)" : "rgba(255, 193, 7, 0.1)",
                                            color: tx.status === "COMPLETED" ? "var(--color-accent)" : "#ffc107",
                                            border: `1px solid ${tx.status === "COMPLETED" ? "rgba(0, 217, 139, 0.25)" : "rgba(255, 193, 7, 0.25)"}`,
                                            borderRadius: "4px",
                                            padding: "4px 10px",
                                            fontSize: "0.68rem",
                                            fontWeight: 700,
                                        }}
                                    >
                                        {tx.status === "COMPLETED" ? "PAGO" : "PENDENTE"}
                                    </button>

                                    {tx.reembolso && (
                                        <span
                                            style={{
                                                fontSize: "0.68rem",
                                                fontWeight: 700,
                                                padding: "4px 10px",
                                                borderRadius: "4px",
                                                color: corDoStatus(tx.aprovacao).cor,
                                                backgroundColor: corDoStatus(tx.aprovacao).fundo,
                                            }}
                                        >
                                            {rotuloCurto(tx.aprovacao)}
                                        </span>
                                    )}

                                    {tx.receiptUrl ? (
                                        <a
                                            href={tx.receiptUrl}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            style={{ fontSize: "0.72rem", color: "var(--color-accent)", textDecoration: "none", alignSelf: "center" }}
                                        >
                                            🧾 recibo
                                        </a>
                                    ) : (
                                        <button
                                            type="button"
                                            disabled={attachingId === tx.id}
                                            onClick={() => { setAttachingId(tx.id); attachRef.current?.click(); }}
                                            style={{ background: "none", border: "1px dashed var(--color-muted)", borderRadius: "4px", padding: "4px 10px", color: "var(--color-muted)", fontSize: "0.68rem" }}
                                        >
                                            {attachingId === tx.id ? "enviando..." : "+ recibo"}
                                        </button>
                                    )}

                                    <button
                                        className="btn btn-danger"
                                        onClick={() => handleDelete(tx.id)}
                                        disabled={isPending}
                                        style={{ padding: "4px 10px", fontSize: "0.68rem", marginLeft: "auto" }}
                                    >
                                        Excluir
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>

                    {/* Computador: a tabela, onde há largura para ela. */}
                    <div className="so-computador" style={{ overflowX: "auto", WebkitOverflowScrolling: "touch" }}>
                    <table style={{ width: "100%", minWidth: "700px", borderCollapse: "collapse" }}>
                        <thead>
                            <tr style={{ backgroundColor: "var(--color-surface-2)", borderBottom: "1px solid var(--color-border)" }}>
                                {["Status", "Descrição / Observação", "Categoria", "Conta", "Data", "Valor", ""].map((h) => (
                                    <th key={h} style={{ padding: "0.75rem 1rem", textAlign: "left", fontSize: "0.75rem", color: "var(--color-muted)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em" }}>
                                        {h}
                                    </th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {filtered.map((tx) => (
                                <tr
                                    key={tx.id}
                                    style={{ borderBottom: "1px solid var(--color-border)", transition: "background 0.1s" }}
                                    onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.backgroundColor = "var(--color-surface-2)")}
                                    onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.backgroundColor = "transparent")}
                                >
                                    <td style={{ padding: "0.75rem 1rem" }}>
                                        <button
                                            className={`badge`}
                                            onClick={() => handleToggleStatus(tx.id)}
                                            disabled={isPending}
                                            style={{
                                                backgroundColor: tx.status === "COMPLETED" ? "rgba(0, 217, 139, 0.1)" : "rgba(255, 193, 7, 0.1)",
                                                color: tx.status === "COMPLETED" ? "var(--color-accent)" : "#ffc107",
                                                fontSize: "0.65rem",
                                                border: `1px solid ${tx.status === "COMPLETED" ? "rgba(0, 217, 139, 0.2)" : "rgba(255, 193, 7, 0.2)"}`,
                                                cursor: isPending ? "not-allowed" : "pointer",
                                                opacity: isPending ? 0.6 : 1,
                                                display: "inline-block",
                                                padding: "2px 8px",
                                                borderRadius: "4px",
                                                transition: "all 0.2s"
                                            }}
                                            onMouseEnter={(e) => !(isPending) && (e.currentTarget.style.transform = "scale(1.05)")}
                                            onMouseLeave={(e) => !(isPending) && (e.currentTarget.style.transform = "scale(1)")}
                                        >
                                            {tx.status === "COMPLETED" ? "PAGO" : "PENDENTE"}
                                        </button>
                                    </td>
                                    <td style={{ padding: "0.75rem 1rem" }}>
                                        <div style={{ fontWeight: 500 }}>
                                            {tx.description}
                                            {tx.isInstallment && (
                                                <span style={{ marginLeft: "0.5rem", fontSize: "0.65rem", color: "var(--color-muted)", backgroundColor: "var(--color-surface-3)", padding: "2px 4px" }}>
                                                    {tx.installment}/{tx.totalInstallments}
                                                </span>
                                            )}
                                            {tx.reembolso && (
                                                <span
                                                    title={
                                                        tx.aprovacao === "REJEITADA" && tx.rejectionReason
                                                            ? `Motivo: ${tx.rejectionReason}`
                                                            : tx.aprovacao === "RESSARCIDA" && tx.reimbursedAt
                                                              ? `Pago em ${formatDateTime(tx.reimbursedAt)}`
                                                              : undefined
                                                    }
                                                    style={{
                                                        marginLeft: "0.5rem",
                                                        fontSize: "0.62rem",
                                                        fontWeight: 700,
                                                        padding: "2px 6px",
                                                        borderRadius: "3px",
                                                        whiteSpace: "nowrap",
                                                        color: corDoStatus(tx.aprovacao).cor,
                                                        backgroundColor: corDoStatus(tx.aprovacao).fundo,
                                                    }}
                                                >
                                                    {rotuloCurto(tx.aprovacao)}
                                                </span>
                                            )}
                                        </div>
                                        {tx.aprovacao === "REJEITADA" && tx.rejectionReason && (
                                            <div style={{ fontSize: "0.68rem", color: "var(--color-danger)", marginTop: "3px" }}>
                                                Rejeitada: {tx.rejectionReason} — corrija e salve para reenviar.
                                            </div>
                                        )}
                                        <div style={{ fontSize: "0.7rem", color: "var(--color-muted)", marginTop: "2px", display: "flex", gap: "0.5rem", flexWrap: "wrap", alignItems: "center" }}>
                                            {tx.payee && <span style={{ color: "var(--color-accent)" }}>{tx.payee}</span>}
                                            {tx.tags && <span>#{tx.tags.replace(/,/g, " #")}</span>}
                                            {tx.receiptUrl ? (
                                                <span style={{ display: "flex", alignItems: "center", gap: "0.35rem" }}>
                                                    <a href={tx.receiptUrl} target="_blank" rel="noopener noreferrer" style={{ color: "var(--color-accent)", textDecoration: "none" }}>
                                                        🧾 recibo
                                                    </a>
                                                    <a
                                                        href={tx.receiptUrl}
                                                        download
                                                        onClick={async (e) => {
                                                            e.preventDefault();
                                                            const res = await fetch(tx.receiptUrl!);
                                                            const blob = await res.blob();
                                                            const url = URL.createObjectURL(blob);
                                                            const a = document.createElement("a");
                                                            a.href = url;
                                                            a.download = `recibo-${tx.id}.${blob.type.split("/")[1] || "jpg"}`;
                                                            a.click();
                                                            URL.revokeObjectURL(url);
                                                        }}
                                                        style={{ color: "var(--color-muted)", textDecoration: "none", fontSize: "0.75rem" }}
                                                        title="Baixar recibo"
                                                    >
                                                        ↓
                                                    </a>
                                                </span>
                                            ) : (
                                                <button
                                                    type="button"
                                                    disabled={attachingId === tx.id}
                                                    onClick={() => { setAttachingId(tx.id); attachRef.current?.click(); }}
                                                    style={{ background: "none", border: "1px dashed var(--color-muted)", borderRadius: "3px", padding: "1px 6px", cursor: "pointer", color: "var(--color-muted)", fontSize: "0.65rem", lineHeight: 1.4 }}
                                                >
                                                    {attachingId === tx.id ? "enviando..." : "+ recibo"}
                                                </button>
                                            )}
                                        </div>
                                    </td>
                                    <td style={{ padding: "0.75rem 1rem", color: "var(--color-muted)" }}>
                                        {tx.category.icon} {tx.category.name}
                                    </td>
                                    <td style={{ padding: "0.75rem 1rem", color: "var(--color-muted)" }}>{tx.account.name}</td>
                                    <td style={{ padding: "0.75rem 1rem", color: "var(--color-muted)", whiteSpace: "nowrap" }}>{formatDate(tx.date)}</td>
                                    <td style={{ padding: "0.75rem 1rem", fontWeight: 700, fontFamily: "var(--font-display)", color: tx.type === "INCOME" ? "var(--color-accent)" : "var(--color-danger)" }}>
                                        {tx.type === "INCOME" ? "+" : "-"}{formatCurrency(Number(tx.amount))}
                                    </td>
                                    <td style={{ padding: "0.75rem 1rem" }}>
                                        <button
                                            className="btn btn-danger"
                                            onClick={() => handleDelete(tx.id)}
                                            disabled={isPending}
                                            style={{ padding: "0.2rem 0.5rem", fontSize: "0.75rem" }}
                                        >
                                            ✕
                                        </button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                    </div>
                    </>
                )}
            </div>

            {/* Input oculto global para vincular recibo a transação existente */}
            <input
                ref={attachRef}
                type="file"
                accept="image/*"
                capture="environment"
                style={{ display: "none" }}
                onChange={handleAttachReceipt}
            />

            {/* Modal Form */}
            {showForm && (
                <div
                    className="modal-overlay"
                    onClick={(e) => e.target === e.currentTarget && setShowForm(false)}
                >
                    <div className="card animate-scale-up modal-card">
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                            <h2 style={{ fontSize: "1.25rem", fontWeight: 700 }}>Nova Transação</h2>
                            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                                <label style={{ fontSize: "0.75rem", cursor: "pointer", display: "flex", alignItems: "center", gap: "0.5rem" }}>
                                    <input
                                        type="checkbox"
                                        name="status"
                                        value="COMPLETED"
                                        defaultChecked
                                        form="tx-form"
                                        style={{ width: "14px", height: "14px", accentColor: "var(--color-accent)" }}
                                    />
                                    Efetivada / Paga
                                </label>
                            </div>
                        </div>

                        <form id="tx-form" onSubmit={handleCreate} style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
                            <div className="grid-campos" style={{ display: "grid", gridTemplateColumns: "1.2fr 1fr", gap: "0.75rem" }}>
                                <div>
                                    <label className="label-sm">Tipo</label>
                                    <select
                                        name="type"
                                        className="input-base"
                                        value={txType}
                                        onChange={(e) => setTxType(e.target.value as "INCOME" | "EXPENSE")}
                                    >
                                        <option value="EXPENSE">Despesa</option>
                                        <option value="INCOME">Receita</option>
                                    </select>
                                </div>
                                <div>
                                    <label className="label-sm">Data</label>
                                    <input
                                        name="date"
                                        type="date"
                                        className="input-base"
                                        value={ocrDate}
                                        onChange={(e) => setOcrDate(e.target.value)}
                                        required
                                    />
                                </div>
                            </div>

                            {/* Botão OCR */}
                            <div>
                                <input
                                    ref={cameraRef}
                                    type="file"
                                    accept="image/*"
                                    capture="environment"
                                    style={{ display: "none" }}
                                    onChange={handleOCR}
                                />
                                <button
                                    type="button"
                                    className="btn btn-ghost"
                                    onClick={() => cameraRef.current?.click()}
                                    disabled={ocrLoading}
                                    style={{ width: "100%", fontSize: "0.85rem", borderStyle: "dashed", color: ocrLoading ? "var(--color-muted)" : "var(--color-accent)", borderColor: "var(--color-accent)" }}
                                >
                                    {ocrLoading ? `⏳ ${ocrStatus}` : "📷 Escanear Recibo (OCR)"}
                                </button>

                                {/* Preview da imagem + campo hidden com URL */}
                                {receiptPreview && (
                                    <div style={{ marginTop: "0.5rem", display: "flex", alignItems: "center", gap: "0.75rem" }}>
                                        <a href={receiptUrl || receiptPreview} target="_blank" rel="noopener noreferrer">
                                            {/* eslint-disable-next-line @next/next/no-img-element */}
                                            <img
                                                src={receiptPreview}
                                                alt="Recibo"
                                                style={{ width: "64px", height: "64px", objectFit: "cover", borderRadius: "4px", border: "1px solid var(--color-border)" }}
                                            />
                                        </a>
                                        <span style={{ fontSize: "0.75rem", color: ocrStatus.startsWith("⚠️") ? "var(--color-danger)" : receiptUrl ? "var(--color-accent)" : "var(--color-muted)" }}>
                                            {ocrStatus || (receiptUrl ? "✓ Recibo salvo" : "⏳ Enviando...")}
                                        </span>
                                        <input type="hidden" name="receiptUrl" value={receiptUrl} />
                                    </div>
                                )}
                            </div>

                            <div className="grid-campos" style={{ display: "grid", gridTemplateColumns: "1.5fr 1fr", gap: "0.75rem" }}>
                                <div>
                                    <label className="label-sm">Descrição</label>
                                    <input
                                        name="description"
                                        className="input-base"
                                        placeholder="Ex: Visita no cliente Mocotó"
                                        value={ocrDesc}
                                        onChange={(e) => setOcrDesc(e.target.value)}
                                        required
                                    />
                                </div>
                                <div>
                                    <label className="label-sm">Valor (R$)</label>
                                    <input
                                        name="amount"
                                        type="number"
                                        step="0.01"
                                        min="0.01"
                                        className="input-base"
                                        placeholder="0,00"
                                        value={ocrAmount}
                                        onChange={(e) => setOcrAmount(e.target.value)}
                                        required
                                    />
                                </div>
                            </div>

                            <div className="grid-campos" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem" }}>
                                <div>
                                    <label className="label-sm">Categoria</label>
                                    <select name="categoryId" className="input-base" required>
                                        <option value="">Selecionar</option>
                                        {categories
                                            .filter((c) => c.type === txType)
                                            .map((c) => (
                                                <option key={c.id} value={c.id}>{c.icon} {c.name}</option>
                                            ))}
                                    </select>
                                </div>
                                <div>
                                    <label className="label-sm">Conta</label>
                                    <select name="accountId" className="input-base" required>
                                        <option value="">Selecionar</option>
                                        {accounts.map((a) => (
                                            <option key={a.id} value={a.id}>{a.name}</option>
                                        ))}
                                    </select>
                                </div>
                            </div>

                            <div className="grid-campos" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem" }}>
                                <div>
                                    {/* O campo guardado continua sendo `payee`: renomear a
                                        coluna no banco exigiria migrar todo lançamento
                                        existente para trocar um rótulo de tela. */}
                                    <label className="label-sm">Observação/Acompanhante</label>
                                    <input name="payee" className="input-base" placeholder="Ex: visita ao cliente, com o Roberto" />
                                </div>
                                <div>
                                    <label className="label-sm">Tags (separadas por vírgula)</label>
                                    <input name="tags" className="input-base" placeholder="casa, lazer, fixo" />
                                </div>
                            </div>

                            {/* Pedido de reembolso — o que separa o gasto da empresa do gasto
                                pessoal. Marcado por padrão porque é o uso principal do app. */}
                            <div
                                style={{
                                    padding: "0.875rem",
                                    borderRadius: "4px",
                                    border: `1px solid ${reembolso ? "rgba(0, 217, 139, 0.35)" : "var(--color-border)"}`,
                                    backgroundColor: reembolso ? "rgba(0, 217, 139, 0.06)" : "var(--color-surface-2)",
                                }}
                            >
                                <label style={{ display: "flex", alignItems: "center", gap: "0.5rem", fontSize: "0.875rem", cursor: "pointer", fontWeight: 600, color: reembolso ? "var(--color-accent)" : "inherit" }}>
                                    <input
                                        type="checkbox"
                                        name="reembolso"
                                        checked={reembolso}
                                        onChange={(e) => setReembolso(e.target.checked)}
                                        style={{ width: "16px", height: "16px", accentColor: "var(--color-accent)" }}
                                    />
                                    Pedir reembolso da empresa
                                </label>
                                <p style={{ fontSize: "0.7rem", color: "var(--color-muted)", marginTop: "0.45rem", lineHeight: 1.5 }}>
                                    {reembolso
                                        ? "Vai para a fila do gestor e aparece nos Relatórios. Anexe o comprovante — sem ele o pedido fica marcado como “sem comprovante”."
                                        : "Lançamento particular: não entra na fila de aprovação nem nos Relatórios de reembolso."}
                                </p>
                            </div>

                            <div>
                                <label style={{ display: "flex", alignItems: "center", gap: "0.5rem", fontSize: "0.875rem", cursor: "pointer", color: repeat ? "var(--color-accent)" : "inherit" }}>
                                    <input
                                        type="checkbox"
                                        name="isInstallment"
                                        checked={repeat}
                                        onChange={(e) => setRepeat(e.target.checked)}
                                        style={{ width: "16px", height: "16px", accentColor: "var(--color-accent)" }}
                                    />
                                    Repetir / Parcelar Transação
                                </label>

                                {repeat && (
                                    <div style={{ marginTop: "0.75rem", padding: "1rem", backgroundColor: "var(--color-surface-2)", border: "1px dashed var(--color-border)", borderRadius: "4px" }}>
                                        <label className="label-sm">Quantidade de meses (parcelas)</label>
                                        <input
                                            name="totalInstallments"
                                            type="number"
                                            min="2"
                                            max="72"
                                            defaultValue="2"
                                            className="input-base"
                                            style={{ maxWidth: "100px" }}
                                        />
                                        <p style={{ fontSize: "0.65rem", color: "var(--color-muted)", marginTop: "0.5rem" }}>
                                            * Serão criadas {repeat ? "múltiplas" : "uma"} transações idênticas nos meses seguintes.
                                        </p>
                                    </div>
                                )}
                            </div>

                            <div>
                                <label className="label-sm">Notas (opcional)</label>
                                <textarea name="notes" className="input-base" placeholder="Observações adicionais..." rows={2} style={{ resize: "none" }} />
                            </div>

                            {/* Ações grudadas no rodapé do modal: no iPhone em
                                pé ou deitado, o formulário é mais alto que a
                                tela, e o botão de confirmar ficava no fim de
                                uma rolagem que nem sempre existia. Agora ele
                                está sempre à vista. */}
                            <div className="modal-acoes">
                                <button type="button" className="btn btn-ghost" onClick={() => setShowForm(false)}>Cancelar</button>
                                <button type="submit" className="btn btn-primary" disabled={isPending || ocrLoading}>
                                    {isPending ? "Salvando..." : ocrLoading ? "⏳ Aguarde o recibo..." : "Finalizar Lançamento"}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            <style jsx>{`
                .label-sm {
                    font-size: 0.75rem;
                    color: var(--color-muted);
                    display: block;
                    margin-bottom: 0.375rem;
                }
                .animate-scale-up {
                    animation: scaleUp 0.2s ease-out;
                }
                @keyframes scaleUp {
                    from { transform: scale(0.95); opacity: 0; }
                    to { transform: scale(1); opacity: 1; }
                }

                /* --- modal de lançamento ---------------------------------
                   O botão de confirmar sumia no iPhone. Duas causas:

                   1. 'vh' no iOS mede a tela INTEIRA, ignorando a barra de
                      endereço e a de ferramentas do Safari. Um modal com
                      90vh passa por baixo delas — e, como o navegador acha
                      que tudo coube, não há rolagem para alcançar o fim.
                      Deitado, onde sobra pouca altura, o rodapé inteiro
                      ficava fora. 'dvh' mede o que está de fato visível.

                   2. Mesmo com a altura certa, confirmar dependia de rolar
                      até o fim de um formulário longo. Agora as ações ficam
                      grudadas no rodapé (position: sticky), sempre à vista.

                   O overlay rola por fora como rede de segurança: em
                   navegador antigo, sem 'dvh', o modal continua alcançável.  */
                .modal-overlay {
                    position: fixed;
                    inset: 0;
                    z-index: 50;
                    background-color: rgba(0, 0, 0, 0.8);
                    backdrop-filter: blur(4px);
                    display: flex;
                    padding: 1rem;
                    overflow-y: auto;
                    -webkit-overflow-scrolling: touch;
                }
                .modal-card {
                    /* 'margin: auto' centraliza quando cabe e permite rolar
                       quando não cabe — com 'align-items: center' o topo do
                       modal fica inalcançável. */
                    margin: auto;
                    width: 100%;
                    max-width: 520px;
                    display: flex;
                    flex-direction: column;
                    gap: 1.25rem;
                    overflow-y: auto;
                    /* A altura vem da variável abaixo. Declarar 'max-height'
                       duas vezes na mesma regra não serviria de reserva: o
                       minificador do build descarta a primeira — conferido no
                       CSS gerado. Por isso o fallback vive num '@supports',
                       que ele não tem como colapsar. */
                    max-height: var(--altura-modal);
                }
                .modal-card { --altura-modal: 90vh; }
                @media (max-width: 767px) { .modal-card { --altura-modal: 94vh; } }
                @media (max-height: 500px) { .modal-card { --altura-modal: 97vh; } }

                /* 'dvh' desconta as barras do Safari; 'vh', não. */
                @supports (height: 100dvh) {
                    .modal-card { --altura-modal: 90dvh; }
                    @media (max-width: 767px) { .modal-card { --altura-modal: 94dvh; } }
                    @media (max-height: 500px) { .modal-card { --altura-modal: 97dvh; } }
                }
                .modal-acoes {
                    position: sticky;
                    bottom: 0;
                    z-index: 1;
                    display: flex;
                    gap: 0.75rem;
                    align-items: center;
                    justify-content: flex-end;
                    background-color: var(--color-surface);
                    border-top: 1px solid var(--color-border);
                    /* Sangra o padding do .card para encostar nas bordas. */
                    margin: 0.25rem -1.25rem -1.25rem;
                    padding: 0.875rem 1.25rem;
                    /* Faixa de gestos do iPhone. */
                    padding-bottom: calc(0.875rem + env(safe-area-inset-bottom));
                }
                @media (max-width: 767px) {
                    .modal-overlay { padding: 0.5rem; }
                    /* No celular o alvo de toque vale mais que a simetria: o
                       botão que conclui ocupa a largura que sobra. */
                    .modal-acoes button[type="submit"] { flex: 1; }
                }
                /* Deitado, a altura é o recurso escasso: o modal ocupa o que
                   der e as folgas encolhem para sobrar espaço ao formulário. */
                @media (max-height: 500px) {
                    .modal-overlay { padding: 0.35rem; }
                    .modal-card { gap: 0.75rem; padding: 0.875rem; }
                    .modal-acoes {
                        margin: 0.25rem -0.875rem -0.875rem;
                        padding: 0.625rem 0.875rem;
                        padding-bottom: calc(0.625rem + env(safe-area-inset-bottom));
                    }
                }
            `}</style>
        </div>
    );
}

const MONTH_NAMES = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];
