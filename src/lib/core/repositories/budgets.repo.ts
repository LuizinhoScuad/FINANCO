import "server-only";
import { escopoPronto, numero, paraData, texto } from "@/lib/core/firestore";
import { emTransacao, ErroDeNegocio } from "@/lib/guardrails/transactions";
import { getMonthRange } from "@/lib/utils";
import type { Budget, Category } from "@/types";

export type OrcamentoComGasto = Budget & {
  category: Category;
  spent: number;
  limit: number;
};

/**
 * Categoria de reposição para orçamento cuja categoria sumiu.
 *
 * Excluir categoria já leva os orçamentos junto, então isto só aparece com dado
 * herdado do modelo antigo. Mostrar o registro marcado é melhor que escondê-lo:
 * o valor existe e o Guardião vai apontá-lo (Art. 3).
 */
const CATEGORIA_ORFA: Category = {
  id: "",
  name: "(categoria removida)",
  icon: "❓",
  type: "EXPENSE",
  color: "#6b7a99",
  createdAt: new Date(0),
};

function paraOrcamento(id: string, d: Record<string, unknown>): Budget {
  return {
    id,
    categoryId: texto(d.categoryId),
    amount: numero(d.amount),
    month: numero(d.month, 1),
    year: numero(d.year, new Date().getFullYear()),
    createdAt: paraData(d.createdAt),
  };
}

export async function listarOrcamentos(mes: number, ano: number): Promise<OrcamentoComGasto[]> {
  const esc = await escopoPronto();
  const { start, end } = getMonthRange(mes, ano);

  const [orcamentos, gastos, categorias] = await Promise.all([
    esc.budgets.where("month", "==", mes).where("year", "==", ano).get(),
    esc.transactions
      .where("type", "==", "EXPENSE")
      .where("date", ">=", start)
      .where("date", "<=", end)
      .get(),
    esc.categories.get(),
  ]);

  const gastoPorCategoria = new Map<string, number>();
  for (const doc of gastos.docs) {
    const d = doc.data();
    const cid = texto(d.categoryId);
    gastoPorCategoria.set(cid, (gastoPorCategoria.get(cid) ?? 0) + numero(d.amount));
  }

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

  return orcamentos.docs.map((doc) => {
    const b = paraOrcamento(doc.id, doc.data());
    return {
      ...b,
      category: mapaCategorias.get(b.categoryId) ?? CATEGORIA_ORFA,
      spent: gastoPorCategoria.get(b.categoryId) ?? 0,
      limit: b.amount,
    };
  });
}

/**
 * Cria ou atualiza o orçamento da categoria no mês.
 *
 * Atômico de propósito: a versão anterior lia todos os orçamentos, procurava e
 * decidia criar ou atualizar. Duas abas salvando ao mesmo tempo criavam dois
 * orçamentos para a mesma categoria e mês — e o painel passava a somar em dobro.
 */
export async function salvarOrcamento(dados: {
  categoryId: string;
  amount: number;
  month: number;
  year: number;
}): Promise<void> {
  const esc = await escopoPronto();

  await emTransacao(async (t) => {
    const existentes = await t.get(
      esc.budgets
        .where("categoryId", "==", dados.categoryId)
        .where("month", "==", dados.month)
        .where("year", "==", dados.year),
    );

    if (existentes.empty) {
      t.create(esc.budgets.doc(), { ...dados, createdAt: new Date() });
      return;
    }

    // Atualiza o primeiro e remove eventuais duplicatas herdadas do modelo antigo.
    const [principal, ...duplicatas] = existentes.docs;
    t.update(principal.ref, { amount: dados.amount });
    for (const d of duplicatas) t.delete(d.ref);
  });
}

export async function excluirOrcamento(id: string): Promise<void> {
  const esc = await escopoPronto();
  const ref = esc.budgets.doc(id);
  if (!(await ref.get()).exists) throw new ErroDeNegocio("Orçamento não encontrado.");
  await ref.delete();
}
