"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireActiveUser, requireAdmin } from "@/lib/auth";
import { buscarPerfil } from "@/lib/core/repositories/users.repo";
import {
  atualizarDespesa,
  buscarDespesa,
  contarPorStatus,
  criarDespesa,
  excluirDespesa,
  fecharLote,
  listarCategoriasDespesa,
  listarDespesasParaRelatorio,
  listarDespesasPorStatus,
  listarDespesasDoUsuario,
  listarLotes,
  previaDeFechamento,
  transicionar,
  alternarCategoriaDespesa,
  criarCategoriaDespesa,
} from "@/lib/core/repositories/expenses.repo";
import { paraCentavos } from "@/lib/core/money";
import { traduzirErro } from "@/lib/guardrails/transactions";
import { fail, failFromZod, mensagemDeErro, ok, type Result } from "@/lib/guardrails/result";
import type { Expense, ExpenseCategory, PaymentBatch } from "@/types";

const Despesa = z.object({
  amount: z.coerce.number().positive("O valor precisa ser maior que zero.").max(1_000_000),
  date: z.string().min(1, "Informe a data."),
  categoryId: z.string().min(1, "Escolha a categoria."),
  description: z.string().trim().min(2, "Descreva a despesa."),
  receiptPath: z.string().optional().nullable(),
  receiptUrl: z.string().url().optional().nullable(),
  submissionId: z.string().min(8).optional(),
});

async function nomeDoUsuario(uid: string, email: string | null) {
  const perfil = await buscarPerfil(uid);
  return perfil?.name ?? email ?? "Sem nome";
}

// --- leitura -----------------------------------------------------------------

export async function obterCategoriasDespesa(): Promise<ExpenseCategory[]> {
  await requireActiveUser();
  return listarCategoriasDespesa();
}

export async function obterMinhasDespesas(): Promise<Expense[]> {
  const u = await requireActiveUser();
  return listarDespesasDoUsuario(u.uid);
}

export async function obterFilaDeAprovacao(): Promise<Expense[]> {
  await requireAdmin();
  return listarDespesasPorStatus("ENVIADA");
}

export async function obterRelatorio(filtros: {
  userId?: string;
  status?: string;
  desde?: string;
  ate?: string;
}): Promise<Result<Expense[]>> {
  try {
    await requireAdmin();
    return ok(
      await listarDespesasParaRelatorio({
        userId: filtros.userId || undefined,
        status: (filtros.status as Expense["status"]) || undefined,
        desde: filtros.desde ? new Date(filtros.desde) : undefined,
        ate: filtros.ate ? new Date(`${filtros.ate}T23:59:59`) : undefined,
      }),
    );
  } catch (erro) {
    return fail(mensagemDeErro(erro, "Não foi possível carregar o relatório."));
  }
}

export async function obterLotes(): Promise<PaymentBatch[]> {
  await requireAdmin();
  return listarLotes();
}

export async function contarPendencias(): Promise<{ aprovar: number; corrigir: number }> {
  const u = await requireActiveUser();
  const [aprovar, corrigir] = await Promise.all([
    u.role === "ADMIN" ? contarPorStatus("ENVIADA") : Promise.resolve(0),
    contarPorStatus("REJEITADA", u.uid),
  ]);
  return { aprovar, corrigir };
}

// --- colaborador -------------------------------------------------------------

export async function registrarDespesa(formData: FormData): Promise<Result<{ semComprovante: boolean }>> {
  const u = await requireActiveUser();

  const raw = Object.fromEntries(formData) as Record<string, unknown>;
  if (raw.receiptUrl === "") delete raw.receiptUrl;
  if (raw.receiptPath === "") delete raw.receiptPath;

  const parsed = Despesa.safeParse(raw);
  if (!parsed.success) return failFromZod(parsed.error.flatten());

  try {
    const nome = await nomeDoUsuario(u.uid, u.email);
    const idEnvio = parsed.data.submissionId ?? crypto.randomUUID();

    await criarDespesa(
      { uid: u.uid, nome },
      {
        amountCents: paraCentavos(parsed.data.amount),
        date: new Date(parsed.data.date),
        categoryId: parsed.data.categoryId,
        description: parsed.data.description,
        receiptPath: parsed.data.receiptPath ?? null,
        receiptUrl: parsed.data.receiptUrl ?? null,
      },
      true, // envia direto: registrar na rua e deixar como rascunho seria pegadinha
      idEnvio,
    );

    revalidatePath("/despesas");
    return ok({ semComprovante: !parsed.data.receiptUrl });
  } catch (erro) {
    return fail(mensagemDeErro(traduzirErro(erro), "Não foi possível registrar a despesa."));
  }
}

export async function corrigirDespesa(id: string, formData: FormData): Promise<Result> {
  const u = await requireActiveUser();

  const raw = Object.fromEntries(formData) as Record<string, unknown>;
  if (raw.receiptUrl === "") delete raw.receiptUrl;
  if (raw.receiptPath === "") delete raw.receiptPath;

  const parsed = Despesa.safeParse(raw);
  if (!parsed.success) return failFromZod(parsed.error.flatten());

  try {
    await atualizarDespesa(id, u.uid, {
      amountCents: paraCentavos(parsed.data.amount),
      date: new Date(parsed.data.date),
      categoryId: parsed.data.categoryId,
      description: parsed.data.description,
      receiptPath: parsed.data.receiptPath ?? null,
      receiptUrl: parsed.data.receiptUrl ?? null,
    });
    revalidatePath("/despesas");
    return ok();
  } catch (erro) {
    return fail(mensagemDeErro(traduzirErro(erro), "Não foi possível corrigir a despesa."));
  }
}

export async function reenviarDespesa(id: string): Promise<Result> {
  const u = await requireActiveUser();
  try {
    const nome = await nomeDoUsuario(u.uid, u.email);
    await transicionar(id, "ENVIADA", { uid: u.uid, nome, papel: u.role });
    revalidatePath("/despesas");
    return ok();
  } catch (erro) {
    return fail(mensagemDeErro(traduzirErro(erro), "Não foi possível reenviar."));
  }
}

export async function removerDespesa(id: string): Promise<Result> {
  const u = await requireActiveUser();
  try {
    await excluirDespesa(id, u.uid);
    revalidatePath("/despesas");
    return ok();
  } catch (erro) {
    return fail(mensagemDeErro(traduzirErro(erro), "Não foi possível excluir."));
  }
}

// --- administrador -----------------------------------------------------------

export async function aprovarDespesa(id: string): Promise<Result> {
  const u = await requireAdmin();
  try {
    const nome = await nomeDoUsuario(u.uid, u.email);
    await transicionar(id, "APROVADA", { uid: u.uid, nome, papel: "ADMIN" });
    revalidatePath("/admin/aprovacoes");
    return ok();
  } catch (erro) {
    return fail(mensagemDeErro(traduzirErro(erro), "Não foi possível aprovar."));
  }
}

export async function rejeitarDespesa(id: string, motivo: string): Promise<Result> {
  const u = await requireAdmin();
  if (!motivo?.trim()) return fail("Informe o motivo da rejeição.");

  try {
    const nome = await nomeDoUsuario(u.uid, u.email);
    await transicionar(id, "REJEITADA", { uid: u.uid, nome, papel: "ADMIN" }, { motivo: motivo.trim() });
    revalidatePath("/admin/aprovacoes");
    return ok();
  } catch (erro) {
    return fail(mensagemDeErro(traduzirErro(erro), "Não foi possível rejeitar."));
  }
}

export async function obterPreviaFechamento(
  userId: string,
  desde: string,
  ate: string,
): Promise<Result<{ quantidade: number; totalCents: number }>> {
  try {
    await requireAdmin();
    const p = await previaDeFechamento(userId, new Date(desde), new Date(`${ate}T23:59:59`));
    return ok({ quantidade: p.quantidade, totalCents: p.totalCents });
  } catch (erro) {
    return fail(mensagemDeErro(erro, "Não foi possível calcular a prévia."));
  }
}

export async function fecharLoteDePagamento(
  userId: string,
  userName: string,
  desde: string,
  ate: string,
): Promise<Result<{ quantidade: number; totalCents: number }>> {
  const u = await requireAdmin();
  try {
    const nome = await nomeDoUsuario(u.uid, u.email);
    const r = await fecharLote(
      { uid: u.uid, nome },
      { userId, userName },
      { desde: new Date(desde), ate: new Date(`${ate}T23:59:59`) },
    );
    revalidatePath("/admin/relatorios");
    return ok({ quantidade: r.quantidade, totalCents: r.totalCents });
  } catch (erro) {
    return fail(mensagemDeErro(traduzirErro(erro), "Não foi possível fechar o lote."));
  }
}

export async function adicionarCategoriaDespesa(nome: string, icone: string): Promise<Result> {
  try {
    await requireAdmin();
    if (!nome.trim()) return fail("Informe o nome da categoria.");
    await criarCategoriaDespesa(nome.trim(), icone || "📌");
    revalidatePath("/admin/relatorios");
    return ok();
  } catch (erro) {
    return fail(mensagemDeErro(erro, "Não foi possível criar a categoria."));
  }
}

export async function alternarAtivaCategoriaDespesa(id: string, ativa: boolean): Promise<Result> {
  try {
    await requireAdmin();
    await alternarCategoriaDespesa(id, ativa);
    revalidatePath("/admin/relatorios");
    return ok();
  } catch (erro) {
    return fail(mensagemDeErro(erro, "Não foi possível alterar a categoria."));
  }
}

export async function obterDespesa(id: string): Promise<Result<Expense>> {
  const u = await requireActiveUser();
  const d = await buscarDespesa(id);
  if (!d) return fail("Despesa não encontrada.");
  if (d.userId !== u.uid && u.role !== "ADMIN") return fail("Esta despesa não é sua.");
  return ok(d);
}
