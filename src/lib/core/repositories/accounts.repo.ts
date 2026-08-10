import "server-only";
import type { Transaction } from "firebase-admin/firestore";
import { escopoPronto, numero, paraData, texto, type Escopo } from "@/lib/core/firestore";
import { ajusteDeSaldo, ErroDeNegocio } from "@/lib/guardrails/transactions";
import type { Account } from "@/types";

function paraConta(id: string, d: Record<string, unknown>): Account {
  return {
    id,
    name: texto(d.name),
    type: texto(d.type, "CASH"),
    color: texto(d.color, "#00d98b"),
    balance: numero(d.balance),
    createdAt: paraData(d.createdAt),
    updatedAt: paraData(d.updatedAt),
  };
}

export async function listarContas(): Promise<Account[]> {
  const esc = await escopoPronto();
  const snap = await esc.accounts.orderBy("createdAt", "asc").get();
  return snap.docs.map((d) => paraConta(d.id, d.data()));
}

export async function saldoTotal(): Promise<number> {
  const contas = await listarContas();
  return contas.reduce((soma, c) => soma + c.balance, 0);
}

export async function criarConta(dados: {
  name: string;
  type: string;
  color: string;
  balance: number;
}): Promise<Account> {
  const esc = await escopoPronto();
  const agora = new Date();
  const ref = await esc.accounts.add({ ...dados, createdAt: agora, updatedAt: agora });
  return paraConta(ref.id, { ...dados, createdAt: agora, updatedAt: agora });
}

export async function atualizarConta(
  id: string,
  dados: { name: string; type: string; color: string; balance: number },
): Promise<void> {
  const esc = await escopoPronto();
  const ref = esc.accounts.doc(id);
  if (!(await ref.get()).exists) throw new ErroDeNegocio("Conta não encontrada.");
  await ref.update({ ...dados, updatedAt: new Date() });
}

/** Quantos lançamentos serão apagados junto — para avisar ANTES (Art. 1). */
export async function impactoDeExcluirConta(id: string): Promise<number> {
  const esc = await escopoPronto();
  const snap = await esc.transactions.where("accountId", "==", id).count().get();
  return snap.data().count;
}

/**
 * Exclui a conta e seus lançamentos.
 *
 * O `batch` garante tudo-ou-nada: não existe estado em que a conta sumiu mas os
 * lançamentos ficaram órfãos, apontando para algo que não existe mais.
 */
export async function excluirConta(id: string): Promise<void> {
  const esc = await escopoPronto();
  const ref = esc.accounts.doc(id);
  if (!(await ref.get()).exists) throw new ErroDeNegocio("Conta não encontrada.");

  const lancamentos = await esc.transactions.where("accountId", "==", id).get();

  // Limite do Firestore: 500 escritas por lote.
  const docs = lancamentos.docs;
  for (let i = 0; i < docs.length; i += 400) {
    const lote = esc.accounts.firestore.batch();
    for (const d of docs.slice(i, i + 400)) lote.delete(d.ref);
    await lote.commit();
  }

  await ref.delete();
}

// --- usados dentro de transações atômicas ------------------------------------

/** Confere que a conta existe. Leitura — precisa vir antes de qualquer escrita. */
export async function lerContaEmTransacao(t: Transaction, esc: Escopo, id: string) {
  const snap = await t.get(esc.accounts.doc(id));
  if (!snap.exists) throw new ErroDeNegocio("Conta não encontrada.");
  return snap;
}

export function ajustarSaldoEmTransacao(t: Transaction, esc: Escopo, id: string, delta: number) {
  if (delta === 0) return;
  t.update(esc.accounts.doc(id), { balance: ajusteDeSaldo(delta), updatedAt: new Date() });
}
