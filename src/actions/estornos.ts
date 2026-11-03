"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { estornarLancamento as estornar, listarEstornos } from "@/lib/core/repositories/transactions.repo";
import { buscarPerfil } from "@/lib/core/repositories/users.repo";
import { traduzirErro } from "@/lib/guardrails/transactions";
import { fail, mensagemDeErro, ok, type Result } from "@/lib/guardrails/result";
import type { Estorno } from "@/types";

/**
 * Estorno — o gesto do administrador sobre o lançamento alheio (RF-67 a RF-69).
 *
 * Só orquestra: confirma o papel, exige o motivo, resolve os nomes e entrega ao
 * repositório, que faz tudo numa transação só.
 */

const Pedido = z.object({
  dono: z.string().min(1),
  id: z.string().min(1),
  motivo: z.string().trim().min(3, "Escreva o motivo do estorno."),
});

export async function estornarLancamento(
  dono: string,
  id: string,
  motivo: string,
): Promise<Result<{ aposPagamento: boolean; amount: number; description: string }>> {
  const admin = await requireAdmin();
  const parsed = Pedido.safeParse({ dono, id, motivo });
  if (!parsed.success) return fail("Escreva o motivo do estorno — ele fica guardado junto com a cópia.");

  const [alvo, proprio] = await Promise.all([buscarPerfil(dono), buscarPerfil(admin.uid)]);
  if (!alvo) return fail("Pessoa não encontrada.");

  try {
    const resultado = await estornar(
      { uid: dono, nome: alvo.name },
      id,
      { uid: admin.uid, nome: proprio?.name || admin.email || "Administrador" },
      parsed.data.motivo,
    );
    revalidatePath("/");
    return ok(resultado);
  } catch (erro) {
    return fail(mensagemDeErro(traduzirErro(erro), "Não foi possível estornar o lançamento."));
  }
}

export async function getEstornos(): Promise<Estorno[]> {
  await requireAdmin();
  return listarEstornos();
}
