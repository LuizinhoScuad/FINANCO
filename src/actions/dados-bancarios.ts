"use server";

import { revalidatePath } from "next/cache";
import { requireActiveUser } from "@/lib/auth";
import { gravarDadosBancarios } from "@/lib/core/repositories/users.repo";
import { DadosBancariosEntrada } from "@/lib/guardrails/validate";
import { fail, failFromZod, mensagemDeErro, ok, type Result } from "@/lib/guardrails/result";

/**
 * Cadastro de como a pessoa quer receber o reembolso.
 *
 * Dispensa o portão (`exigirDadosBancarios: false`) porque É o portão: exigir
 * os dados aqui trancaria a porta pelo lado de dentro. O que continua valendo é
 * tudo o mais — sessão válida, conta ativa, não bloqueada.
 *
 * O identificador vem da sessão, nunca do formulário: com um `uid` de entrada,
 * qualquer pessoa sobrescreveria a chave PIX de qualquer outra e o próximo
 * pagamento cairia na conta errada (Art. 5).
 */
export async function salvarDadosBancarios(formData: FormData): Promise<Result> {
  const usuario = await requireActiveUser({ exigirDadosBancarios: false });

  const parsed = DadosBancariosEntrada.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return failFromZod(parsed.error.flatten());

  try {
    await gravarDadosBancarios(usuario.uid, parsed.data);
    revalidatePath("/");
    return ok();
  } catch (erro) {
    return fail(mensagemDeErro(erro, "Não foi possível salvar seus dados."));
  }
}
