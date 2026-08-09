import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { adminDb } from "@/lib/firebase-admin";
import {
  decidirPedido,
  listarFilaDeAprovacao,
  listarPedidosDoUsuario,
} from "@/lib/core/repositories/transactions.repo";

/**
 * Aprovação por pessoa, com DUAS pessoas na fila ao mesmo tempo.
 *
 * O risco desta funcionalidade é justamente o vazamento entre pessoas: aprovar
 * "todos de fulano" e levar junto o pedido de sicrano. É isso que se testa aqui.
 */

const A = { uid: "zzz-teste-pessoa-a", nome: "Ana Teste" };
const B = { uid: "zzz-teste-pessoa-b", nome: "Bruno Teste" };
const ADMIN = { uid: "zzz-teste-gestor2", nome: "Gestor", papel: "ADMIN" as const };
const nomes = new Map([
  [A.uid, A.nome],
  [B.uid, B.nome],
]);

const raiz = (uid: string) => adminDb.collection("users").doc(uid);
const HOJE = new Date();
const JANELA = {
  desde: new Date(HOJE.getFullYear() - 1, 0, 1),
  ate: new Date(HOJE.getFullYear() + 1, 11, 31),
};

async function semear(uid: string, nome: string, quantos: number) {
  await raiz(uid).set({ name: nome, role: "COLABORADOR", status: "ACTIVE", seeded: true });
  await raiz(uid).collection("accounts").doc("c").set({ name: "Carteira", type: "CASH", color: "#0d8", balance: 0, createdAt: HOJE, updatedAt: HOJE });
  await raiz(uid).collection("categories").doc("g").set({ name: "Transporte", icon: "🚕", type: "EXPENSE", color: "#0d8", createdAt: HOJE });

  for (let i = 1; i <= quantos; i++) {
    await raiz(uid).collection("transactions").doc(`p${i}`).set({
      description: `${nome} pedido ${i}`,
      amount: 10 * i,
      type: "EXPENSE",
      status: "PENDING",
      date: HOJE,
      accountId: "c",
      categoryId: "g",
      payee: null, tags: null, notes: null, receiptUrl: null,
      isInstallment: false,
      reembolso: true,
      aprovacao: "ENVIADA",
      rejectionReason: null, approvedBy: null, approvedByName: null, approvedAt: null,
      paymentBatchId: null, reimbursedAt: null,
      createdAt: new Date(), updatedAt: new Date(),
    });
  }
}

async function apagar(uid: string) {
  for (const sub of ["transactions", "accounts", "categories"]) {
    const s = await raiz(uid).collection(sub).get();
    for (const d of s.docs) await d.ref.delete();
  }
  await raiz(uid).delete().catch(() => {});
}

beforeAll(async () => {
  await semear(A.uid, A.nome, 3);
  await semear(B.uid, B.nome, 2);
});

afterAll(async () => {
  await apagar(A.uid);
  await apagar(B.uid);
});

/** Espelha o laço da action `aprovarTodosDaPessoa`. */
async function aprovarTodosDe(userId: string) {
  const fila = (await listarFilaDeAprovacao(nomes)).filter((p) => p.userId === userId);
  let aprovados = 0;
  for (const p of fila) {
    await decidirPedido(p.userId, p.id, "APROVADA", ADMIN);
    aprovados++;
  }
  return aprovados;
}

describe("aprovar por pessoa, com a fila compartilhada", () => {
  it("a fila separa as duas pessoas", async () => {
    const fila = await listarFilaDeAprovacao(nomes);
    expect(fila.filter((p) => p.userId === A.uid)).toHaveLength(3);
    expect(fila.filter((p) => p.userId === B.uid)).toHaveLength(2);
  });

  it("aprovar todos de Ana não encosta nos de Bruno", async () => {
    const aprovados = await aprovarTodosDe(A.uid);
    expect(aprovados).toBe(3);

    const deAna = await listarPedidosDoUsuario(A.uid, A.nome, JANELA);
    expect(deAna.every((p) => p.aprovacao === "APROVADA")).toBe(true);
    expect(deAna.every((p) => p.approvedByName === "Gestor")).toBe(true);

    const deBruno = await listarPedidosDoUsuario(B.uid, B.nome, JANELA);
    expect(deBruno).toHaveLength(2);
    expect(deBruno.every((p) => p.aprovacao === "ENVIADA")).toBe(true);
  });

  it("a fila passa a mostrar só os de Bruno", async () => {
    const fila = await listarFilaDeAprovacao(nomes);
    expect(fila.filter((p) => p.userId === A.uid)).toHaveLength(0);
    expect(fila.filter((p) => p.userId === B.uid)).toHaveLength(2);
  });

  it("aprovar de novo os de Ana não acha nada — sem efeito duplicado", async () => {
    expect(await aprovarTodosDe(A.uid)).toBe(0);
  });
});
