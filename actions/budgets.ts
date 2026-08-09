"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import {
  excluirOrcamento,
  listarOrcamentos,
  salvarOrcamento,
  type OrcamentoComGasto,
} from "@/lib/core/repositories/budgets.repo";
import { traduzirErro } from "@/lib/guardrails/transactions";
import { fail, failFromZod, mensagemDeErro, ok, type Result } from "@/lib/guardrails/result";

const Orcamento = z.object({
  categoryId: z.string().min(1, "Escolha a categoria."),
  amount: z.coerce.number().positive("O limite precisa ser maior que zero."),
  month: z.coerce.number().min(1).max(12),
  year: z.coerce.number().min(2020),
});

export async function getBudgets(month: number, year: number): Promise<OrcamentoComGasto[]> {
  return listarOrcamentos(month, year);
}

export async function upsertBudget(formData: FormData): Promise<Result> {
  const parsed = Orcamento.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return failFromZod(parsed.error.flatten());

  try {
    await salvarOrcamento(parsed.data);
    revalidatePath("/");
    return ok();
  } catch (erro) {
    return fail(mensagemDeErro(traduzirErro(erro), "Não foi possível salvar o orçamento."));
  }
}

export async function deleteBudget(id: string): Promise<Result> {
  try {
    await excluirOrcamento(id);
    revalidatePath("/");
    return ok();
  } catch (erro) {
    return fail(mensagemDeErro(traduzirErro(erro), "Não foi possível excluir o orçamento."));
  }
}
