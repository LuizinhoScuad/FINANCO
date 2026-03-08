"use client";

import { useEffect, useRef, useState } from "react";
import {
    BarChart,
    Bar,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    ResponsiveContainer,
    Legend,
} from "recharts";

type Entry = { month: number; year: number; income: number; expense: number };

function monthLabel(month: number, year: number) {
    return new Intl.DateTimeFormat("pt-BR", { month: "short" }).format(new Date(year, month - 1));
}

export function MonthlyBarChart({ data }: { data: Entry[] }) {
    const chartData = data.map((d) => ({
        name: monthLabel(d.month, d.year),
        Receitas: d.income,
        Despesas: d.expense,
    }));

    return (
        <ResponsiveContainer width="100%" height={220}>
            <BarChart data={chartData} barCategoryGap="30%">
                <CartesianGrid strokeDasharray="3 3" stroke="#1f2d3d" vertical={false} />
                <XAxis dataKey="name" tick={{ fill: "#6b7a99", fontSize: 12 }} axisLine={false} tickLine={false} />
                <YAxis
                    tick={{ fill: "#6b7a99", fontSize: 11 }}
                    axisLine={false}
                    tickLine={false}
                    tickFormatter={(v) => `R$${(v / 1000).toFixed(0)}k`}
                    width={48}
                />
                <Tooltip
                    contentStyle={{ backgroundColor: "#111827", border: "1px solid #1f2d3d", borderRadius: "2px", fontSize: "13px" }}
                    labelStyle={{ color: "#e8eaf0" }}
                    formatter={(value: number) =>
                        new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value)
                    }
                />
                <Legend wrapperStyle={{ fontSize: "12px", paddingTop: "12px" }} />
                <Bar dataKey="Receitas" fill="#00d98b" radius={[2, 2, 0, 0]} />
                <Bar dataKey="Despesas" fill="#ff4d6d" radius={[2, 2, 0, 0]} />
            </BarChart>
        </ResponsiveContainer>
    );
}
