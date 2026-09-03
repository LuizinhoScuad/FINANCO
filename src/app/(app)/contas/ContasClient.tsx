"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createAccount, deleteAccount, getAccountDeletionImpact } from "@/actions/accounts";
import { formatCurrency } from "@/lib/utils";
import { Aviso, ConfirmarDestrutivo } from "@/components/ui/Aviso";
import type { Account } from "@/types";


const ACCOUNT_TYPES: Record<string, string> = {
    CASH: "💵 Carteira",
    BANK: "🏦 Conta Corrente",
    SAVINGS: "🏧 Poupança",
    INVESTMENT: "📈 Investimento",
};

const COLORS = ["#00d98b", "#ff4d6d", "#f59e0b", "#60a5fa", "#a78bfa", "#f97316"];

export function ContasClient({ accounts }: { accounts: Account[] }) {
    const router = useRouter();
    const [showForm, setShowForm] = useState(false);
    const [isPending, startTransition] = useTransition();
    const [erro, setErro] = useState("");
    const [sucesso, setSucesso] = useState("");
    const [excluindo, setExcluindo] = useState<{ conta: Account; lancamentos: number } | null>(null);

    async function handleCreate(e: React.FormEvent<HTMLFormElement>) {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        setErro("");
        startTransition(async () => {
            const res = await createAccount(fd);
            if (!res.ok) {
                // Antes o formulário fechava aqui como se tivesse dado certo.
                setErro(res.error);
                return;
            }
            setShowForm(false);
            setSucesso("Conta criada.");
            router.refresh();
        });
    }

    /** Consulta o impacto ANTES de perguntar — Art. 1. */
    async function pedirExclusao(conta: Account) {
        setErro("");
        const res = await getAccountDeletionImpact(conta.id);
        setExcluindo({ conta, lancamentos: res.ok ? res.data : 0 });
    }

    function confirmarExclusao() {
        if (!excluindo) return;
        const { conta } = excluindo;
        startTransition(async () => {
            const res = await deleteAccount(conta.id);
            setExcluindo(null);
            if (!res.ok) {
                setErro(res.error);
                return;
            }
            setSucesso(`Conta "${conta.name}" excluída.`);
            router.refresh();
        });
    }

    const totalBalance = accounts.reduce((s, a) => s + Number(a.balance), 0);

    return (
        <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                <div className="animate-fade-up">
                    <h1 style={{ fontSize: "1.5rem", marginBottom: "0.25rem" }}>Contas</h1>
                    <p style={{ color: "var(--color-muted)", fontSize: "0.875rem" }}>
                        Saldo total: <strong style={{ color: totalBalance >= 0 ? "var(--color-accent)" : "var(--color-danger)" }}>{formatCurrency(totalBalance)}</strong>
                    </p>
                </div>
                <button className="btn btn-primary" onClick={() => setShowForm(true)}>+ Nova Conta</button>
            </div>

            {erro && <Aviso tipo="erro" mensagem={erro} onFechar={() => setErro("")} />}
            {sucesso && <Aviso tipo="sucesso" mensagem={sucesso} autoFecharMs={3000} onFechar={() => setSucesso("")} />}

            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: "1rem" }}>
                {accounts.map((account) => (
                    <div
                        key={account.id}
                        className="card animate-fade-up"
                        style={{ borderLeft: `3px solid ${account.color}`, display: "flex", flexDirection: "column", gap: "0.75rem" }}
                    >
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                            <div>
                                <div style={{ fontWeight: 600, fontSize: "1rem" }}>{account.name}</div>
                                <div style={{ fontSize: "0.75rem", color: "var(--color-muted)" }}>{ACCOUNT_TYPES[account.type]}</div>
                            </div>
                            <button
                                className="btn btn-danger"
                                onClick={() => pedirExclusao(account)}
                                disabled={isPending}
                                style={{ padding: "0.2rem 0.5rem", fontSize: "0.75rem" }}
                            >✕</button>
                        </div>
                        <div style={{ fontSize: "1.5rem", fontWeight: 700, fontFamily: "var(--font-display)", color: Number(account.balance) >= 0 ? "var(--color-accent)" : "var(--color-danger)" }}>
                            {formatCurrency(Number(account.balance))}
                        </div>
                    </div>
                ))}

                {accounts.length === 0 && (
                    <p style={{ color: "var(--color-muted)", gridColumn: "1/-1", textAlign: "center", padding: "2rem" }}>
                        Nenhuma conta cadastrada.
                    </p>
                )}
            </div>

            {showForm && (
                <div
                    className="overlay-modal"
                    onClick={(e) => e.target === e.currentTarget && setShowForm(false)}
                >
                    <div className="card" style={{ width: "100%", maxWidth: "400px", display: "flex", flexDirection: "column", gap: "1.25rem" }}>
                        <h2 style={{ fontSize: "1rem" }}>Nova Conta</h2>
                        <form onSubmit={handleCreate} style={{ display: "flex", flexDirection: "column", gap: "0.875rem" }}>
                            <div>
                                <label style={{ fontSize: "0.75rem", color: "var(--color-muted)", display: "block", marginBottom: "0.375rem" }}>Nome</label>
                                <input name="name" className="input-base" placeholder="Ex: Nubank" required />
                            </div>
                            <div>
                                <label style={{ fontSize: "0.75rem", color: "var(--color-muted)", display: "block", marginBottom: "0.375rem" }}>Tipo</label>
                                <select name="type" className="input-base">
                                    <option value="CASH">Carteira</option>
                                    <option value="BANK">Conta Corrente</option>
                                    <option value="SAVINGS">Poupança</option>
                                    <option value="INVESTMENT">Investimento</option>
                                </select>
                            </div>
                            <div>
                                <label style={{ fontSize: "0.75rem", color: "var(--color-muted)", display: "block", marginBottom: "0.375rem" }}>Saldo Inicial (R$)</label>
                                <input name="balance" type="number" step="0.01" defaultValue="0" className="input-base" />
                            </div>
                            <div>
                                <label style={{ fontSize: "0.75rem", color: "var(--color-muted)", display: "block", marginBottom: "0.375rem" }}>Cor</label>
                                <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
                                    {COLORS.map((c) => (
                                        <label key={c} style={{ cursor: "pointer" }}>
                                            <input type="radio" name="color" value={c} style={{ display: "none" }} defaultChecked={c === COLORS[0]} />
                                            <div style={{ width: "28px", height: "28px", borderRadius: "2px", backgroundColor: c, border: "2px solid transparent" }} />
                                        </label>
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

            {excluindo && (
                <ConfirmarDestrutivo
                    titulo={`Excluir a conta "${excluindo.conta.name}"?`}
                    impacto={[
                        `Saldo atual: ${formatCurrency(Number(excluindo.conta.balance))}`,
                        excluindo.lancamentos > 0
                            ? `${excluindo.lancamentos} lançamento(s) serão excluídos junto`
                            : "Nenhum lançamento vinculado",
                    ]}
                    onConfirmar={confirmarExclusao}
                    onCancelar={() => setExcluindo(null)}
                    ocupado={isPending}
                />
            )}
        </div>
    );
}
