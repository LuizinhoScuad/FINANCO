import "server-only";
import { escopoPronto, numero, paraData, texto, textoOuNulo, type Escopo } from "@/lib/core/firestore";
import { deltaDeSaldo } from "@/lib/core/money";
import {
  ajustarSaldoEmTransacao,
  lerContaEmTransacao,
} from "@/lib/core/repositories/accounts.repo";
import { criarUnico, emTransacao, ErroDeNegocio } from "@/lib/guardrails/transactions";
import { getMonthRange } from "@/lib/utils";
import type { Account, Category, Transaction as Lancamento } from "@/types";

export type LancamentoComRelacoes = Lancamento & { account: Account; category: Category };

export type DadosLancamento = {
  description: string;
  amount: number;
  type: string;
  status: string;
  date: Date;
  accountId: string;
  categoryId: string;
  payee?: string | null;
  tags?: string | null;
  notes?: string | null;
  receiptUrl?: string | null;
};

function paraLancamento(id: string, d: Record<string, unknown>): Lancamento {
  return {
    id,
    description: texto(d.description),
    amount: numero(d.amount),
    type: texto(d.type),
    status: texto(d.status, "COMPLETED"),
    date: paraData(d.date),
    accountId: texto(d.accountId),
    categoryId: texto(d.categoryId),
    payee: textoOuNulo(d.payee),
    tags: textoOuNulo(d.tags),
    isInstallment: Boolean(d.isInstallment),
    installment: d.installment == null ? null : numero(d.installment),
    totalInstallments: d.totalInstallments == null ? null : numero(d.totalInstallments),
    notes: textoOuNulo(d.notes),
    receiptUrl: textoOuNulo(d.receiptUrl),
    createdAt: paraData(d.createdAt),
    updatedAt: paraData(d.updatedAt),
  };
}

// --- leitura -----------------------------------------------------------------

/**
 * Consulta com filtro NO BANCO, não em memória.
 *
 * A versão anterior baixava a coleção inteira e filtrava em JavaScript — e o
 * painel repetia isso nove vezes para montar o histórico. Os índices compostos
 * em `firestore.indexes.json` já existiam e não eram usados por ninguém.
 */
export async function listarLancamentos(filtros?: {
  mes?: number;
  ano?: number;
  tipo?: string;
  categoriaId?: string;
  limite?: number;
}): Promise<LancamentoComRelacoes[]> {
  const esc = await escopoPronto();

  let consulta = esc.transactions as FirebaseFirestore.Query;

  if (filtros?.mes && filtros?.ano) {
    const { start, end } = getMonthRange(filtros.mes, filtros.ano);
    consulta = consulta.where("date", ">=", start).where("date", "<=", end);
  }
  if (filtros?.tipo === "INCOME" || filtros?.tipo === "EXPENSE") {
    consulta = consulta.where("type", "==", filtros.tipo);
  }
  if (filtros?.categoriaId) {
    consulta = consulta.where("categoryId", "==", filtros.categoriaId);
  }

  consulta = consulta.orderBy("date", "desc");
  if (filtros?.limite) consulta = consulta.limit(filtros.limite);

  const snap = await consulta.get();
  const lancamentos = snap.docs.map((d) => paraLancamento(d.id, d.data()));

  return vincularRelacoes(esc, lancamentos);
}

/** Junta conta e categoria. Duas leituras no total, não uma por lançamento. */
async function vincularRelacoes(
  esc: Escopo,
  lancamentos: Lancamento[],
): Promise<LancamentoComRelacoes[]> {
  if (lancamentos.length === 0) return [];

  const [contas, categorias] = await Promise.all([esc.accounts.get(), esc.categories.get()]);

  const mapaContas = new Map(
    contas.docs.map((d) => [
      d.id,
      {
        id: d.id,
        name: texto(d.data().name),
        type: texto(d.data().type, "CASH"),
        color: texto(d.data().color, "#00d98b"),
        balance: numero(d.data().balance),
        createdAt: paraData(d.data().createdAt),
        updatedAt: paraData(d.data().updatedAt),
      } as Account,
    ]),
  );

  const mapaCategorias = new Map(
    categorias.docs.map((d) => [
      d.id,
      {
        id: d.id,
        name: texto(d.data().name),
        icon: texto(d.data().icon, "📁"),
        type: texto(d.data().type),
        color: texto(d.data().color, "#00d98b"),
        createdAt: paraData(d.data().createdAt),
      } as Category,
    ]),
  );

  const contaOrfa: Account = {
    id: "",
    name: "(conta removida)",
    type: "CASH",
    color: "#6b7a99",
    balance: 0,
    createdAt: new Date(0),
    updatedAt: new Date(0),
  };
  const categoriaOrfa: Category = {
    id: "",
    name: "(categoria removida)",
    icon: "❓",
    type: "",
    color: "#6b7a99",
    createdAt: new Date(0),
  };

  return lancamentos.map((l) => ({
    ...l,
    account: mapaContas.get(l.accountId) ?? contaOrfa,
    category: mapaCategorias.get(l.categoryId) ?? categoriaOrfa,
  }));
}

export async function buscarLancamento(id: string): Promise<Lancamento | null> {
  const esc = await escopoPronto();
  const doc = await esc.transactions.doc(id).get();
  return doc.exists ? paraLancamento(doc.id, doc.data() ?? {}) : null;
}

// --- escrita atômica ---------------------------------------------------------

function paraGravacao(d: DadosLancamento, extras: Record<string, unknown> = {}) {
  const agora = new Date();
  return {
    description: d.description,
    amount: d.amount,
    type: d.type,
    status: d.status,
    date: d.date,
    accountId: d.accountId,
    categoryId: d.categoryId,
    payee: d.payee ?? null,
    tags: d.tags ?? null,
    notes: d.notes ?? null,
    receiptUrl: d.receiptUrl ?? null,
    createdAt: agora,
    updatedAt: agora,
    ...extras,
  };
}

/**
 * Cria o lançamento e ajusta o saldo NA MESMA operação.
 *
 * `idEnvio` vem do formulário e é o mesmo em um reenvio acidental (duplo
 * clique): o identificador do documento é derivado dele, então a segunda
 * tentativa é recusada em vez de duplicar lançamento e saldo.
 */
export async function criarLancamento(dados: DadosLancamento, idEnvio: string): Promise<void> {
  const esc = await escopoPronto();

  await emTransacao(async (t) => {
    await lerContaEmTransacao(t, esc, dados.accountId);

    criarUnico(t, esc.transactions.doc(idEnvio), paraGravacao(dados, { isInstallment: false }));

    if (dados.status === "COMPLETED") {
      ajustarSaldoEmTransacao(t, esc, dados.accountId, deltaDeSaldo(dados.type, dados.amount));
    }
  });
}

/**
 * Cria todas as parcelas de uma vez.
 *
 * Antes era um laço sequencial: interrupção no meio deixava parcelas faltando e
 * o saldo pela metade. Agora é uma transação só — todas as parcelas ou nenhuma.
 */
export async function criarParcelamento(
  dados: DadosLancamento,
  parcelas: number,
  idEnvio: string,
): Promise<void> {
  if (parcelas < 2 || parcelas > 72) {
    throw new ErroDeNegocio("A quantidade de parcelas deve ficar entre 2 e 72.");
  }

  const esc = await escopoPronto();

  await emTransacao(async (t) => {
    await lerContaEmTransacao(t, esc, dados.accountId);

    for (let i = 1; i <= parcelas; i++) {
      const data = new Date(dados.date);
      data.setMonth(dados.date.getMonth() + (i - 1));

      criarUnico(
        t,
        esc.transactions.doc(`${idEnvio}-${i}`),
        paraGravacao(
          { ...dados, date: data },
          { isInstallment: true, installment: i, totalInstallments: parcelas, installmentGroupId: idEnvio },
        ),
      );
    }

    if (dados.status === "COMPLETED") {
      const total = deltaDeSaldo(dados.type, dados.amount) * parcelas;
      ajustarSaldoEmTransacao(t, esc, dados.accountId, total);
    }
  });
}

/**
 * Atualiza o lançamento revertendo o efeito antigo e aplicando o novo — junto.
 *
 * Este era o trecho mais perigoso do sistema: três escritas soltas, e falhar
 * entre a primeira e a terceira corrompia o saldo para sempre.
 */
export async function atualizarLancamento(id: string, dados: DadosLancamento): Promise<void> {
  const esc = await escopoPronto();

  await emTransacao(async (t) => {
    // Todas as leituras primeiro — exigência do Firestore.
    const ref = esc.transactions.doc(id);
    const atual = await t.get(ref);
    if (!atual.exists) throw new ErroDeNegocio("Lançamento não encontrado.");

    const anterior = paraLancamento(atual.id, atual.data() ?? {});
    await lerContaEmTransacao(t, esc, dados.accountId);
    if (anterior.accountId !== dados.accountId) {
      await lerContaEmTransacao(t, esc, anterior.accountId);
    }

    // Agora as escritas.
    if (anterior.status === "COMPLETED") {
      ajustarSaldoEmTransacao(t, esc, anterior.accountId, -deltaDeSaldo(anterior.type, anterior.amount));
    }

    t.update(ref, {
      ...paraGravacao(dados),
      createdAt: anterior.createdAt, // preserva a criação original
      updatedAt: new Date(),
    });

    if (dados.status === "COMPLETED") {
      ajustarSaldoEmTransacao(t, esc, dados.accountId, deltaDeSaldo(dados.type, dados.amount));
    }
  });
}

export async function excluirLancamento(id: string): Promise<void> {
  const esc = await escopoPronto();

  await emTransacao(async (t) => {
    const ref = esc.transactions.doc(id);
    const atual = await t.get(ref);
    if (!atual.exists) throw new ErroDeNegocio("Lançamento não encontrado.");

    const l = paraLancamento(atual.id, atual.data() ?? {});
    const contaExiste = (await t.get(esc.accounts.doc(l.accountId))).exists;

    if (l.status === "COMPLETED" && contaExiste) {
      ajustarSaldoEmTransacao(t, esc, l.accountId, -deltaDeSaldo(l.type, l.amount));
    }

    t.delete(ref);
  });
}

/** Alterna entre pago e pendente, refletindo no saldo — sem brecha de duplo clique. */
export async function alternarStatus(id: string): Promise<string> {
  const esc = await escopoPronto();

  return emTransacao(async (t) => {
    const ref = esc.transactions.doc(id);
    const atual = await t.get(ref);
    if (!atual.exists) throw new ErroDeNegocio("Lançamento não encontrado.");

    const l = paraLancamento(atual.id, atual.data() ?? {});
    await lerContaEmTransacao(t, esc, l.accountId);

    const novo = l.status === "COMPLETED" ? "PENDING" : "COMPLETED";
    const delta = deltaDeSaldo(l.type, l.amount);

    t.update(ref, { status: novo, updatedAt: new Date() });
    ajustarSaldoEmTransacao(t, esc, l.accountId, novo === "COMPLETED" ? delta : -delta);

    return novo;
  });
}

// --- agregações --------------------------------------------------------------

export async function resumoDoMes(mes: number, ano: number) {
  const lancamentos = await listarLancamentos({ mes, ano });
  const efetivados = lancamentos.filter((l) => l.status === "COMPLETED");

  const receita = efetivados.filter((l) => l.type === "INCOME").reduce((s, l) => s + l.amount, 0);
  const despesa = efetivados.filter((l) => l.type === "EXPENSE").reduce((s, l) => s + l.amount, 0);

  return { income: receita, expense: despesa, balance: receita - despesa };
}

export async function despesasPorCategoria(filtros: { mes?: number; ano: number }) {
  const esc = await escopoPronto();

  const inicio = filtros.mes
    ? getMonthRange(filtros.mes, filtros.ano).start
    : new Date(filtros.ano, 0, 1);
  const fim = filtros.mes
    ? getMonthRange(filtros.mes, filtros.ano).end
    : new Date(filtros.ano, 11, 31, 23, 59, 59);

  const [snap, categorias] = await Promise.all([
    esc.transactions.where("type", "==", "EXPENSE").where("date", ">=", inicio).where("date", "<=", fim).get(),
    esc.categories.get(),
  ]);

  const mapaCategorias = new Map(
    categorias.docs.map((d) => [d.id, { name: texto(d.data().name), color: texto(d.data().color, "#00d98b") }]),
  );

  const totais = new Map<string, { name: string; color: string; total: number }>();
  for (const doc of snap.docs) {
    const d = doc.data();
    const cat = mapaCategorias.get(texto(d.categoryId));
    if (!cat) continue;
    const atual = totais.get(texto(d.categoryId)) ?? { ...cat, total: 0 };
    atual.total += numero(d.amount);
    totais.set(texto(d.categoryId), atual);
  }

  return Array.from(totais.values()).sort((a, b) => b.total - a.total);
}
