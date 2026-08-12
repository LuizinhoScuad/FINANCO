"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import {
  alternarStatus,
  atualizarLancamento,
  buscarLancamento,
  criarLancamento,
  criarParcelamento,
  despesasPorCategoria,
  excluirLancamento,
  listarLancamentos,
  resumoDoMes,
  type DadosLancamento,
  type LancamentoComRelacoes,
} from "@/lib/core/repositories/transactions.repo";
import { escopoPronto } from "@/lib/core/firestore";
import { diaDeCalendario } from "@/lib/core/datas";
import { traduzirErro } from "@/lib/guardrails/transactions";
import { fail, failFromZod, mensagemDeErro, ok, type Result } from "@/lib/guardrails/result";

const Lancamento = z.object({
  description: z.string().min(1, "Informe a descrição."),
  amount: z.coerce.number().positive("O valor precisa ser maior que zero."),
  type: z.enum(["INCOME", "EXPENSE"]),
  status: z.enum(["PENDING", "COMPLETED"]).default("COMPLETED"),
  date: z.string().min(1, "Informe a data."),
  accountId: z.string().min(1, "Escolha a conta."),
  categoryId: z.string().min(1, "Escolha a categoria."),
  payee: z.string().optional().nullable(),
  tags: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
  isInstallment: z.coerce.boolean().default(false),
  /** Pedido de reembolso à empresa. Ausente no formulário = desmarcado. */
  reembolso: z.coerce.boolean().default(false),
  totalInstallments: z.coerce.number().min(1).optional().nullable(),
  receiptUrl: z.string().url().optional().nullable(),
  /** Identifica o envio: mesmo valor num reenvio acidental (Art. 2). */
  submissionId: z.string().min(8).optional(),
});

// --- leitura -----------------------------------------------------------------

export async function getTransactions(
  month?: number,
  year?: number,
  type?: string,
  categoryId?: string,
  limite?: number,
): Promise<LancamentoComRelacoes[]> {
  return listarLancamentos({ mes: month, ano: year, tipo: type, categoriaId: categoryId, limite });
}

export async function getMonthSummary(month: number, year: number) {
  return resumoDoMes(month, year);
}

export async function getMonthlyHistory(months = 6) {
  const agora = new Date();
  const meses = Array.from({ length: months }, (_, i) => {
    const d = new Date(agora.getFullYear(), agora.getMonth() - (months - 1 - i), 1);
    return { month: d.getMonth() + 1, year: d.getFullYear() };
  });

  // Em paralelo: antes eram 6 idas sequenciais, cada uma relendo tudo.
  const resumos = await Promise.all(meses.map((m) => resumoDoMes(m.month, m.year)));
  return meses.map((m, i) => ({ ...m, ...resumos[i] }));
}

export async function getForecastHistory(months = 3) {
  const agora = new Date();
  const meses = Array.from({ length: months }, (_, i) => {
    const d = new Date(agora.getFullYear(), agora.getMonth() + i + 1, 1);
    return { month: d.getMonth() + 1, year: d.getFullYear() };
  });

  const resumos = await Promise.all(meses.map((m) => resumoDoMes(m.month, m.year)));
  return meses.map((m, i) => ({ ...m, ...resumos[i] }));
}

export async function getExpensesByCategory(month: number, year: number) {
  return despesasPorCategoria({ mes: month, ano: year });
}

export async function getExpensesByCategoryYear(year: number) {
  return despesasPorCategoria({ ano: year });
}

// --- escrita -----------------------------------------------------------------

function extrair(formData: FormData) {
  const raw = Object.fromEntries(formData) as Record<string, unknown>;
  if (raw.isInstallment === "on") raw.isInstallment = "true";
  // Caixa desmarcada não é enviada pelo navegador — a ausência é o "false".
  raw.reembolso = raw.reembolso === "on" || raw.reembolso === "true" ? "true" : "";
  if (raw.receiptUrl === "") delete raw.receiptUrl;
  return raw;
}

function paraDados(d: z.infer<typeof Lancamento>): DadosLancamento {
  return {
    description: d.description,
    amount: d.amount,
    type: d.type,
    status: d.status,
    // Dia de calendário, não instante: gravado ao meio-dia UTC para que nenhum
    // fuso empurre o lançamento para o dia anterior (ver lib/core/datas.ts).
    date: diaDeCalendario(d.date),
    accountId: d.accountId,
    categoryId: d.categoryId,
    payee: d.payee ?? null,
    tags: d.tags ?? null,
    notes: d.notes ?? null,
    receiptUrl: d.receiptUrl ?? null,
    reembolso: d.reembolso,
  };
}

export async function createTransaction(formData: FormData): Promise<Result> {
  const parsed = Lancamento.safeParse(extrair(formData));
  if (!parsed.success) return failFromZod(parsed.error.flatten());

  const dados = paraDados(parsed.data);
  const idEnvio = parsed.data.submissionId ?? crypto.randomUUID();

  try {
    if (parsed.data.isInstallment && (parsed.data.totalInstallments ?? 0) > 1) {
      await criarParcelamento(dados, parsed.data.totalInstallments!, idEnvio);
    } else {
      await criarLancamento(dados, idEnvio);
    }
    revalidatePath("/");
    return ok();
  } catch (erro) {
    return fail(mensagemDeErro(traduzirErro(erro), "Não foi possível salvar o lançamento."));
  }
}

export async function updateTransaction(id: string, formData: FormData): Promise<Result> {
  const parsed = Lancamento.safeParse(extrair(formData));
  if (!parsed.success) return failFromZod(parsed.error.flatten());

  try {
    await atualizarLancamento(id, paraDados(parsed.data));
    revalidatePath("/");
    return ok();
  } catch (erro) {
    return fail(mensagemDeErro(traduzirErro(erro), "Não foi possível atualizar o lançamento."));
  }
}

export async function deleteTransaction(id: string): Promise<Result> {
  try {
    await excluirLancamento(id);
    revalidatePath("/");
    return ok();
  } catch (erro) {
    return fail(mensagemDeErro(traduzirErro(erro), "Não foi possível excluir o lançamento."));
  }
}

export async function toggleTransactionStatus(id: string): Promise<Result> {
  try {
    await alternarStatus(id);
    revalidatePath("/");
    return ok();
  } catch (erro) {
    return fail(mensagemDeErro(traduzirErro(erro), "Não foi possível alterar o status."));
  }
}

export async function attachReceipt(id: string, url: string): Promise<Result> {
  if (!/^https?:\/\//.test(url)) return fail("Endereço de recibo inválido.");

  try {
    const existente = await buscarLancamento(id);
    if (!existente) return fail("Lançamento não encontrado.");

    const esc = await escopoPronto();
    await esc.transactions.doc(id).update({ receiptUrl: url, updatedAt: new Date() });

    revalidatePath("/");
    return ok();
  } catch (erro) {
    return fail(mensagemDeErro(erro, "Não foi possível vincular o recibo."));
  }
}
