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
  listarSemelhantes,
  resumoDoMes,
  type DadosLancamento,
  type LancamentoComRelacoes,
} from "@/lib/core/repositories/transactions.repo";
import { listarContas } from "@/lib/core/repositories/accounts.repo";
import { listarCategorias } from "@/lib/core/repositories/categories.repo";
import { buscarPerfil } from "@/lib/core/repositories/users.repo";
import { escopoPronto, escopoProntoDe, type Escopo } from "@/lib/core/firestore";
import { requireActiveUser, requireAdmin } from "@/lib/auth";
import { diaDeCalendario } from "@/lib/core/datas";
import { ErroDeNegocio, traduzirErro } from "@/lib/guardrails/transactions";
import { fail, failFromZod, mensagemDeErro, ok, type Result } from "@/lib/guardrails/result";
import type { Account, AprovacaoStatus, Category } from "@/types";

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
  /** Em nome de quem o administrador está lançando (RF-64). Ausente = eu mesmo. */
  paraUid: z.string().optional(),
});

/**
 * De quem é a subcoleção que vai receber o lançamento (D18).
 *
 * Por padrão, a de quem está logado. O administrador pode apontar outra pessoa
 * ativa — e só ele: quem forjar o campo recebe recusa, não redirecionamento,
 * para que a tela mostre o motivo (Art. 5, RF-66).
 */
async function escopoParaLancar(
  paraUid: string | undefined,
): Promise<{ esc: Escopo; lancadoPor: DadosLancamento["lancadoPor"] }> {
  const usuario = await requireActiveUser();

  if (!paraUid || paraUid === usuario.uid) {
    return { esc: await escopoPronto(), lancadoPor: null };
  }

  if (usuario.role !== "ADMIN") {
    throw new ErroDeNegocio("Somente o administrador pode lançar em nome de outra pessoa.");
  }

  const [alvo, proprio] = await Promise.all([buscarPerfil(paraUid), buscarPerfil(usuario.uid)]);
  if (!alvo || alvo.status !== "ACTIVE") {
    throw new ErroDeNegocio("Essa pessoa não está ativa no sistema.");
  }

  return {
    esc: await escopoProntoDe(paraUid),
    lancadoPor: { uid: usuario.uid, nome: proprio?.name || usuario.email || "Administrador" },
  };
}

/**
 * Fora do `try` das actions de propósito: o `redirect()` de sessão expirada é
 * uma exceção que precisa subir até o Next, não virar mensagem de erro.
 */
async function resolverAlvo(
  paraUid: string | undefined,
): Promise<Result<Awaited<ReturnType<typeof escopoParaLancar>>>> {
  try {
    return ok(await escopoParaLancar(paraUid));
  } catch (erro) {
    if (erro instanceof ErroDeNegocio) return fail(erro.message);
    throw erro;
  }
}

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
  if (raw.paraUid === "") delete raw.paraUid;
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

  const idEnvio = parsed.data.submissionId ?? crypto.randomUUID();

  const alvo = await resolverAlvo(parsed.data.paraUid);
  if (!alvo.ok) return alvo;
  const { esc, lancadoPor } = alvo.data;
  const dados = { ...paraDados(parsed.data), lancadoPor };

  try {
    if (parsed.data.isInstallment && (parsed.data.totalInstallments ?? 0) > 1) {
      await criarParcelamento(dados, parsed.data.totalInstallments!, idEnvio, esc);
    } else {
      await criarLancamento(dados, idEnvio, esc);
    }
    revalidatePath("/");
    return ok();
  } catch (erro) {
    return fail(mensagemDeErro(traduzirErro(erro), "Não foi possível salvar o lançamento."));
  }
}

export type LancamentoSemelhante = {
  id: string;
  description: string;
  amount: number;
  /** Dia de calendário, "2026-11-03". */
  date: string;
  aprovacao: AprovacaoStatus | null;
  reembolso: boolean;
};

const Candidato = z.object({
  amount: z.coerce.number().positive(),
  date: z.string().min(1),
  paraUid: z.string().optional(),
});

/**
 * Antes de gravar: já existe lançamento gêmeo desta pessoa? (RF-70)
 *
 * É aviso, não bloqueio — a tela mostra os parecidos e pergunta. Usa o mesmo
 * escopo (e a mesma recusa) de `createTransaction`.
 */
export async function verificarDuplicidade(formData: FormData): Promise<Result<LancamentoSemelhante[]>> {
  const parsed = Candidato.safeParse(extrair(formData));
  if (!parsed.success) return ok([]); // o formulário incompleto é recusado no salvar, não aqui

  const alvo = await resolverAlvo(parsed.data.paraUid);
  if (!alvo.ok) return alvo;

  try {
    const gemeos = await listarSemelhantes(alvo.data.esc, {
      amount: parsed.data.amount,
      date: diaDeCalendario(parsed.data.date),
    });
    return ok(
      gemeos.map((g) => ({
        id: g.id,
        description: g.description,
        amount: g.amount,
        date: g.date.toISOString().slice(0, 10),
        aprovacao: g.aprovacao,
        reembolso: g.reembolso,
      })),
    );
  } catch (erro) {
    return fail(mensagemDeErro(traduzirErro(erro), "Não foi possível verificar duplicidade."));
  }
}

/**
 * Contas e categorias DA PESSOA escolhida no seletor "Lançar para" (RF-64).
 *
 * O lançamento vai viver na subcoleção dela, então precisa apontar para conta
 * e categoria dela — as do administrador seriam referências órfãs lá.
 */
export async function getContasECategoriasDe(
  uid: string,
): Promise<Result<{ accounts: Account[]; categories: Category[] }>> {
  await requireAdmin();
  if (!uid) return fail("Escolha a pessoa.");

  try {
    const esc = await escopoProntoDe(uid);
    const [accounts, categories] = await Promise.all([listarContas(esc), listarCategorias(undefined, esc)]);
    return ok({ accounts, categories });
  } catch (erro) {
    return fail(mensagemDeErro(erro, "Não foi possível carregar as contas dessa pessoa."));
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
