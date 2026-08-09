import "server-only";
import { adminDb } from "@/lib/firebase-admin";
import {
  escopoDe,
  escopoPronto,
  numero,
  paraData,
  paraDataOuNulo,
  texto,
  textoOuNulo,
  type Escopo,
} from "@/lib/core/firestore";
import { deltaDeSaldo } from "@/lib/core/money";
import {
  ajustarSaldoEmTransacao,
  lerContaEmTransacao,
} from "@/lib/core/repositories/accounts.repo";
import { criarUnico, emTransacao, ErroDeNegocio } from "@/lib/guardrails/transactions";
import { avaliarTransicao, podeEditar, podeExcluir } from "@/lib/core/aprovacao";
import { paraCentavos } from "@/lib/core/money";
import { getMonthRange } from "@/lib/utils";
import type {
  Account,
  AprovacaoStatus,
  Category,
  PaymentBatch,
  PedidoDeReembolso,
  Transaction as Lancamento,
  UserRole,
} from "@/types";

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
  /** Pedido de reembolso à empresa. Falso é lançamento particular. */
  reembolso?: boolean;
};

/**
 * Situação do pedido gravada no documento.
 *
 * Lançamento antigo não tem o campo — e é isso que queremos: o que já existia
 * antes desta funcionalidade continua sendo particular, sem migração de dados
 * (Art. 10). Quem quiser transformar um antigo em pedido, edita e marca.
 */
function paraAprovacao(v: unknown): AprovacaoStatus | null {
  const s = texto(v, "");
  return s === "ENVIADA" || s === "APROVADA" || s === "REJEITADA" || s === "RESSARCIDA" ? s : null;
}

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
    reembolso: d.reembolso === true,
    aprovacao: paraAprovacao(d.aprovacao),
    rejectionReason: textoOuNulo(d.rejectionReason),
    approvedBy: textoOuNulo(d.approvedBy),
    approvedByName: textoOuNulo(d.approvedByName),
    approvedAt: paraDataOuNulo(d.approvedAt),
    paymentBatchId: textoOuNulo(d.paymentBatchId),
    reimbursedAt: paraDataOuNulo(d.reimbursedAt),
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
    reembolso: d.reembolso === true,
    createdAt: agora,
    updatedAt: agora,
    ...extras,
  };
}

/**
 * Para onde vai a situação quando o dono edita o lançamento.
 *
 * Corrigir um pedido rejeitado é o próprio reenvio — volta para a fila com o
 * motivo antigo apagado. Desmarcar o reembolso devolve o lançamento à vida
 * particular e limpa todo o rastro de decisão.
 */
function aprovacaoDepoisDaEdicao(anterior: AprovacaoStatus | null, reembolso: boolean) {
  if (!reembolso) return aprovacaoInicial(false);
  if (anterior === "REJEITADA" || anterior === null) return aprovacaoInicial(true);
  return {}; // segue ENVIADA, sem tocar no que já existe
}

/** Campos de aprovação de um pedido recém-nascido, ou de um lançamento particular. */
function aprovacaoInicial(reembolso: boolean) {
  return {
    aprovacao: reembolso ? "ENVIADA" : null,
    rejectionReason: null,
    approvedBy: null,
    approvedByName: null,
    approvedAt: null,
    paymentBatchId: null,
    reimbursedAt: null,
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

    criarUnico(
      t,
      esc.transactions.doc(idEnvio),
      paraGravacao(dados, { isInstallment: false, ...aprovacaoInicial(dados.reembolso === true) }),
    );

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
          {
            isInstallment: true,
            installment: i,
            totalInstallments: parcelas,
            installmentGroupId: idEnvio,
            ...aprovacaoInicial(dados.reembolso === true),
          },
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

    // Pedido já decidido é lastro de pagamento: ninguém mexe (Art. 2).
    if (!podeEditar(anterior.aprovacao)) {
      throw new ErroDeNegocio(
        anterior.aprovacao === "RESSARCIDA"
          ? "Este pedido já foi atendido e não pode mais ser alterado."
          : "Este pedido já foi aprovado e não pode mais ser alterado.",
      );
    }

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
      ...aprovacaoDepoisDaEdicao(anterior.aprovacao, dados.reembolso === true),
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

    if (!podeExcluir(l.aprovacao)) {
      throw new ErroDeNegocio(
        l.aprovacao === "RESSARCIDA"
          ? "Este pedido já foi atendido e não pode ser excluído."
          : "Este pedido já foi aprovado e não pode ser excluído.",
      );
    }

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

// --- pedidos de reembolso ----------------------------------------------------

/**
 * Os pedidos vivem na MESMA subcoleção dos lançamentos — não numa coleção
 * separada.
 *
 * Foi uma escolha: manter um caminho único de lançamento significa que o pedido
 * é um lançamento com uma marca, não outro tipo de registro. A consulta do
 * gestor, que precisa cruzar todo mundo, usa `collectionGroup` — mais índice,
 * porém zero migração de dado existente (Art. 10).
 */
const grupoLancamentos = () => adminDb.collectionGroup("transactions");

/** O uid é o dono da subcoleção: `users/{uid}/transactions/{id}`. */
function donoDe(doc: FirebaseFirestore.QueryDocumentSnapshot): string {
  return doc.ref.parent.parent?.id ?? "";
}

export type FiltroDeReembolso = {
  userId?: string;
  situacao?: AprovacaoStatus;
  desde?: Date;
  ate?: Date;
};

/** Nome de conta e categoria de cada dono, resolvidos uma vez por pessoa. */
async function nomesDoEscopo(uid: string) {
  const esc = escopoDe(uid);
  const [contas, categorias] = await Promise.all([esc.accounts.get(), esc.categories.get()]);
  return {
    contas: new Map(contas.docs.map((d) => [d.id, texto(d.data().name, "(conta removida)")])),
    categorias: new Map(categorias.docs.map((d) => [d.id, texto(d.data().name, "(categoria removida)")])),
  };
}

async function montarPedidos(
  docs: FirebaseFirestore.QueryDocumentSnapshot[],
  nomeDoUsuario: (uid: string) => string,
): Promise<PedidoDeReembolso[]> {
  const uids = [...new Set(docs.map(donoDe).filter(Boolean))];
  const nomes = new Map(
    await Promise.all(uids.map(async (uid) => [uid, await nomesDoEscopo(uid)] as const)),
  );

  return docs
    .map((doc) => {
      const uid = donoDe(doc);
      const l = paraLancamento(doc.id, doc.data());
      const mapa = nomes.get(uid);
      return {
        ...l,
        userId: uid,
        userName: nomeDoUsuario(uid),
        categoryName: mapa?.categorias.get(l.categoryId) ?? "(categoria removida)",
        accountName: mapa?.contas.get(l.accountId) ?? "(conta removida)",
      };
    })
    .sort((a, b) => b.date.getTime() - a.date.getTime());
}

/**
 * Pedidos de uma pessoa só — a consulta que todo colaborador faz em Relatórios.
 *
 * Vai direto na subcoleção dela: sem consulta de grupo e sem enxergar ninguém.
 */
export async function listarPedidosDoUsuario(
  uid: string,
  nome: string,
  filtros: FiltroDeReembolso = {},
): Promise<PedidoDeReembolso[]> {
  let q = escopoDe(uid).transactions.where("reembolso", "==", true) as FirebaseFirestore.Query;
  if (filtros.desde) q = q.where("date", ">=", filtros.desde);
  if (filtros.ate) q = q.where("date", "<=", filtros.ate);

  const snap = await q.get();
  const docs = filtros.situacao
    ? snap.docs.filter((d) => paraAprovacao(d.data().aprovacao) === filtros.situacao)
    : snap.docs;

  return montarPedidos(docs, () => nome);
}

/**
 * Pedidos de toda a equipe — só o gestor chega aqui.
 *
 * A janela de datas entra na consulta; a situação é filtrada depois, sobre um
 * conjunto já pequeno. Filtrar as duas no banco exigiria mais um índice composto
 * de grupo para ganhar pouco (RNF-03 continua respeitado: nada carrega a
 * coleção inteira, sempre há recorte por data).
 */
export async function listarPedidosDaEquipe(
  nomePorUid: Map<string, string>,
  filtros: FiltroDeReembolso = {},
): Promise<PedidoDeReembolso[]> {
  if (filtros.userId) {
    return listarPedidosDoUsuario(
      filtros.userId,
      nomePorUid.get(filtros.userId) ?? "(usuário removido)",
      filtros,
    );
  }

  let q = grupoLancamentos().where("reembolso", "==", true) as FirebaseFirestore.Query;
  if (filtros.desde) q = q.where("date", ">=", filtros.desde);
  if (filtros.ate) q = q.where("date", "<=", filtros.ate);

  const snap = await q.get();
  const docs = filtros.situacao
    ? snap.docs.filter((d) => paraAprovacao(d.data().aprovacao) === filtros.situacao)
    : snap.docs;

  return montarPedidos(docs, (uid) => nomePorUid.get(uid) ?? "(usuário removido)");
}

/** Fila de decisão: o que está esperando o gestor, de todo mundo. */
export async function listarFilaDeAprovacao(
  nomePorUid: Map<string, string>,
): Promise<PedidoDeReembolso[]> {
  const snap = await grupoLancamentos()
    .where("reembolso", "==", true)
    .where("aprovacao", "==", "ENVIADA")
    .get();

  const pedidos = await montarPedidos(snap.docs, (uid) => nomePorUid.get(uid) ?? "(usuário removido)");
  // Na fila, o mais antigo primeiro: quem esperou mais é atendido antes.
  return pedidos.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
}

export async function contarPedidos(
  situacao: AprovacaoStatus,
  uid?: string,
): Promise<number> {
  const base = uid ? escopoDe(uid).transactions : grupoLancamentos();
  const q = (base as FirebaseFirestore.Query)
    .where("reembolso", "==", true)
    .where("aprovacao", "==", situacao);
  return (await q.count().get()).data().count;
}

/**
 * Muda a situação passando pela máquina de estados — o único caminho.
 *
 * A validação acontece DENTRO da transação, com o estado lido ali mesmo. Ler
 * antes e decidir depois abriria janela para dois cliques aprovarem duas vezes.
 */
export async function decidirPedido(
  dono: string,
  id: string,
  para: AprovacaoStatus,
  ator: { uid: string; nome: string; papel: UserRole },
  extras?: { motivo?: string | null; viaLote?: boolean; paymentBatchId?: string },
): Promise<void> {
  await emTransacao(async (t) => {
    const ref = escopoDe(dono).transactions.doc(id);
    const snap = await t.get(ref);
    if (!snap.exists) throw new ErroDeNegocio("Lançamento não encontrado.");

    const atual = paraLancamento(snap.id, snap.data() ?? {});
    if (!atual.reembolso || atual.aprovacao === null) {
      throw new ErroDeNegocio("Este lançamento não é um pedido de reembolso.");
    }

    const veredito = avaliarTransicao(atual.aprovacao, para, {
      papel: ator.papel,
      ehDono: dono === ator.uid,
      motivo: extras?.motivo,
      viaLote: extras?.viaLote,
    });
    if (!veredito.permitida) throw new ErroDeNegocio(veredito.motivo);

    const agora = new Date();
    const patch: Record<string, unknown> = { aprovacao: para, updatedAt: agora };

    if (para === "APROVADA") {
      patch.approvedBy = ator.uid;
      patch.approvedByName = ator.nome;
      patch.approvedAt = agora;
      patch.rejectionReason = null;
    }
    if (para === "REJEITADA") patch.rejectionReason = extras?.motivo ?? null;
    if (para === "ENVIADA") patch.rejectionReason = null;
    if (para === "RESSARCIDA") {
      patch.paymentBatchId = extras?.paymentBatchId ?? null;
      patch.reimbursedAt = agora;
    }

    t.update(ref, patch);
  });
}

// --- lotes de pagamento ------------------------------------------------------

const lotes = () => adminDb.collection("paymentBatches");

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

/** Prévia do fechamento: quanto e quantos, sem escrever nada (Art. 1). */
export async function previaDeFechamento(uid: string, desde: Date, ate: Date) {
  const snap = await escopoDe(uid)
    .transactions.where("reembolso", "==", true)
    .where("date", ">=", desde)
    .where("date", "<=", ate)
    .get();

  const elegiveis = snap.docs
    .map((d) => paraLancamento(d.id, d.data()))
    .filter((l) => paraAprovacao(l.aprovacao) === "APROVADA");

  return {
    pedidos: elegiveis,
    totalCents: elegiveis.reduce((s, l) => s + paraCentavos(l.amount), 0),
    quantidade: elegiveis.length,
  };
}

/**
 * Fecha o lote: cria o registro e marca TODOS os pedidos de uma vez.
 *
 * Um `writeBatch` só. Em laço sequencial, uma falha no meio deixaria metade
 * marcada como paga e metade não — com o dinheiro já tendo saído (Art. 2).
 */
export async function fecharLote(
  ator: { uid: string; nome: string },
  alvo: { userId: string; userName: string },
  periodo: { desde: Date; ate: Date },
): Promise<{ loteId: string; quantidade: number; totalCents: number }> {
  const previa = await previaDeFechamento(alvo.userId, periodo.desde, periodo.ate);

  if (previa.quantidade === 0) {
    throw new ErroDeNegocio("Não há pedidos aprovados nesse período para essa pessoa.");
  }
  if (previa.quantidade > 400) {
    throw new ErroDeNegocio("Período grande demais para um lote. Feche em intervalos menores.");
  }

  const loteRef = lotes().doc();
  const agora = new Date();
  const escrita = adminDb.batch();
  const transacoesDoDono = escopoDe(alvo.userId).transactions;

  escrita.set(loteRef, {
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

  for (const pedido of previa.pedidos) {
    escrita.update(transacoesDoDono.doc(pedido.id), {
      aprovacao: "RESSARCIDA",
      paymentBatchId: loteRef.id,
      reimbursedAt: agora,
      updatedAt: agora,
    });
  }

  await escrita.commit();

  return { loteId: loteRef.id, quantidade: previa.quantidade, totalCents: previa.totalCents };
}
