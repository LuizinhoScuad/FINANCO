"use client";

import { useState, useTransition, useRef } from "react";
import { useRouter } from "next/navigation";
import { createTransaction, deleteTransaction, toggleTransactionStatus, attachReceipt } from "@/actions/transactions";
import { formatCurrency, formatDate } from "@/lib/utils";
import type { Account, Category, Transaction } from "@/types";

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
};

export function TransacoesClient({ transactions, categories, accounts, month, year }: Props) {
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
    const [ocrDate, setOcrDate] = useState(new Date().toISOString().split("T")[0]);
    const [receiptUrl, setReceiptUrl] = useState("");
    const [receiptPreview, setReceiptPreview] = useState("");
    const cameraRef = useRef<HTMLInputElement>(null);
    const attachRef = useRef<HTMLInputElement>(null);
    const [attachingId, setAttachingId] = useState<string | null>(null);

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

        try {
            const { uploadReceipt } = await import("@/lib/firebase-storage");
            const url = await uploadReceipt(file);
            await attachReceipt(attachingId, url);
            router.refresh();
        } catch (err) {
            alert("Erro ao vincular recibo: " + (err instanceof Error ? err.message : String(err)));
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
        startTransition(async () => {
            const res = await createTransaction(fd);
            if (res.error) {
                alert(JSON.stringify(res.error));
            } else {
                setShowForm(false);
                setRepeat(false);
                setOcrDesc("");
                setOcrAmount("");
                setOcrDate(new Date().toISOString().split("T")[0]);
                setReceiptUrl("");
                setReceiptPreview("");
                setOcrStatus("");
                router.refresh();
            }
        });
    }

    async function handleDelete(id: string) {
        if (!confirm("Excluir esta transação?")) return;
        startTransition(async () => {
            await deleteTransaction(id);
            router.refresh();
        });
    }

    async function handleToggleStatus(id: string) {
        startTransition(async () => {
            const res = await toggleTransactionStatus(id);
            if (res.error) alert(res.error);
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
                        {transactions.length} registro(s)
                    </p>
                </div>
                <button className="btn btn-primary" onClick={() => setShowForm(true)}>
                    + Nova
                </button>
            </div>

            {/* Month Selector + Filter */}
            <div style={{ display: "flex", gap: "1rem", alignItems: "center", flexWrap: "wrap" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                    <button className="btn btn-ghost" onClick={() => handleMonthChange(-1)} style={{ padding: "0.25rem 0.625rem" }}>‹</button>
                    <span style={{ fontWeight: 600, minWidth: "100px", textAlign: "center" }}>
                        {MONTH_NAMES[month - 1]} {year}
                    </span>
                    <button className="btn btn-ghost" onClick={() => handleMonthChange(1)} style={{ padding: "0.25rem 0.625rem" }}>›</button>
                </div>
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
                    <table style={{ width: "100%", borderCollapse: "collapse" }}>
                        <thead>
                            <tr style={{ backgroundColor: "var(--color-surface-2)", borderBottom: "1px solid var(--color-border)" }}>
                                {["Status", "Descrição / Favorecido", "Categoria", "Conta", "Data", "Valor", ""].map((h) => (
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
                                        </div>
                                        <div style={{ fontSize: "0.7rem", color: "var(--color-muted)", marginTop: "2px", display: "flex", gap: "0.5rem", flexWrap: "wrap", alignItems: "center" }}>
                                                {tx.payee && <span style={{ color: "var(--color-accent)" }}>@{tx.payee}</span>}
                                                {tx.tags && <span>#{tx.tags.replace(/,/g, " #")}</span>}
                                                {tx.receiptUrl ? (
                                                    <a href={tx.receiptUrl} target="_blank" rel="noopener noreferrer" style={{ color: "var(--color-accent)", textDecoration: "none" }}>
                                                        🧾 recibo
                                                    </a>
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
                    style={{
                        position: "fixed", inset: 0, backgroundColor: "rgba(0,0,0,0.8)", backdropFilter: "blur(4px)",
                        display: "flex", alignItems: "center", justifyContent: "center", zIndex: 50, padding: "1rem"
                    }}
                    onClick={(e) => e.target === e.currentTarget && setShowForm(false)}
                >
                    <div className="card animate-scale-up" style={{ width: "100%", maxWidth: "520px", display: "flex", flexDirection: "column", gap: "1.25rem", maxHeight: "90vh", overflowY: "auto" }}>
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
                            <div style={{ display: "grid", gridTemplateColumns: "1.2fr 1fr", gap: "0.75rem" }}>
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

                            <div style={{ display: "grid", gridTemplateColumns: "1.5fr 1fr", gap: "0.75rem" }}>
                                <div>
                                    <label className="label-sm">Descrição</label>
                                    <input
                                        name="description"
                                        className="input-base"
                                        placeholder="Ex: Aluguel"
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

                            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem" }}>
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

                            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem" }}>
                                <div>
                                    <label className="label-sm">Favorecido / Recebedor</label>
                                    <input name="payee" className="input-base" placeholder="Ex: Mercado Livre" />
                                </div>
                                <div>
                                    <label className="label-sm">Tags (separadas por vírgula)</label>
                                    <input name="tags" className="input-base" placeholder="casa, lazer, fixo" />
                                </div>
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

                            <div style={{ display: "flex", gap: "0.75rem", justifyContent: "flex-end", marginTop: "0.5rem" }}>
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
            `}</style>
        </div>
    );
}

const MONTH_NAMES = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];
