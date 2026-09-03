"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createCategory, deleteCategory } from "@/actions/categories";
import { Aviso } from "@/components/ui/Aviso";
import type { Category } from "@/types";

const ICONS = ["🏠", "🍔", "🚗", "🏥", "💊", "🎬", "📚", "✈️", "👕", "⚡", "📱", "💰", "🐶", "🏋", "🎮", "🛒", "💼", "🔧", "🎵", "🍺"];
const COLORS = ["#00d98b", "#ff4d6d", "#f59e0b", "#60a5fa", "#f97316", "#34d399", "#fb7185", "#a3e635"];

export function CategoriasClient({ categories }: { categories: Category[] }) {
    const router = useRouter();
    const [showForm, setShowForm] = useState(false);
    const [isPending, startTransition] = useTransition();
    const [selectedIcon, setSelectedIcon] = useState(ICONS[0]);
    const [selectedColor, setSelectedColor] = useState(COLORS[0]);
    const [erro, setErro] = useState("");
    const [sucesso, setSucesso] = useState("");

    const income = categories.filter((c) => c.type === "INCOME");
    const expense = categories.filter((c) => c.type === "EXPENSE");

    async function handleCreate(e: React.FormEvent<HTMLFormElement>) {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        fd.set("icon", selectedIcon);
        fd.set("color", selectedColor);
        setErro("");
        startTransition(async () => {
            const res = await createCategory(fd);
            if (!res.ok) {
                setErro(res.error);
                return;
            }
            setShowForm(false);
            setSucesso("Categoria criada.");
            router.refresh();
        });
    }

    async function handleDelete(id: string, nome: string) {
        if (!confirm(`Excluir a categoria "${nome}"?`)) return;
        setErro("");
        startTransition(async () => {
            const res = await deleteCategory(id);
            if (!res.ok) {
                // "Esta categoria tem lançamentos" aparece aqui. Antes virava
                // promessa rejeitada sem tratamento e nada acontecia na tela.
                setErro(res.error);
                return;
            }
            setSucesso(`Categoria "${nome}" excluída.`);
            router.refresh();
        });
    }

    return (
        <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
            {erro && <Aviso tipo="erro" mensagem={erro} onFechar={() => setErro("")} />}
            {sucesso && <Aviso tipo="sucesso" mensagem={sucesso} autoFecharMs={3000} onFechar={() => setSucesso("")} />}

            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div className="animate-fade-up">
                    <h1 style={{ fontSize: "1.5rem", marginBottom: "0.25rem" }}>Categorias</h1>
                    <p style={{ color: "var(--color-muted)", fontSize: "0.875rem" }}>{categories.length} categorias</p>
                </div>
                <button className="btn btn-primary" onClick={() => setShowForm(true)}>+ Nova</button>
            </div>

            {[{ label: "Receitas", list: income, type: "INCOME" }, { label: "Despesas", list: expense, type: "EXPENSE" }].map(({ label, list }) => (
                <div key={label} className="animate-fade-up">
                    <h2 style={{ fontSize: "0.8rem", color: "var(--color-muted)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: "0.75rem" }}>
                        {label}
                    </h2>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: "0.625rem" }}>
                        {list.map((cat) => (
                            <div
                                key={cat.id}
                                style={{
                                    display: "flex",
                                    alignItems: "center",
                                    gap: "0.625rem",
                                    padding: "0.625rem 0.875rem",
                                    backgroundColor: "var(--color-surface)",
                                    border: "1px solid var(--color-border)",
                                    borderLeft: `3px solid ${cat.color}`,
                                    borderRadius: "2px",
                                    justifyContent: "space-between",
                                }}
                            >
                                <span style={{ display: "flex", alignItems: "center", gap: "0.5rem", fontSize: "0.875rem" }}>
                                    <span>{cat.icon}</span>
                                    <span style={{ fontWeight: 500 }}>{cat.name}</span>
                                </span>
                                <button
                                    className="btn btn-danger"
                                    onClick={() => handleDelete(cat.id, cat.name)}
                                    disabled={isPending}
                                    style={{ padding: "0.15rem 0.4rem", fontSize: "0.7rem" }}
                                >✕</button>
                            </div>
                        ))}
                        {list.length === 0 && (
                            <p style={{ color: "var(--color-muted)", fontSize: "0.875rem" }}>Nenhuma.</p>
                        )}
                    </div>
                </div>
            ))}

            {showForm && (
                <div
                    className="overlay-modal"
                    onClick={(e) => e.target === e.currentTarget && setShowForm(false)}
                >
                    <div className="card" style={{ width: "100%", maxWidth: "420px", display: "flex", flexDirection: "column", gap: "1.25rem" }}>
                        <h2 style={{ fontSize: "1rem" }}>Nova Categoria</h2>
                        <form onSubmit={handleCreate} style={{ display: "flex", flexDirection: "column", gap: "0.875rem" }}>
                            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem" }}>
                                <div>
                                    <label style={{ fontSize: "0.75rem", color: "var(--color-muted)", display: "block", marginBottom: "0.375rem" }}>Nome</label>
                                    <input name="name" className="input-base" placeholder="Ex: Alimentação" required />
                                </div>
                                <div>
                                    <label style={{ fontSize: "0.75rem", color: "var(--color-muted)", display: "block", marginBottom: "0.375rem" }}>Tipo</label>
                                    <select name="type" className="input-base" defaultValue="EXPENSE">
                                        <option value="EXPENSE">Despesa</option>
                                        <option value="INCOME">Receita</option>
                                    </select>
                                </div>
                            </div>
                            <div>
                                <label style={{ fontSize: "0.75rem", color: "var(--color-muted)", display: "block", marginBottom: "0.5rem" }}>Ícone</label>
                                <div style={{ display: "flex", gap: "0.4rem", flexWrap: "wrap" }}>
                                    {ICONS.map((icon) => (
                                        <button
                                            key={icon}
                                            type="button"
                                            onClick={() => setSelectedIcon(icon)}
                                            style={{
                                                padding: "0.375rem",
                                                fontSize: "1.1rem",
                                                backgroundColor: selectedIcon === icon ? "var(--color-accent-dim)" : "var(--color-surface-2)",
                                                border: `1px solid ${selectedIcon === icon ? "var(--color-accent)" : "var(--color-border)"}`,
                                                borderRadius: "2px",
                                                cursor: "pointer",
                                            }}
                                        >{icon}</button>
                                    ))}
                                </div>
                            </div>
                            <div>
                                <label style={{ fontSize: "0.75rem", color: "var(--color-muted)", display: "block", marginBottom: "0.5rem" }}>Cor</label>
                                <div style={{ display: "flex", gap: "0.5rem" }}>
                                    {COLORS.map((c) => (
                                        <button
                                            key={c}
                                            type="button"
                                            onClick={() => setSelectedColor(c)}
                                            style={{
                                                width: "28px", height: "28px", borderRadius: "2px",
                                                backgroundColor: c,
                                                border: `2px solid ${selectedColor === c ? "white" : "transparent"}`,
                                                cursor: "pointer",
                                            }}
                                        />
                                    ))}
                                </div>
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
