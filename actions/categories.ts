"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import {
  atualizarCategoria,
  criarCategoria,
  excluirCategoria,
  listarCategorias,
} from "@/lib/core/repositories/categories.repo";
import { traduzirErro } from "@/lib/guardrails/transactions";
import { fail, failFromZod, mensagemDeErro, ok, type Result } from "@/lib/guardrails/result";
import type { Category } from "@/types";

const Categoria = z.object({
  name: z.string().min(1, "Informe o nome da categoria."),
  icon: z.string().min(1),
  type: z.enum(["INCOME", "EXPENSE"]),
  color: z.string().min(1),
});

export async function getCategories(type?: "INCOME" | "EXPENSE"): Promise<Category[]> {
  return listarCategorias(type);
}

export async function createCategory(formData: FormData): Promise<Result> {
  const parsed = Categoria.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return failFromZod(parsed.error.flatten());

  try {
    await criarCategoria(parsed.data);
    revalidatePath("/");
    return ok();
  } catch (erro) {
    return fail(mensagemDeErro(traduzirErro(erro), "Não foi possível criar a categoria."));
  }
}

export async function updateCategory(id: string, formData: FormData): Promise<Result> {
  const parsed = Categoria.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return failFromZod(parsed.error.flatten());

  try {
    await atualizarCategoria(id, parsed.data);
    revalidatePath("/");
    return ok();
  } catch (erro) {
    return fail(mensagemDeErro(traduzirErro(erro), "Não foi possível atualizar a categoria."));
  }
}

export async function deleteCategory(id: string): Promise<Result> {
  try {
    await excluirCategoria(id);
    revalidatePath("/");
    return ok();
  } catch (erro) {
    // "Categoria em uso" chega aqui e agora aparece na tela, em vez de virar
    // uma promessa rejeitada sem tratamento.
    return fail(mensagemDeErro(traduzirErro(erro), "Não foi possível excluir a categoria."));
  }
}
