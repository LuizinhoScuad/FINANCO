"use server";

import { db } from "@/lib/db";
import { revalidatePath } from "next/cache";
import { z } from "zod";

const AccountSchema = z.object({
    name: z.string().min(1, "Nome obrigatório"),
    type: z.enum(["CASH", "BANK", "SAVINGS", "INVESTMENT"]),
    color: z.string().min(1),
    balance: z.coerce.number().default(0),
});

export async function getAccounts() {
    return db.account.findMany({ orderBy: { createdAt: "asc" } });
}

export async function getTotalBalance() {
    const accounts = await db.account.findMany({ select: { balance: true } });
    return accounts.reduce((sum: number, a: { balance: unknown }) => sum + Number(a.balance), 0);
}

export async function createAccount(formData: FormData) {
    const raw = Object.fromEntries(formData);
    const parsed = AccountSchema.safeParse(raw);
    if (!parsed.success) return { error: parsed.error.flatten().fieldErrors };

    await db.account.create({ data: parsed.data });
    revalidatePath("/");
    return { success: true };
}

export async function updateAccount(id: string, formData: FormData) {
    const raw = Object.fromEntries(formData);
    const parsed = AccountSchema.safeParse(raw);
    if (!parsed.success) return { error: parsed.error.flatten().fieldErrors };

    await db.account.update({ where: { id }, data: parsed.data });
    revalidatePath("/");
    return { success: true };
}

export async function deleteAccount(id: string) {
    await db.account.delete({ where: { id } });
    revalidatePath("/");
    return { success: true };
}
