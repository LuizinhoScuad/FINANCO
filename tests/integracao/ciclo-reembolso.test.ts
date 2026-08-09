import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { adminDb } from "@/lib/firebase-admin";
import {
  decidirPedido,
  fecharLote,
  listarFilaDeAprovacao,
  listarLotes,
  listarPedidosDoUsuario,
  previaDeFechamento,
} from "@/lib/core/repositories/transactions.repo";

/**
 * Ciclo completo do reembolso contra o Firestore REAL, chamando as funções que
 * o app chama — não uma imitação delas.
 *
 * Tudo vive sob um usuário descartável e é apagado no fim. Nenhum documento de
 * pessoa real é lido para escrita nem tocado.
 */

const UID = "zzz-teste-ciclo";
const ADMIN = { uid: "zzz-teste-gestor", nome: "Gestor de Teste", papel: "ADMIN" as const };
const raiz = () => adminDb.collection("users").doc(UID);
const nomes = new Map([[UID, "Ciclo de Teste"]]);

async function semearPedido(id: string, valor: number, data: Date) {
  await raiz().collection("transactions").doc(id).set({
    description: `pedido ${id}`,
    amount: valor,
    type: "EXPENSE",
    status: "COMPLETED",
    date: data,
    accountId: "conta",
    categoryId: "cat",
    payee: null, tags: null, notes: null, receiptUrl: null,
    isInstallment: false,
    reembolso: true,
    aprovacao: "ENVIADA",
    rejectionReason: null, approvedBy: null, approvedByName: null, approvedAt: null,
    paymentBatchId: null, reimbursedAt: null,
    createdAt: new Date(), updatedAt: new Date(),
  });
}

const HOJE = new Date();
const JANELA = {
  desde: new Date(HOJE.getFullYear(), HOJE.getMonth(), 1),
  ate: new Date(HOJE.getFullYear(), HOJE.getMonth() + 1, 0, 23, 59, 59),
};

beforeAll(async () => {
  await raiz().set({ name: "Ciclo de Teste", role: "COLABORADOR", status: "ACTIVE", seeded: true });
  await raiz().collection("accounts").doc("conta").set({ name: "Carteira", type: "CASH", color: "#0d8", balance: 0, createdAt: HOJE, updatedAt: HOJE });
  await raiz().collection("categories").doc("cat").set({ name: "Transporte", icon: "🚕", type: "EXPENSE", color: "#0d8", createdAt: HOJE });
  await semearPedido("p1", 10.1, HOJE);
  await semearPedido("p2", 20.2, HOJE);
  await semearPedido("p3", 5.05, HOJE);
});

afterAll(async () => {
  const tx = await raiz().collection("transactions").get();
  for (const d of tx.docs) await d.ref.delete();
  for (const sub of ["accounts", "categories"]) {
    const s = await raiz().collection(sub).get();
    for (const d of s.docs) await d.ref.delete();
  }
  const lotes = await adminDb.collection("paymentBatches").where("userId", "==", UID).get();
  for (const d of lotes.docs) await d.ref.delete();
  await raiz().delete();
});

describe("ciclo do reembolso, ponta a ponta", () => {
  it("os três pedidos nascem aguardando decisão", async () => {
    const pedidos = await listarPedidosDoUsuario(UID, "Ciclo de Teste", JANELA);
    expect(pedidos).toHaveLength(3);
    expect(pedidos.every((p) => p.aprovacao === "ENVIADA")).toBe(true);
  });

  it("a fila do gestor enxerga os pedidos, com o nome do dono", async () => {
    const fila = await listarFilaDeAprovacao(nomes);
    const meus = fila.filter((p) => p.userId === UID);
    expect(meus).toHaveLength(3);
    expect(meus[0].userName).toBe("Ciclo de Teste");
    expect(meus[0].categoryName).toBe("Transporte");
  });

  it("colaborador NÃO consegue aprovar o próprio pedido", async () => {
    await expect(
      decidirPedido(UID, "p1", "APROVADA", { uid: UID, nome: "Ciclo", papel: "COLABORADOR" }),
    ).rejects.toThrow(/administrador/i);
  });

  it("rejeição sem motivo é recusada", async () => {
    await expect(decidirPedido(UID, "p3", "REJEITADA", ADMIN)).rejects.toThrow(/motivo/i);
  });

  it("o gestor aprova dois e rejeita um, com motivo", async () => {
    await decidirPedido(UID, "p1", "APROVADA", ADMIN);
    await decidirPedido(UID, "p2", "APROVADA", ADMIN);
    await decidirPedido(UID, "p3", "REJEITADA", ADMIN, { motivo: "falta o comprovante" });

    const pedidos = await listarPedidosDoUsuario(UID, "Ciclo de Teste", JANELA);
    const porId = new Map(pedidos.map((p) => [p.id, p]));

    expect(porId.get("p1")?.aprovacao).toBe("APROVADA");
    expect(porId.get("p1")?.approvedByName).toBe("Gestor de Teste");
    expect(porId.get("p3")?.aprovacao).toBe("REJEITADA");
    expect(porId.get("p3")?.rejectionReason).toBe("falta o comprovante");
  });

  it("aprovar duas vezes é recusado — o duplo clique não passa", async () => {
    await expect(decidirPedido(UID, "p1", "APROVADA", ADMIN)).rejects.toThrow();
  });

  it("marcar como pago fora do lote é recusado", async () => {
    await expect(decidirPedido(UID, "p1", "RESSARCIDA", ADMIN)).rejects.toThrow(/lote/i);
  });

  it("a prévia soma só os aprovados, em centavos exatos", async () => {
    const previa = await previaDeFechamento(UID, JANELA.desde, JANELA.ate);
    expect(previa.quantidade).toBe(2);
    // 10.10 + 20.20 = 30.30 -> 3030 centavos, sem deriva de ponto flutuante
    expect(previa.totalCents).toBe(3030);
  });

  it("o fechamento marca todos de uma vez e cria o lote", async () => {
    const r = await fecharLote(
      { uid: ADMIN.uid, nome: ADMIN.nome },
      { userId: UID, userName: "Ciclo de Teste" },
      JANELA,
    );
    expect(r.quantidade).toBe(2);
    expect(r.totalCents).toBe(3030);

    const pedidos = await listarPedidosDoUsuario(UID, "Ciclo de Teste", JANELA);
    const porId = new Map(pedidos.map((p) => [p.id, p]));

    expect(porId.get("p1")?.aprovacao).toBe("RESSARCIDA");
    expect(porId.get("p2")?.aprovacao).toBe("RESSARCIDA");
    expect(porId.get("p1")?.paymentBatchId).toBe(r.loteId);
    expect(porId.get("p1")?.reimbursedAt).toBeTruthy();

    // O rejeitado não foi arrastado junto.
    expect(porId.get("p3")?.aprovacao).toBe("REJEITADA");

    const lote = (await listarLotes(UID)).find((l) => l.id === r.loteId);
    expect(lote?.totalCents).toBe(3030);
    expect(lote?.expenseCount).toBe(2);
    expect(lote?.status).toBe("PAGO");
  });

  it("fechar de novo o mesmo período não acha nada para pagar", async () => {
    await expect(
      fecharLote({ uid: ADMIN.uid, nome: ADMIN.nome }, { userId: UID, userName: "Ciclo de Teste" }, JANELA),
    ).rejects.toThrow(/não há pedidos aprovados/i);
  });

  it("pedido já pago não sai mais da fila nem volta atrás", async () => {
    const fila = await listarFilaDeAprovacao(nomes);
    expect(fila.filter((p) => p.userId === UID)).toHaveLength(0);
    await expect(decidirPedido(UID, "p1", "APROVADA", ADMIN)).rejects.toThrow();
  });
});
