import "server-only";
import { escopoPronto } from "@/lib/core/firestore";

/**
 * Cópia completa dos dados do usuário — usada pela exportação e como rede de
 * segurança antes de operação destrutiva (Art. 1).
 */
export type Snapshot = {
  exportedAt: string;
  versao: 2;
  accounts: Record<string, unknown>[];
  categories: Record<string, unknown>[];
  budgets: Record<string, unknown>[];
  transactions: Record<string, unknown>[];
};

/** Datas viram texto ISO para sobreviver ao JSON e voltarem reconhecíveis. */
function serializar(valor: unknown): unknown {
  if (valor === null || valor === undefined) return null;
  if (valor instanceof Date) return valor.toISOString();
  if (typeof valor === "object" && valor !== null && "toDate" in valor) {
    const t = valor as { toDate: () => Date };
    if (typeof t.toDate === "function") return t.toDate().toISOString();
  }
  return valor;
}

function serializarDoc(id: string, dados: Record<string, unknown>) {
  const saida: Record<string, unknown> = { id };
  for (const [chave, valor] of Object.entries(dados)) saida[chave] = serializar(valor);
  return saida;
}

export async function gerarSnapshot(): Promise<Snapshot> {
  const esc = await escopoPronto();

  const [contas, categorias, orcamentos, lancamentos] = await Promise.all([
    esc.accounts.get(),
    esc.categories.get(),
    esc.budgets.get(),
    esc.transactions.get(),
  ]);

  return {
    exportedAt: new Date().toISOString(),
    versao: 2,
    accounts: contas.docs.map((d) => serializarDoc(d.id, d.data())),
    categories: categorias.docs.map((d) => serializarDoc(d.id, d.data())),
    budgets: orcamentos.docs.map((d) => serializarDoc(d.id, d.data())),
    transactions: lancamentos.docs.map((d) => serializarDoc(d.id, d.data())),
  };
}

/** Contagens para mostrar o impacto de uma restauração ANTES de executá-la. */
export async function contarRegistros() {
  const esc = await escopoPronto();
  const [contas, categorias, orcamentos, lancamentos] = await Promise.all([
    esc.accounts.count().get(),
    esc.categories.count().get(),
    esc.budgets.count().get(),
    esc.transactions.count().get(),
  ]);

  return {
    accounts: contas.data().count,
    categories: categorias.data().count,
    budgets: orcamentos.data().count,
    transactions: lancamentos.data().count,
  };
}
