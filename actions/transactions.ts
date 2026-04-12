"use server";

import { db } from "@/lib/db";
import { getMonthRange } from "@/lib/utils";
import { revalidatePath } from "next/cache";
import { z } from "zod";

const TransactionSchema = z.object({
    description: z.string().min(1, "Descrição obrigatória"),
    amount: z.coerce.number().positive("Valor deve ser positivo"),
    type: z.enum(["INCOME", "EXPENSE"]),
    status: z.enum(["PENDING", "COMPLETED"]).default("COMPLETED"),
    date: z.string().min(1, "Data obrigatória"),
    accountId: z.string().min(1, "Conta obrigatória"),
    categoryId: z.string().min(1, "Categoria obrigatória"),
    payee: z.string().optional().nullable(),
    tags: z.string().optional().nullable(),
    notes: z.string().optional().nullable(),
    isInstallment: z.coerce.boolean().default(false),
    totalInstallments: z.coerce.number().min(1).optional().nullable(),
    receiptUrl: z.string().url().optional().nullable(),
});

export async function getTransactions(month?: number, year?: number, type?: string, categoryId?: string) {
    const filters: Record<string, unknown> = {};
    if (month && year) {
        const { start, end } = getMonthRange(month, year);
        filters.date = { gte: start, lte: end };
    }
    if (type === "INCOME" || type === "EXPENSE") filters.type = type;
    if (categoryId) filters.categoryId = categoryId;

    return db.transaction.findMany({
        where: filters,
        include: { account: true, category: true },
        orderBy: { date: "desc" },
    });
}

export async function createTransaction(formData: FormData) {
    const raw = Object.fromEntries(formData);
    if (raw.isInstallment === "on") raw.isInstallment = "true";
    if (raw.receiptUrl === "") delete raw.receiptUrl;

    const parsed = TransactionSchema.safeParse(raw);
    if (!parsed.success) return { error: parsed.error.flatten().fieldErrors };

    const { amount, date, isInstallment, totalInstallments, ...rest } = parsed.data;
    const baseDate = new Date(date);

    if (isInstallment && totalInstallments && totalInstallments > 1) {
        // Multi-installment creation
        for (let i = 1; i <= totalInstallments; i++) {
            const installmentDate = new Date(baseDate);
            installmentDate.setMonth(baseDate.getMonth() + (i - 1));

            await db.transaction.create({
                data: {
                    ...rest,
                    amount,
                    date: installmentDate,
                    isInstallment: true,
                    installment: i,
                    totalInstallments
                },
            });

            // Update account balance ONLY if COMPLETED and it's the current month (or past)
            // For simplicity in this home app, we update balance if status is COMPLETED regardless of date
            if (rest.status === "COMPLETED") {
                const delta = rest.type === "INCOME" ? amount : -amount;
                await db.account.update({
                    where: { id: rest.accountId },
                    data: { balance: { increment: delta } },
                });
            }
        }
    } else {
        // Single transaction
        await db.transaction.create({
            data: { ...rest, amount, date: baseDate, isInstallment: false },
        });

        if (rest.status === "COMPLETED") {
            const delta = rest.type === "INCOME" ? amount : -amount;
            await db.account.update({
                where: { id: rest.accountId },
                data: { balance: { increment: delta } },
            });
        }
    }

    revalidatePath("/");
    return { success: true };
}

export async function updateTransaction(id: string, formData: FormData) {
    const existing = await db.transaction.findUnique({ where: { id } });
    if (!existing) return { error: "Transação não encontrada" };

    const raw = Object.fromEntries(formData);
    if (raw.receiptUrl === "") delete raw.receiptUrl;
    const parsed = TransactionSchema.safeParse(raw);
    if (!parsed.success) return { error: parsed.error.flatten().fieldErrors };

    const { amount, date, isInstallment, totalInstallments, ...rest } = parsed.data;

    // 1. Reverse old balance effect if it was COMPLETED
    if (existing.status === "COMPLETED") {
        const oldDelta = existing.type === "INCOME" ? -Number(existing.amount) : Number(existing.amount);
        await db.account.update({ where: { id: existing.accountId }, data: { balance: { increment: oldDelta } } });
    }

    // 2. Update transaction
    await db.transaction.update({
        where: { id },
        data: { ...rest, amount, date: new Date(date) },
    });

    // 3. Apply new balance effect if it is now COMPLETED
    if (parsed.data.status === "COMPLETED") {
        const newDelta = parsed.data.type === "INCOME" ? amount : -amount;
        await db.account.update({ where: { id: parsed.data.accountId }, data: { balance: { increment: newDelta } } });
    }

    revalidatePath("/");
    return { success: true };
}

export async function deleteTransaction(id: string) {
    const tx = await db.transaction.findUnique({ where: { id } });
    if (!tx) return { error: "Transação não encontrada" };

    // Reverse balance effect if it was COMPLETED
    if (tx.status === "COMPLETED") {
        const delta = tx.type === "INCOME" ? -Number(tx.amount) : Number(tx.amount);
        await db.account.update({ where: { id: tx.accountId }, data: { balance: { increment: delta } } });
    }

    await db.transaction.delete({ where: { id } });

    revalidatePath("/");
    return { success: true };
}

export async function getMonthSummary(month: number, year: number) {
    const { start, end } = getMonthRange(month, year);
    const txs = await db.transaction.findMany({ where: { date: { gte: start, lte: end } } });
    const income = txs.filter((t) => t.type === "INCOME").reduce((s, t) => s + Number(t.amount), 0);
    const expense = txs.filter((t) => t.type === "EXPENSE").reduce((s, t) => s + Number(t.amount), 0);
    return { income, expense, balance: income - expense };
}

export async function getMonthlyHistory(months = 6) {
    const result: Array<{ month: number; year: number; income: number; expense: number; balance: number }> = [];
    const now = new Date();
    for (let i = months - 1; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        const month = d.getMonth() + 1;
        const year = d.getFullYear();
        const summary = await getMonthSummary(month, year);
        result.push({ month, year, ...summary });
    }
    return result;
}

export async function getForecastHistory(months = 3) {
    const result: Array<{ month: number; year: number; income: number; expense: number; balance: number }> = [];
    const now = new Date();
    // Start from next month
    for (let i = 1; i <= months; i++) {
        const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
        const month = d.getMonth() + 1;
        const year = d.getFullYear();
        const summary = await getMonthSummary(month, year);
        result.push({ month, year, ...summary });
    }
    return result;
}

export async function toggleTransactionStatus(id: string) {
    const tx = await db.transaction.findUnique({ where: { id } });
    if (!tx) return { error: "Transação não encontrada" };

    const newStatus = tx.status === "COMPLETED" ? "PENDING" : "COMPLETED";
    const amount = Number(tx.amount);

    // Update Transaction
    await db.transaction.update({
        where: { id },
        data: { status: newStatus },
    });

    // Adjust Account Balance
    // If becoming COMPLETED: Income+, Expense-
    // If becoming PENDING: Income-, Expense+ (Reverse)
    let delta = 0;
    if (newStatus === "COMPLETED") {
        delta = tx.type === "INCOME" ? amount : -amount;
    } else {
        delta = tx.type === "INCOME" ? -amount : amount;
    }

    await db.account.update({
        where: { id: tx.accountId },
        data: { balance: { increment: delta } },
    });

    revalidatePath("/");
    return { success: true };
}

export async function getExpensesByCategory(month: number, year: number) {
    const { start, end } = getMonthRange(month, year);
    const txs = await db.transaction.findMany({
        where: { type: "EXPENSE", date: { gte: start, lte: end } },
        include: { category: true },
    });

    const map = new Map<string, { name: string; color: string; total: number }>();
    for (const tx of txs) {
        const existing = map.get(tx.categoryId) ?? { name: tx.category.name, color: tx.category.color, total: 0 };
        existing.total += Number(tx.amount);
        map.set(tx.categoryId, existing);
    }
    return Array.from(map.values()).sort((a, b) => b.total - a.total);
}

export async function getExpensesByCategoryYear(year: number) {
    const start = new Date(year, 0, 1);
    const end = new Date(year, 11, 31, 23, 59, 59);
    const txs = await db.transaction.findMany({
        where: { type: "EXPENSE", date: { gte: start, lte: end } },
        include: { category: true },
    });

    const map = new Map<string, { name: string; color: string; total: number }>();
    for (const tx of txs) {
        const existing = map.get(tx.categoryId) ?? { name: tx.category.name, color: tx.category.color, total: 0 };
        existing.total += Number(tx.amount);
        map.set(tx.categoryId, existing);
    }
    return Array.from(map.values()).sort((a, b) => b.total - a.total);
}
