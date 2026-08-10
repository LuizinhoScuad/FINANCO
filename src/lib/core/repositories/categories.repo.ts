import "server-only";
import { escopoPronto, paraData, texto } from "@/lib/core/firestore";
import { ErroDeNegocio } from "@/lib/guardrails/transactions";
import type { Category } from "@/types";

function paraCategoria(id: string, d: Record<string, unknown>): Category {
  return {
    id,
    name: texto(d.name),
    icon: texto(d.icon, "📁"),
    type: texto(d.type),
    color: texto(d.color, "#00d98b"),
    createdAt: paraData(d.createdAt),
  };
}

export async function listarCategorias(tipo?: "INCOME" | "EXPENSE"): Promise<Category[]> {
  const esc = await escopoPronto();
  const consulta = tipo ? esc.categories.where("type", "==", tipo) : esc.categories;
  const snap = await consulta.get();

  // Ordenação em memória por ser lista pequena (14 no padrão) e para não exigir
  // índice composto só por causa do nome.
  return snap.docs
    .map((d) => paraCategoria(d.id, d.data()))
    .sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
}

export async function criarCategoria(dados: {
  name: string;
  icon: string;
  type: string;
  color: string;
}): Promise<Category> {
  const esc = await escopoPronto();
  const agora = new Date();
  const ref = await esc.categories.add({ ...dados, createdAt: agora });
  return paraCategoria(ref.id, { ...dados, createdAt: agora });
}

export async function atualizarCategoria(
  id: string,
  dados: { name: string; icon: string; type: string; color: string },
): Promise<void> {
  const esc = await escopoPronto();
  const ref = esc.categories.doc(id);
  if (!(await ref.get()).exists) throw new ErroDeNegocio("Categoria não encontrada.");
  await ref.update(dados);
}

/**
 * Exclui a categoria — e recusa se houver histórico apontando para ela.
 *
 * Deixar excluir transformaria lançamentos antigos em órfãos e quebraria os
 * relatórios retroativos.
 */
export async function excluirCategoria(id: string): Promise<void> {
  const esc = await escopoPronto();

  const emUso = await esc.transactions.where("categoryId", "==", id).limit(1).get();
  if (!emUso.empty) {
    throw new ErroDeNegocio("Esta categoria tem lançamentos e não pode ser excluída.");
  }

  const ref = esc.categories.doc(id);
  if (!(await ref.get()).exists) throw new ErroDeNegocio("Categoria não encontrada.");

  // Os orçamentos que apontam para ela perdem o sentido: vão junto.
  const orcamentos = await esc.budgets.where("categoryId", "==", id).get();
  const lote = esc.categories.firestore.batch();
  for (const d of orcamentos.docs) lote.delete(d.ref);
  lote.delete(ref);
  await lote.commit();
}
