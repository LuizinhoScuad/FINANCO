"use server";

import { db } from "@/lib/db";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getMonthRange } from "@/lib/utils";

const BudgetSchema = z.object({
    categoryId: z.string().min(1),
    amount: z.coerce.number().positive("Valor deve ser positivo"),
    month: z.coerce.number().min(1).max(12),
    year: z.coerce.number().min(2020),
});

export async function getBudgets(month: number, year: number) {
    const { start, end } = getMonthRange(month, year);
    const budgets = await db.budget.findMany({
        where: { month, year },
        include: { category: true },
    });

    const transactions = await db.transaction.groupBy({
        by: ["categoryId"],
        where: { type: "EXPENSE", date: { gte: start, lte: end } },
        _sum: { amount: true },
    });

    const spentMap = new Map(transactions.map((t) => [t.categoryId, Number(t._sum.amount ?? 0)]));

    return budgets.map((b) => ({
        ...b,
        spent: spentMap.get(b.categoryId) ?? 0,
        limit: Number(b.amount),
    }));
}

export async function upsertBudget(formData: FormData) {
    const raw = Object.fromEntries(formData);
    const parsed = BudgetSchema.safeParse(raw);
    if (!parsed.success) return { error: parsed.error.flatten().fieldErrors };

    const { categoryId, amount, month, year } = parsed.data;
    await db.budget.upsert({
        where: { categoryId_month_year: { categoryId, month, year } },
        update: { amount },
        create: { categoryId, amount, month, year },
    });
    revalidatePath("/");
    return { success: true };
}

export async function deleteBudget(id: string) {
    await db.budget.delete({ where: { id } });
    revalidatePath("/");
    return { success: true };
}
