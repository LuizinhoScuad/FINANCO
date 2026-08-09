"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import {
  atualizarConta,
  criarConta,
  excluirConta,
  impactoDeExcluirConta,
  listarContas,
  saldoTotal,
} from "@/lib/core/repositories/accounts.repo";
import { traduzirErro } from "@/lib/guardrails/transactions";
import { fail, failFromZod, mensagemDeErro, ok, type Result } from "@/lib/guardrails/result";
import type { Account } from "@/types";

const Conta = z.object({
  name: z.string().min(1, "Informe o nome da conta."),
  type: z.enum(["CASH", "BANK", "SAVINGS", "INVESTMENT"]),
  color: z.string().min(1),
  balance: z.coerce.number().default(0),
});

export async function getAccounts(): Promise<Account[]> {
  return listarContas();
}

export async function getTotalBalance(): Promise<number> {
  return saldoTotal();
}

export async function createAccount(formData: FormData): Promise<Result> {
  const parsed = Conta.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return failFromZod(parsed.error.flatten());

  try {
    await criarConta(parsed.data);
    revalidatePath("/");
    return ok();
  } catch (erro) {
    return fail(mensagemDeErro(traduzirErro(erro), "Não foi possível criar a conta."));
  }
}

export async function updateAccount(id: string, formData: FormData): Promise<Result> {
  const parsed = Conta.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return failFromZod(parsed.error.flatten());

  try {
    await atualizarConta(id, parsed.data);
    revalidatePath("/");
    return ok();
  } catch (erro) {
    return fail(mensagemDeErro(traduzirErro(erro), "Não foi possível atualizar a conta."));
  }
}

/**
 * Quantos lançamentos somem junto com a conta.
 *
 * Existe para a tela poder avisar ANTES de excluir, em vez de apagar histórico
 * atrás de um "tem certeza?" genérico (Art. 1).
 */
export async function getAccountDeletionImpact(id: string): Promise<Result<number>> {
  try {
    return ok(await impactoDeExcluirConta(id));
  } catch (erro) {
    return fail(mensagemDeErro(erro, "Não foi possível verificar o impacto."));
  }
}

export async function deleteAccount(id: string): Promise<Result> {
  try {
    await excluirConta(id);
    revalidatePath("/");
    return ok();
  } catch (erro) {
    return fail(mensagemDeErro(traduzirErro(erro), "Não foi possível excluir a conta."));
  }
}
