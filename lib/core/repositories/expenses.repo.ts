import "server-only";
import { adminDb } from "@/lib/firebase-admin";
import { numero, paraData, paraDataOuNulo, texto, textoOuNulo } from "@/lib/core/firestore";
import { emTransacao, ErroDeNegocio } from "@/lib/guardrails/transactions";
import { avaliarTransicao, podeEditar } from "@/lib/core/expense-status";
import type { Expense, ExpenseCategory, ExpenseStatus, PaymentBatch, UserRole } from "@/types";

/**
 * Despesas de ressarcimento.
 *
 * Coleção de TOPO com campo `userId`, não subcoleção do usuário: a consulta que
 * mais importa é a do administrador vendo todas as pendentes de toda a equipe.
 * Em subcoleção isso exigiria consulta de grupo e regra de segurança mais
 * frágil.
 */

const despesas = () => adminDb.collection("expenses");
const categorias = () => adminDb.collection("expenseCategories");
const lotes = () => adminDb.collection("paymentBatches");

function paraDespesa(id: string, d: Record<string, unknown>): Expense {
  return {
    id,
    userId: texto(d.userId),
    userName: texto(d.userName),
    amountCents: numero(d.amountCents),
    date: paraData(d.date),
    categoryId: texto(d.categoryId),
    description: texto(d.description),
    receiptPath: textoOuNulo(d.receiptPath),
    receiptUrl: textoOuNulo(d.receiptUrl),
    status: (texto(d.status, "RASCUNHO") as ExpenseStatus) ?? "RASCUNHO",
    rejectionReason: textoOuNulo(d.rejectionReason),
    approvedBy: textoOuNulo(d.approvedBy),
    approvedByName: textoOuNulo(d.approvedByName),
    approvedAt: paraDataOuNulo(d.approvedAt),
    paymentBatchId: textoOuNulo(d.paymentBatchId),
    reimbursedAt: paraDataOuNulo(d.reimbursedAt),
    createdAt: paraData(d.createdAt),
    updatedAt: paraData(d.updatedAt),
  };
}

// --- categorias corporativas -------------------------------------------------

const PADRAO = [
  { name: "Alimentação", icon: "🍽" },
  { name: "Transporte", icon: "🚕" },
  { name: "Estacionamento", icon: "🅿" },
  { name: "Pedágio", icon: "🛣" },
  { name: "Combustível", icon: "⛽" },
  { name: "Hospedagem", icon: "🏨" },
  { name: "Outros", icon: "📌" },
];

export async function listarCategoriasDespesa(incluirInativas = false): Promise<ExpenseCategory[]> {
  const snap = await categorias().get();

  if (snap.empty) {
    const lote = adminDb.batch();
    const agora = new Date();
    for (const c of PADRAO) {
      lote.set(categorias().doc(), { ...c, active: true, createdAt: agora });
    }
    await lote.commit();
    return listarCategoriasDespesa(incluirInativas);
  }

  return snap.docs
    .map((d) => ({
      id: d.id,
      name: texto(d.data().name),
      icon: texto(d.data().icon, "📌"),
      active: d.data().active !== false,
      createdAt: paraData(d.data().createdAt),
    }))
    .filter((c) => incluirInativas || c.active)
    .sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
}

export async function criarCategoriaDespesa(nome: string, icone: string): Promise<void> {
  await categorias().add({ name: nome, icon: icone, active: true, createdAt: new Date() });
}

/**
 * Desativa em vez de excluir.
 *
 * Excluir quebraria o histórico: relatórios de meses fechados passariam a
 * mostrar despesa sem categoria.
 */
export async function alternarCategoriaDespesa(id: string, ativa: boolean): Promise<void> {
  await categorias().doc(id).update({ active: ativa });
}

// --- consultas ---------------------------------------------------------------

export async function listarDespesasDoUsuario(
  userId: string,
  filtros?: { status?: ExpenseStatus; desde?: Date; ate?: Date },
): Promise<Expense[]> {
  let q = despesas().where("userId", "==", userId) as FirebaseFirestore.Query;
  if (filtros?.status) q = q.where("status", "==", filtros.status);
  if (filtros?.desde) q = q.where("date", ">=", filtros.desde);
  if (filtros?.ate) q = q.where("date", "<=", filtros.ate);

  const snap = await q.get();
  return snap.docs
    .map((d) => paraDespesa(d.id, d.data()))
    .sort((a, b) => b.date.getTime() - a.date.getTime());
}

/** Fila do administrador: o que está esperando decisão, de todo mundo. */
export async function listarDespesasPorStatus(status: ExpenseStatus): Promise<Expense[]> {
  const snap = await despesas().where("status", "==", status).get();
  return snap.docs
    .map((d) => paraDespesa(d.id, d.data()))
    .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
}

export async function listarDespesasParaRelatorio(filtros: {
  userId?: string;
  status?: ExpenseStatus;
  desde?: Date;
  ate?: Date;
}): Promise<Expense[]> {
  let q = despesas() as FirebaseFirestore.Query;
  if (filtros.userId) q = q.where("userId", "==", filtros.userId);
  if (filtros.status) q = q.where("status", "==", filtros.status);
  if (filtros.desde) q = q.where("date", ">=", filtros.desde);
  if (filtros.ate) q = q.where("date", "<=", filtros.ate);

  const snap = await q.get();
  return snap.docs
    .map((d) => paraDespesa(d.id, d.data()))
    .sort((a, b) => b.date.getTime() - a.date.getTime());
}

export async function buscarDespesa(id: string): Promise<Expense | null> {
  const doc = await despesas().doc(id).get();
  return doc.exists ? paraDespesa(doc.id, doc.data() ?? {}) : null;
}

export async function contarPorStatus(status: ExpenseStatus, userId?: string): Promise<number> {
  let q = despesas().where("status", "==", status) as FirebaseFirestore.Query;
  if (userId) q = q.where("userId", "==", userId);
  return (await q.count().get()).data().count;
}

// --- escrita -----------------------------------------------------------------

export type DadosDespesa = {
  amountCents: number;
  date: Date;
  categoryId: string;
  description: string;
  receiptPath?: string | null;
  receiptUrl?: string | null;
};

export async function criarDespesa(
  autor: { uid: string; nome: string },
  dados: DadosDespesa,
  enviarAgora: boolean,
  idEnvio: string,
): Promise<string> {
  const ref = despesas().doc(idEnvio);
  const agora = new Date();

  await emTransacao(async (t) => {
    t.create(ref, {
      userId: autor.uid,
      userName: autor.nome,
      amountCents: dados.amountCents,
      date: dados.date,
      categoryId: dados.categoryId,
      description: dados.description,
      receiptPath: dados.receiptPath ?? null,
      receiptUrl: dados.receiptUrl ?? null,
      status: enviarAgora ? "ENVIADA" : "RASCUNHO",
      rejectionReason: null,
      approvedBy: null,
      approvedByName: null,
      approvedAt: null,
      paymentBatchId: null,
      reimbursedAt: null,
      createdAt: agora,
      updatedAt: agora,
    });
  });

  return ref.id;
}

export async function atualizarDespesa(
  id: string,
  autorUid: string,
  dados: DadosDespesa,
): Promise<void> {
  await emTransacao(async (t) => {
    const snap = await t.get(despesas().doc(id));
    if (!snap.exists) throw new ErroDeNegocio("Despesa não encontrada.");

    const atual = paraDespesa(snap.id, snap.data() ?? {});
    if (atual.userId !== autorUid) throw new ErroDeNegocio("Esta despesa não é sua.");
    if (!podeEditar(atual.status)) {
      throw new ErroDeNegocio("Despesa já enviada não pode ser alterada.");
    }

    t.update(despesas().doc(id), {
      amountCents: dados.amountCents,
      date: dados.date,
      categoryId: dados.categoryId,
      description: dados.description,
      receiptPath: dados.receiptPath ?? atual.receiptPath,
      receiptUrl: dados.receiptUrl ?? atual.receiptUrl,
      updatedAt: new Date(),
    });
  });
}

export async function excluirDespesa(id: string, autorUid: string): Promise<void> {
  await emTransacao(async (t) => {
    const snap = await t.get(despesas().doc(id));
    if (!snap.exists) throw new ErroDeNegocio("Despesa não encontrada.");

    const atual = paraDespesa(snap.id, snap.data() ?? {});
    if (atual.userId !== autorUid) throw new ErroDeNegocio("Esta despesa não é sua.");
    if (!podeEditar(atual.status)) {
      throw new ErroDeNegocio("Despesa já enviada não pode ser excluída.");
    }

    t.delete(despesas().doc(id));
  });
}

/**
 * Muda o estado passando pela máquina — o único caminho.
 *
 * A validação acontece DENTRO da transação, com o estado lido ali mesmo. Ler
 * antes e decidir depois abriria janela para dois cliques aprovarem duas vezes.
 */
export async function transicionar(
  id: string,
  para: ExpenseStatus,
  ator: { uid: string; nome: string; papel: UserRole },
  extras?: { motivo?: string | null; viaLote?: boolean; paymentBatchId?: string },
): Promise<void> {
  await emTransacao(async (t) => {
    const ref = despesas().doc(id);
    const snap = await t.get(ref);
    if (!snap.exists) throw new ErroDeNegocio("Despesa não encontrada.");

    const atual = paraDespesa(snap.id, snap.data() ?? {});

    const veredito = avaliarTransicao(atual.status, para, {
      papel: ator.papel,
      ehDono: atual.userId === ator.uid,
      motivo: extras?.motivo,
      viaLote: extras?.viaLote,
    });

    if (!veredito.permitida) throw new ErroDeNegocio(veredito.motivo);

    const patch: Record<string, unknown> = { status: para, updatedAt: new Date() };

    if (para === "APROVADA") {
      patch.approvedBy = ator.uid;
      patch.approvedByName = ator.nome;
      patch.approvedAt = new Date();
      patch.rejectionReason = null;
    }
    if (para === "REJEITADA") {
      patch.rejectionReason = extras?.motivo ?? null;
    }
    if (para === "ENVIADA") {
      patch.rejectionReason = null;
    }
    if (para === "RESSARCIDA") {
      patch.paymentBatchId = extras?.paymentBatchId ?? null;
      patch.reimbursedAt = new Date();
    }

    t.update(ref, patch);
  });
}

// --- lotes de pagamento ------------------------------------------------------

function paraLote(id: string, d: Record<string, unknown>): PaymentBatch {
  return {
    id,
    userId: texto(d.userId),
    userName: texto(d.userName),
    periodStart: paraData(d.periodStart),
    periodEnd: paraData(d.periodEnd),
    totalCents: numero(d.totalCents),
    expenseCount: numero(d.expenseCount),
    status: texto(d.status, "ABERTO") === "PAGO" ? "PAGO" : "ABERTO",
    paidAt: paraDataOuNulo(d.paidAt),
    createdBy: texto(d.createdBy),
    createdAt: paraData(d.createdAt),
  };
}

export async function listarLotes(userId?: string): Promise<PaymentBatch[]> {
  let q = lotes() as FirebaseFirestore.Query;
  if (userId) q = q.where("userId", "==", userId);
  const snap = await q.get();
  return snap.docs
    .map((d) => paraLote(d.id, d.data()))
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
}

/** Prévia do fechamento: quanto e quantas, sem escrever nada (Art. 1). */
export async function previaDeFechamento(userId: string, desde: Date, ate: Date) {
  const snap = await despesas()
    .where("userId", "==", userId)
    .where("status", "==", "APROVADA")
    .get();

  const elegiveis = snap.docs
    .map((d) => paraDespesa(d.id, d.data()))
    .filter((e) => e.date >= desde && e.date <= ate);

  return {
    despesas: elegiveis,
    totalCents: elegiveis.reduce((s, e) => s + e.amountCents, 0),
    quantidade: elegiveis.length,
  };
}

/**
 * Fecha o lote: cria o registro e marca TODAS as despesas de uma vez.
 *
 * Um `writeBatch` só. Em laço sequencial, uma falha no meio deixaria metade da
 * equipe paga e metade não — com o dinheiro já saindo (Art. 2).
 */
export async function fecharLote(
  ator: { uid: string; nome: string },
  alvo: { userId: string; userName: string },
  periodo: { desde: Date; ate: Date },
): Promise<{ loteId: string; quantidade: number; totalCents: number }> {
  const previa = await previaDeFechamento(alvo.userId, periodo.desde, periodo.ate);

  if (previa.quantidade === 0) {
    throw new ErroDeNegocio("Não há despesas aprovadas nesse período para essa pessoa.");
  }
  if (previa.quantidade > 400) {
    throw new ErroDeNegocio("Período grande demais para um lote. Feche em intervalos menores.");
  }

  const loteRef = lotes().doc();
  const agora = new Date();
  const lote = adminDb.batch();

  lote.set(loteRef, {
    userId: alvo.userId,
    userName: alvo.userName,
    periodStart: periodo.desde,
    periodEnd: periodo.ate,
    totalCents: previa.totalCents,
    expenseCount: previa.quantidade,
    status: "PAGO",
    paidAt: agora,
    createdBy: ator.uid,
    createdAt: agora,
  });

  for (const despesa of previa.despesas) {
    lote.update(despesas().doc(despesa.id), {
      status: "RESSARCIDA",
      paymentBatchId: loteRef.id,
      reimbursedAt: agora,
      updatedAt: agora,
    });
  }

  await lote.commit();

  return { loteId: loteRef.id, quantidade: previa.quantidade, totalCents: previa.totalCents };
}
