import { getMonthSummary, getMonthlyHistory, getForecastHistory, getExpensesByCategory, getExpensesByCategoryYear, getTransactions } from "@/actions/transactions";
import { getTotalBalance } from "@/actions/accounts";
import { formatCurrency, formatDate, currentMonth } from "@/lib/utils";
import { MonthlyBarChart } from "@/components/charts/MonthlyBarChart";
import { CategoryPieChart } from "@/components/charts/CategoryPieChart";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
    const { month, year } = currentMonth();
    const [summary, totalBalance, history, forecast, byCategory, byCategoryYear, recentTxs] = await Promise.all([
        getMonthSummary(month, year),
        getTotalBalance(),
        getMonthlyHistory(6),
        getForecastHistory(3),
        getExpensesByCategory(month, year),
        getExpensesByCategoryYear(year),
        getTransactions(),
    ]);

    const combinedHistory = [...history, ...forecast];
    const recent = recentTxs.slice(0, 8);

    return (
        <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
            {/* Header */}
            <div className="animate-fade-up">
                <h1 style={{ fontSize: "1.5rem", marginBottom: "0.25rem" }}>Dashboard</h1>
                <p style={{ color: "var(--color-muted)", fontSize: "0.875rem" }}>
                    {new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric" }).format(new Date(year, month - 1))}
                </p>
            </div>

            {/* Summary Cards */}
            <div
                className="animate-fade-up"
                style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
                    gap: "1rem",
                    animationDelay: "0.05s",
                }}
            >
                <SummaryCard
                    label="Saldo Total"
                    value={formatCurrency(totalBalance)}
                    color="var(--color-accent)"
                    icon="◈"
                />
                <SummaryCard
                    label="Receitas do Mês"
                    value={formatCurrency(summary.income)}
                    color="var(--color-accent)"
                    icon="↑"
                    sub="entradas"
                />
                <SummaryCard
                    label="Despesas do Mês"
                    value={formatCurrency(summary.expense)}
                    color="var(--color-danger)"
                    icon="↓"
                    sub="saídas"
                />
                <SummaryCard
                    label="Balanço do Mês"
                    value={formatCurrency(summary.balance)}
                    color={summary.balance >= 0 ? "var(--color-accent)" : "var(--color-danger)"}
                    icon="≡"
                    sub={summary.balance >= 0 ? "positivo" : "negativo"}
                />
            </div>

            {/* Charts */}
            <div
                className="animate-fade-up"
                style={{
                    display: "grid",
                    gridTemplateColumns: "2fr 1fr",
                    gap: "1rem",
                    animationDelay: "0.1s",
                }}
            >
                <div className="card">
                    <h2 style={{ fontSize: "0.9rem", marginBottom: "1rem", color: "var(--color-muted)", textTransform: "uppercase", letterSpacing: "0.08em" }}>
                        Fluxo de Caixa (Histórico + Projeção)
                    </h2>
                    <MonthlyBarChart data={combinedHistory} />
                </div>
                <div className="card">
                    <h2 style={{ fontSize: "0.9rem", marginBottom: "1rem", color: "var(--color-muted)", textTransform: "uppercase", letterSpacing: "0.08em" }}>
                        Despesas por categoria
                    </h2>
                    <CategoryPieChart data={byCategory} />
                </div>
            </div>

            {/* Expenses by Category — Year */}
            <div className="card animate-fade-up" style={{ animationDelay: "0.13s" }}>
                <h2 style={{ fontSize: "0.9rem", marginBottom: "1rem", color: "var(--color-muted)", textTransform: "uppercase", letterSpacing: "0.08em" }}>
                    Despesas por categoria — {year}
                </h2>
                {byCategoryYear.length === 0 ? (
                    <p style={{ color: "var(--color-muted)", textAlign: "center", padding: "2rem 0" }}>Sem despesas este ano.</p>
                ) : (
                    <div style={{ display: "flex", gap: "2rem", alignItems: "center", flexWrap: "wrap" }}>
                        <div style={{ flex: "0 0 220px" }}>
                            <CategoryPieChart data={byCategoryYear} emptyMessage="Sem despesas este ano" />
                        </div>
                        <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: "0.5rem", minWidth: "180px" }}>
                            {byCategoryYear.map((entry, i) => {
                                const yearTotal = byCategoryYear.reduce((s, e) => s + e.total, 0);
                                const pct = yearTotal > 0 ? Math.round((entry.total / yearTotal) * 100) : 0;
                                return (
                                    <div key={entry.name} style={{ display: "flex", alignItems: "center", gap: "0.625rem" }}>
                                        <span style={{ width: "10px", height: "10px", borderRadius: "2px", backgroundColor: entry.color || "#00d98b", flexShrink: 0 }} />
                                        <span style={{ flex: 1, fontSize: "0.8rem" }}>{entry.name}</span>
                                        <span style={{ fontSize: "0.8rem", color: "var(--color-muted)", minWidth: "36px", textAlign: "right" }}>{pct}%</span>
                                        <span style={{ fontSize: "0.8rem", fontWeight: 600, minWidth: "80px", textAlign: "right" }}>{formatCurrency(entry.total)}</span>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                )}
            </div>

            {/* Recent Transactions */}
            <div className="card animate-fade-up" style={{ animationDelay: "0.15s" }}>
                <h2 style={{ fontSize: "0.9rem", marginBottom: "1rem", color: "var(--color-muted)", textTransform: "uppercase", letterSpacing: "0.08em" }}>
                    Últimas transações
                </h2>
                {recent.length === 0 ? (
                    <p style={{ color: "var(--color-muted)", textAlign: "center", padding: "2rem 0" }}>
                        Nenhuma transação este mês.
                    </p>
                ) : (
                    <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                        {recent.map((tx) => (
                            <div
                                key={tx.id}
                                style={{
                                    display: "flex",
                                    justifyContent: "space-between",
                                    alignItems: "center",
                                    padding: "0.625rem 0.75rem",
                                    borderRadius: "2px",
                                    backgroundColor: "var(--color-surface-2)",
                                }}
                            >
                                <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
                                    <span style={{ fontSize: "1.25rem" }}>{tx.category.icon}</span>
                                    <div>
                                        <div style={{ fontWeight: 500, fontSize: "0.875rem" }}>{tx.description}</div>
                                        <div style={{ fontSize: "0.75rem", color: "var(--color-muted)" }}>
                                            {tx.category.name} · {tx.account.name} · {formatDate(tx.date)}
                                        </div>
                                    </div>
                                </div>
                                <span
                                    style={{
                                        fontWeight: 700,
                                        fontFamily: "var(--font-display)",
                                        color: tx.type === "INCOME" ? "var(--color-accent)" : "var(--color-danger)",
                                    }}
                                >
                                    {tx.type === "INCOME" ? "+" : "-"}{formatCurrency(Number(tx.amount))}
                                </span>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}

function SummaryCard({
    label,
    value,
    color,
    icon,
    sub,
}: {
    label: string;
    value: string;
    color: string;
    icon: string;
    sub?: string;
}) {
    return (
        <div
            className="card animate-count"
            style={{ display: "flex", flexDirection: "column", gap: "0.5rem", borderLeft: `2px solid ${color}` }}
        >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontSize: "0.75rem", color: "var(--color-muted)", textTransform: "uppercase", letterSpacing: "0.08em" }}>
                    {label}
                </span>
                <span style={{ color, fontSize: "1rem" }}>{icon}</span>
            </div>
            <div style={{ fontSize: "1.4rem", fontWeight: 700, fontFamily: "var(--font-display)", color }}>
                {value}
            </div>
            {sub && <div style={{ fontSize: "0.75rem", color: "var(--color-muted)" }}>{sub}</div>}
        </div>
    );
}
