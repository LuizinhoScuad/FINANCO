"use client";

import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from "recharts";
import { formatCurrency } from "@/lib/utils";

type Entry = { name: string; color: string; total: number };

const FALLBACK_COLORS = ["#00d98b", "#ff4d6d", "#f59e0b", "#60a5fa", "#a78bfa", "#34d399"];

export function CategoryPieChart({ data, emptyMessage = "Sem despesas este mês" }: { data: Entry[]; emptyMessage?: string }) {
    if (data.length === 0) {
        return (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: 220, color: "var(--color-muted)", fontSize: "0.875rem" }}>
                {emptyMessage}
            </div>
        );
    }

    return (
        <ResponsiveContainer width="100%" height={220}>
            <PieChart>
                <Pie
                    data={data}
                    dataKey="total"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    innerRadius={50}
                    outerRadius={90}
                    paddingAngle={3}
                >
                    {data.map((entry, i) => (
                        <Cell key={entry.name} fill={entry.color || FALLBACK_COLORS[i % FALLBACK_COLORS.length]} />
                    ))}
                </Pie>
                <Tooltip
                    contentStyle={{ backgroundColor: "#111827", border: "1px solid #1f2d3d", borderRadius: "2px", fontSize: "13px" }}
                    formatter={(value: number | undefined) => formatCurrency(value ?? 0)}
                />
            </PieChart>
        </ResponsiveContainer>
    );
}
