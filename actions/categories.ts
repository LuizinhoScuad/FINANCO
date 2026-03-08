"use server";

import { db } from "@/lib/db";
import { revalidatePath } from "next/cache";
import { z } from "zod";

const CategorySchema = z.object({
    name: z.string().min(1, "Nome obrigatório"),
    icon: z.string().min(1),
    type: z.enum(["INCOME", "EXPENSE"]),
    color: z.string().min(1),
});

export async function getCategories(type?: "INCOME" | "EXPENSE") {
    return db.category.findMany({
        where: type ? { type } : undefined,
        orderBy: { name: "asc" },
    });
}

export async function createCategory(formData: FormData) {
    const raw = Object.fromEntries(formData);
    const parsed = CategorySchema.safeParse(raw);
    if (!parsed.success) return { error: parsed.error.flatten().fieldErrors };

    await db.category.create({ data: parsed.data });
    revalidatePath("/");
    return { success: true };
}

export async function updateCategory(id: string, formData: FormData) {
    const raw = Object.fromEntries(formData);
    const parsed = CategorySchema.safeParse(raw);
    if (!parsed.success) return { error: parsed.error.flatten().fieldErrors };

    await db.category.update({ where: { id }, data: parsed.data });
    revalidatePath("/");
    return { success: true };
}

export async function deleteCategory(id: string) {
    await db.category.delete({ where: { id } });
    revalidatePath("/");
    return { success: true };
}
