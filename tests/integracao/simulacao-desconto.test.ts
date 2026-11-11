import { beforeAll, describe, expect, it, vi } from "vitest";
import type { BancoEmMemoria } from "./apoio/firestore-em-memoria";

/**
 * SIMULAÇÃO do desconto de valor já pago (Fase 14), de ponta a ponta, sem
 * credencial: o Firestore é o de memória (apoio/firestore-em-memoria.ts), mas
 * as funções chamadas são EXATAMENTE as do app — a action `createTransaction`,
 * os repositórios, a máquina de estados, o fechamento de lote.
 *
 * O que isto prova: a lógica. O que NÃO prova: regras de segurança, índices e
 * o comportamento do Firestore real sob concorrência — para isso existe
 * `npm run test:integracao`, com `.env` preenchido.
 */

/**
 * `vi.mock` é içado para o topo do arquivo: o que as fábricas usam precisa
 * nascer em `vi.hoisted`, senão é "acesso antes da inicialização".
 */
const h = vi.hoisted(() => ({
  banco: undefined as unknown as BancoEmMemoria,
  /** Quem está logado — a action lê daqui, como leria do cookie. */
  sessao: {
    atual: { uid: "zzz-teste-admin", email: "admin@teste", role: "ADMIN" as "ADMIN" | "COLABORADOR", status: "ACTIVE" as const },
  },
}));

vi.mock("firebase-admin/firestore", async () => {
  const m = await import("./apoio/firestore-em-memoria");
  return { FieldValue: m.FieldValue, Timestamp: m.Timestamp };
});
vi.mock("@/lib/firebase-admin", async () => {
  const m = await import("./apoio/firestore-em-memoria");
  h.banco ??= new m.BancoEmMemoria();
  return { adminDb: h.banco, adminAuth: { listUsers: async () => ({ users: [] }) } };
});
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("@/lib/auth", () => ({
  requireActiveUser: async () => h.sessao.atual,
  requireAdmin: async () => {
    if (h.sessao.atual.role !== "ADMIN") throw new Error("redirect:/dashboard");
    return h.sessao.atual;
  },
  getSessionUser: async () => h.sessao.atual,
}));

const sessao = h.sessao;
const ADMIN = { uid: "zzz-teste-admin", email: "admin@teste", role: "ADMIN" as const, status: "ACTIVE" as const };
const ANA = { uid: "zzz-teste-ana", email: "ana@teste", role: "COLABORADOR" as const, status: "ACTIVE" as const };

import { createTransaction, verificarDuplicidade } from "@/actions/transactions";
import { estornarLancamento as estornarAction } from "@/actions/estornos";
import {
  alternarStatus,
  atualizarLancamento,
  decidirPedido,
  despesasPorCategoria,
  excluirLancamento,
  fecharLote,
  listarFilaDeAprovacao,
  listarLotes,
  listarPedidosDoUsuario,
  previaDeFechamento,
  resumoDoMes,
} from "@/lib/core/repositories/transactions.repo";
import { paraCentavos } from "@/lib/core/money";

// As importações acima já forçaram a fábrica do mock a rodar.
const banco = h.banco;

const HOJE = new Date();
const DIA = HOJE.toISOString().slice(0, 10);
const JANELA = {
  desde: new Date(Date.UTC(HOJE.getUTCFullYear(), HOJE.getUTCMonth(), 1)),
  ate: new Date(Date.UTC(HOJE.getUTCFullYear(), HOJE.getUTCMonth() + 1, 0, 23, 59, 59, 999)),
};
const nomes = new Map([
  [ANA.uid, "Ana de Teste"],
  [ADMIN.uid, "Gestor de Teste"],
]);

function formulario(campos: Record<string, string>) {
  const fd = new FormData();
  for (const [k, v] of Object.entries(campos)) fd.set(k, v);
  return fd;
}

function base(extras: Record<string, string> = {}) {
  return formulario({
    description: "Almoço pago em dobro",
    amount: "50",
    type: "EXPENSE",
    date: DIA,
    accountId: "conta",
    categoryId: "cat",
    reembolso: "on",
    submissionId: `zzz-teste-${Math.random().toString(36).slice(2, 12)}`,
    ...extras,
  });
}

async function semearPessoa(uid: string, nome: string, role: "ADMIN" | "COLABORADOR") {
  const raiz = banco.collection("users").doc(uid);
  await raiz.set({ name: nome, email: `${uid}@teste`, role, status: "ACTIVE", seeded: true, createdAt: HOJE, updatedAt: HOJE });
  await raiz.collection("accounts").doc("conta").set({ name: "Carteira", type: "CASH", color: "#0d8", balance: 0, createdAt: HOJE, updatedAt: HOJE });
  await raiz.collection("categories").doc("cat").set({ name: "Alimentacao", icon: "🍔", type: "EXPENSE", color: "#f59e0b", createdAt: HOJE });
}

async function semearPedidoAprovado(uid: string, id: string, valor: number) {
  await banco.collection("users").doc(uid).collection("transactions").doc(id).set({
    description: `pedido ${id}`,
    amount: valor,
    type: "EXPENSE",
    status: "COMPLETED",
    date: new Date(Date.UTC(HOJE.getUTCFullYear(), HOJE.getUTCMonth(), HOJE.getUTCDate(), 12)),
    accountId: "conta",
    categoryId: "cat",
    payee: null, tags: null, notes: null, receiptUrl: null,
    isInstallment: false,
    reembolso: true,
    aprovacao: "APROVADA",
    rejectionReason: null, approvedBy: ADMIN.uid, approvedByName: "Gestor de Teste", approvedAt: HOJE,
    paymentBatchId: null, reimbursedAt: null,
    createdAt: HOJE, updatedAt: HOJE,
  });
}

const saldoDaAna = async () =>
  Number((await banco.collection("users").doc(ANA.uid).collection("accounts").doc("conta").get()).data()?.balance);

const lancamentosDaAna = async () =>
  (await banco.collection("users").doc(ANA.uid).collection("transactions").get()).docs.map((d) => ({ id: d.id, ...d.data() }) as Record<string, unknown>);

beforeAll(async () => {
  await semearPessoa(ADMIN.uid, "Gestor de Teste", "ADMIN");
  await semearPessoa(ANA.uid, "Ana de Teste", "COLABORADOR");
});

describe("1. quem pode criar o desconto (RF-73, RF-66)", () => {
  it("colaborador não cria desconto para si", async () => {
    sessao.atual = ANA;
    const r = await createTransaction(base({ desconto: "on" }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/administrador/i);
    expect(await lancamentosDaAna()).toHaveLength(0);
  });

  it("colaborador não cria desconto para outra pessoa, nem forjando paraUid", async () => {
    sessao.atual = ANA;
    const r = await createTransaction(base({ desconto: "on", paraUid: ADMIN.uid }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/Somente o administrador/i);
  });

  it("administrador não cria desconto para si mesmo (sem paraUid)", async () => {
    sessao.atual = ADMIN;
    const r = await createTransaction(base({ desconto: "on" }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/em nome de outra pessoa/i);
  });

  it("desconto parcelado é recusado (RF-77)", async () => {
    sessao.atual = ADMIN;
    const r = await createTransaction(base({ desconto: "on", paraUid: ANA.uid, isInstallment: "on", totalInstallments: "3" }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/não se parcela/i);
    expect(await lancamentosDaAna()).toHaveLength(0);
  });
});

describe("2. o administrador lança o desconto em nome da Ana", () => {
  it("grava negativo, pendente, como pedido, marcado por quem lançou — e o saldo da Ana não muda", async () => {
    sessao.atual = ADMIN;
    const r = await createTransaction(base({ desconto: "on", paraUid: ANA.uid, status: "COMPLETED", type: "INCOME" }));
    expect(r.ok).toBe(true);

    const [doc] = await lancamentosDaAna();
    expect(doc.amount).toBe(-50);
    expect(doc.desconto).toBe(true);
    expect(doc.status).toBe("PENDING"); // mesmo com "Efetivada" marcada na tela
    expect(doc.type).toBe("EXPENSE"); // mesmo com "Receita" forjada
    expect(doc.reembolso).toBe(true);
    expect(doc.aprovacao).toBe("ENVIADA");
    expect(doc.lancadoPor).toBe(ADMIN.uid);
    expect(doc.lancadoPorNome).toBe("Gestor de Teste");
    expect(await saldoDaAna()).toBe(0);
  });

  it("o segundo desconto igual no mesmo dia é apontado como gêmeo (RF-70)", async () => {
    sessao.atual = ADMIN;
    const r = await verificarDuplicidade(base({ desconto: "on", paraUid: ANA.uid }));
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.data).toHaveLength(1);
      expect(r.data[0].amount).toBe(-50);
    }
  });

  it("aparece na fila do gestor com o valor negativo", async () => {
    const fila = await listarFilaDeAprovacao(nomes);
    const desconto = fila.find((p) => p.desconto);
    expect(desconto).toBeDefined();
    expect(desconto!.amount).toBe(-50);
    expect(desconto!.userName).toBe("Ana de Teste");
  });
});

describe("3. a Ana não mexe no desconto (RF-76)", () => {
  let id: string;
  beforeAll(async () => {
    id = (await lancamentosDaAna())[0].id as string;
    sessao.atual = ANA;
  });

  it("não alterna pago/pendente", async () => {
    await expect(alternarStatus(id)).rejects.toThrow(/só ele pode removê-lo/i);
    expect(await saldoDaAna()).toBe(0);
  });

  it("não edita", async () => {
    await expect(
      atualizarLancamento(id, {
        description: "tentando virar positivo",
        amount: 50,
        type: "EXPENSE",
        status: "COMPLETED",
        date: HOJE,
        accountId: "conta",
        categoryId: "cat",
        reembolso: true,
      }),
    ).rejects.toThrow(/só ele pode removê-lo/i);
    expect((await lancamentosDaAna())[0].amount).toBe(-50);
  });

  it("não exclui", async () => {
    await expect(excluirLancamento(id)).rejects.toThrow(/só ele pode removê-lo/i);
    expect(await lancamentosDaAna()).toHaveLength(1);
  });

  it("o desconto fica fora das despesas por categoria e do resumo do mês", async () => {
    const porCategoria = await despesasPorCategoria({ mes: HOJE.getMonth() + 1, ano: HOJE.getFullYear() });
    expect(porCategoria.find((c) => c.name === "Alimentacao")?.total ?? 0).toBe(0);
    const resumo = await resumoDoMes(HOJE.getMonth() + 1, HOJE.getFullYear());
    expect(resumo.expense).toBe(0);
  });
});

describe("4. aprovação e fechamento abatido (RF-74, RF-75)", () => {
  beforeAll(async () => {
    sessao.atual = ADMIN;
    await semearPedidoAprovado(ANA.uid, "p1", 37);
    await semearPedidoAprovado(ANA.uid, "p2", 120.4);
  });

  it("o gestor aprova o desconto como qualquer pedido", async () => {
    const id = (await lancamentosDaAna()).find((d) => d.desconto)!.id as string;
    await decidirPedido(ANA.uid, id, "APROVADA", { uid: ADMIN.uid, nome: "Gestor de Teste", papel: "ADMIN" });
    const pedidos = await listarPedidosDoUsuario(ANA.uid, "Ana de Teste", { situacao: "APROVADA" });
    expect(pedidos).toHaveLength(3);
    expect(pedidos.find((p) => p.desconto)!.aprovacao).toBe("APROVADA");
  });

  it("a prévia soma com sinal: 37 + 120,40 − 50, contando 2 pedidos e 1 desconto", async () => {
    const previa = await previaDeFechamento(ANA.uid, JANELA.desde, JANELA.ate);
    expect(previa.totalCents).toBe(10740);
    expect(previa.quantidade).toBe(2);
    expect(previa.descontos).toBe(1);
  });

  it("com um desconto maior que os pedidos, o fechamento é recusado", async () => {
    sessao.atual = ADMIN;
    const r = await createTransaction(base({ desconto: "on", paraUid: ANA.uid, amount: "500", description: "desconto grande demais" }));
    expect(r.ok).toBe(true);
    const grande = (await lancamentosDaAna()).find((d) => d.description === "desconto grande demais")!.id as string;
    await decidirPedido(ANA.uid, grande, "APROVADA", { uid: ADMIN.uid, nome: "Gestor de Teste", papel: "ADMIN" });

    await expect(
      fecharLote({ uid: ADMIN.uid, nome: "Gestor de Teste" }, { userId: ANA.uid, userName: "Ana de Teste", dadosBancarios: null }, JANELA),
    ).rejects.toThrow(/descontos superam/i);

    // Nada foi marcado como pago.
    const pagos = await listarPedidosDoUsuario(ANA.uid, "Ana de Teste", { situacao: "RESSARCIDA" });
    expect(pagos).toHaveLength(0);

    // O gestor remove o desconto errado por estorno — único caminho (RF-76).
    const estorno = await estornarAction(ANA.uid, grande, "lançado com valor errado");
    expect(estorno.ok).toBe(true);
    expect(await saldoDaAna()).toBe(0);
  });

  it("o lote fecha com 107,40, 2 pedidos atendidos, e o desconto vira 'atendido' junto", async () => {
    const r = await fecharLote(
      { uid: ADMIN.uid, nome: "Gestor de Teste" },
      { userId: ANA.uid, userName: "Ana de Teste", dadosBancarios: null },
      JANELA,
    );
    expect(r.totalCents).toBe(10740);
    expect(r.quantidade).toBe(2);

    const [lote] = await listarLotes(ANA.uid);
    expect(lote.totalCents).toBe(10740);
    expect(lote.expenseCount).toBe(2);
    expect(lote.estornadoCents).toBe(0);

    const pagos = await listarPedidosDoUsuario(ANA.uid, "Ana de Teste", { situacao: "RESSARCIDA" });
    expect(pagos).toHaveLength(3);
    expect(pagos.every((p) => p.paymentBatchId === lote.id)).toBe(true);
    expect(paraCentavos(pagos.reduce((s, p) => s + p.amount, 0))).toBe(10740);
  });

  it("desconto já abatido num lote fechado não pode ser estornado", async () => {
    const id = (await lancamentosDaAna()).find((d) => d.desconto)!.id as string;
    const r = await estornarAction(ANA.uid, id, "tentando");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/já foi abatido/i);
    const [lote] = await listarLotes(ANA.uid);
    expect(lote.estornadoCents).toBe(0);
  });

  it("o saldo da conta da Ana continua intacto do começo ao fim", async () => {
    expect(await saldoDaAna()).toBe(0);
  });
});
