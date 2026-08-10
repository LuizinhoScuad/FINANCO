"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { upsertBudget, deleteBudget } from "@/actions/budgets";
import { formatCurrency } from "@/lib/utils";
import { Aviso } from "@/components/ui/Aviso";
import type { Category } from "@/types";


type BudgetWithData = {
    id: string;
    categoryId: string;
    amount: unknown;
    month: number;
    year: number;
    category: Category;
    spent: number;
    limit: number;
};

const MONTHS = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];

export function OrcamentosClient({
    budgets,
    categories,
    month,
    year,
}: {
    budgets: BudgetWithData[];
    categories: Category[];
    month: number;
    year: number;
}) {
    const router = useRouter();
    const [showForm, setShowForm] = useState(false);
    const [isPending, startTransition] = useTransition();
    const [erro, setErro] = useState("");
    const [sucesso, setSucesso] = useState("");

    function handleMonthChange(delta: number) {
        let m = month + delta;
        let y = year;
        if (m > 12) { m = 1; y++; }
        if (m < 1) { m = 12; y--; }
        router.push(`/orcamentos?month=${m}&year=${y}`);
    }

    async function handleUpsert(e: React.FormEvent<HTMLFormElement>) {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        fd.set("month", String(month));
        fd.set("year", String(year));
        setErro("");
        startTransition(async () => {
            const res = await upsertBudget(fd);
            if (!res.ok) {
                setErro(res.error);
                return;
            }
            setShowForm(false);
            setSucesso("Orçamento salvo.");
            router.refresh();
        });
    }

    async function handleDelete(id: string) {
        if (!confirm("Remover este orçamento?")) return;
        setErro("");
        startTransition(async () => {
            const res = await deleteBudget(id);
            if (!res.ok) {
                setErro(res.error);
                return;
            }
            setSucesso("Orçamento removido.");
            router.refresh();
        });
    }

    return (
        <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
            {erro && <Aviso tipo="erro" mensagem={erro} onFechar={() => setErro("")} />}
            {sucesso && <Aviso tipo="sucesso" mensagem={sucesso} autoFecharMs={3000} onFechar={() => setSucesso("")} />}

            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                <div className="animate-fade-up">
                    <h1 style={{ fontSize: "1.5rem", marginBottom: "0.25rem" }}>Orçamentos</h1>
                    <p style={{ color: "var(--color-muted)", fontSize: "0.875rem" }}>{budgets.length} metas definidas</p>
                </div>
                <button className="btn btn-primary" onClick={() => setShowForm(true)}>+ Nova Meta</button>
            </div>

            {/* Month Nav */}
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                <button className="btn btn-ghost" onClick={() => handleMonthChange(-1)} style={{ padding: "0.25rem 0.625rem" }}>‹</button>
                <span style={{ fontWeight: 600, minWidth: "100px", textAlign: "center" }}>
                    {MONTHS[month - 1]} {year}
                </span>
                <button className="btn btn-ghost" onClick={() => handleMonthChange(1)} style={{ padding: "0.25rem 0.625rem" }}>›</button>
            </div>

            {budgets.length === 0 && (
                <div className="card" style={{ textAlign: "center", color: "var(--color-muted)" }}>
                    <p style={{ padding: "2rem" }}>Nenhum orçamento definido para este mês.</p>
                </div>
            )}

            <div style={{ display: "flex", flexDirection: "column", gap: "0.875rem" }}>
                {budgets.map((b) => {
                    const pct = Math.min((b.spent / b.limit) * 100, 100);
                    const over = b.spent > b.limit;
                    const warn = !over && pct >= 80;
                    const barColor = over ? "var(--color-danger)" : warn ? "var(--color-warning)" : "var(--color-accent)";

                    return (
                        <div key={b.id} className="card animate-fade-up" style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                                <span style={{ display: "flex", alignItems: "center", gap: "0.5rem", fontWeight: 600 }}>
                                    <span>{b.category.icon}</span>
                                    {b.category.name}
                                    {over && <span className="badge badge-expense">Acima do limite</span>}
                                    {warn && !over && <span style={{ fontSize: "0.7rem", color: "var(--color-warning)", fontWeight: 600 }}>⚠ 80%+</span>}
                                </span>
                                <button
                                    className="btn btn-danger"
                                    onClick={() => handleDelete(b.id)}
                                    disabled={isPending}
                                    style={{ padding: "0.2rem 0.5rem", fontSize: "0.75rem" }}
                                >✕</button>
                            </div>

                            {/* Progress bar */}
                            <div>
                                <div style={{ height: "6px", backgroundColor: "var(--color-surface-2)", borderRadius: "1px", overflow: "hidden" }}>
                                    <div
                                        style={{
                                            height: "100%",
                                            width: `${pct}%`,
                                            backgroundColor: barColor,
                                            borderRadius: "1px",
                                            transition: "width 0.5s ease",
                                        }}
                                    />
                                </div>
                                <div style={{ display: "flex", justifyContent: "space-between", marginTop: "0.375rem", fontSize: "0.8rem" }}>
                                    <span style={{ color: "var(--color-muted)" }}>
                                        Gasto: <strong style={{ color: over ? "var(--color-danger)" : "var(--color-text)" }}>{formatCurrency(b.spent)}</strong>
                                    </span>
                                    <span style={{ color: "var(--color-muted)" }}>
                                        Limite: <strong>{formatCurrency(b.limit)}</strong>
                                        {" "}·{" "}
                                        <strong style={{ color: barColor }}>{pct.toFixed(0)}%</strong>
                                    </span>
                                </div>
                            </div>
                        </div>
                    );
                })}
            </div>

            {showForm && (
                <div
                    style={{ position: "fixed", inset: 0, backgroundColor: "rgba(0,0,0,0.7)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 50 }}
                    onClick={(e) => e.target === e.currentTarget && setShowForm(false)}
                >
                    <div className="card" style={{ width: "100%", maxWidth: "380px", display: "flex", flexDirection: "column", gap: "1.25rem" }}>
                        <h2 style={{ fontSize: "1rem" }}>Nova Meta — {MONTHS[month - 1]}/{year}</h2>
                        <form onSubmit={handleUpsert} style={{ display: "flex", flexDirection: "column", gap: "0.875rem" }}>
                            <div>
                                <label style={{ fontSize: "0.75rem", color: "var(--color-muted)", display: "block", marginBottom: "0.375rem" }}>Categoria</label>
                                <select name="categoryId" className="input-base" required>
                                    <option value="">Selecionar</option>
                                    {categories.map((c) => (
                                        <option key={c.id} value={c.id}>{c.icon} {c.name}</option>
                                    ))}
                                </select>
                            </div>
                            <div>
                                <label style={{ fontSize: "0.75rem", color: "var(--color-muted)", display: "block", marginBottom: "0.375rem" }}>Limite (R$)</label>
                                <input name="amount" type="number" step="0.01" min="0.01" className="input-base" placeholder="Ex: 500" required />
                            </div>
                            <div style={{ display: "flex", gap: "0.75rem", justifyContent: "flex-end" }}>
                                <button type="button" className="btn btn-ghost" onClick={() => setShowForm(false)}>Cancelar</button>
                                <button type="submit" className="btn btn-primary" disabled={isPending}>{isPending ? "Salvando..." : "Salvar"}</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}
