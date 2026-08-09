import { describe, expect, it } from "vitest";
import { ArquivoDeBackup, descreverFalha, verificarIntegridade } from "@/lib/guardrails/validate";

const contaValida = {
  id: "c1",
  name: "Carteira",
  type: "CASH",
  color: "#00d98b",
  balance: 100,
};

const categoriaValida = { id: "cat1", name: "Mercado", type: "EXPENSE" as const };

const lancamentoValido = {
  id: "t1",
  description: "Compra",
  amount: 50,
  type: "EXPENSE" as const,
  status: "COMPLETED" as const,
  date: "2026-08-09T12:00:00.000Z",
  accountId: "c1",
  categoryId: "cat1",
};

const arquivoBom = {
  accounts: [contaValida],
  categories: [categoriaValida],
  budgets: [],
  transactions: [lancamentoValido],
};

describe("backup preserva o pedido de reembolso", () => {
  const pedidoPago = {
    ...lancamentoValido,
    id: "t2",
    reembolso: true,
    aprovacao: "RESSARCIDA" as const,
    approvedBy: "uid-admin",
    approvedByName: "Luiz",
    approvedAt: "2026-08-01T12:00:00.000Z",
    paymentBatchId: "lote1",
    reimbursedAt: "2026-08-05T12:00:00.000Z",
  };

  /**
   * `z.object` descarta campo que não conhece. Sem os campos declarados no
   * schema, restaurar um backup transformaria todo pedido já pago em
   * lançamento particular — apagando o rastro do pagamento.
   */
  it("não perde os campos de aprovação ao validar", () => {
    const r = ArquivoDeBackup.safeParse({ ...arquivoBom, transactions: [pedidoPago] });
    expect(r.success).toBe(true);
    if (!r.success) return;

    const restaurado = r.data.transactions[0];
    expect(restaurado.reembolso).toBe(true);
    expect(restaurado.aprovacao).toBe("RESSARCIDA");
    expect(restaurado.paymentBatchId).toBe("lote1");
    expect(restaurado.approvedByName).toBe("Luiz");
    expect(restaurado.reimbursedAt).toBeTruthy();
  });

  it("aceita backup antigo, feito antes de existir reembolso", () => {
    expect(ArquivoDeBackup.safeParse(arquivoBom).success).toBe(true);
  });

  it("recusa situação de aprovação inventada", () => {
    const r = ArquivoDeBackup.safeParse({
      ...arquivoBom,
      transactions: [{ ...pedidoPago, aprovacao: "PAGA_TALVEZ" }],
    });
    expect(r.success).toBe(false);
  });
});

describe("schema do arquivo de backup", () => {
  it("aceita um arquivo bem formado", () => {
    expect(ArquivoDeBackup.safeParse(arquivoBom).success).toBe(true);
  });

  it("recusa lixo", () => {
    expect(ArquivoDeBackup.safeParse({ qualquer: "coisa" }).success).toBe(false);
    expect(ArquivoDeBackup.safeParse(null).success).toBe(false);
    expect(ArquivoDeBackup.safeParse([]).success).toBe(false);
  });

  it("recusa estrutura certa com conteúdo inválido", () => {
    const r = ArquivoDeBackup.safeParse({ ...arquivoBom, accounts: [{ id: "x" }] });
    expect(r.success).toBe(false);
  });

  it("recusa tipo de lançamento desconhecido", () => {
    const r = ArquivoDeBackup.safeParse({
      ...arquivoBom,
      transactions: [{ ...lancamentoValido, type: "TRANSFERENCIA" }],
    });
    expect(r.success).toBe(false);
  });

  it("recusa mês fora do intervalo", () => {
    const r = ArquivoDeBackup.safeParse({
      ...arquivoBom,
      budgets: [{ id: "b1", categoryId: "cat1", amount: 100, month: 13, year: 2026 }],
    });
    expect(r.success).toBe(false);
  });

  it("recusa data que não é data", () => {
    const r = ArquivoDeBackup.safeParse({
      ...arquivoBom,
      transactions: [{ ...lancamentoValido, date: "ontem de manhã" }],
    });
    expect(r.success).toBe(false);
  });

  it("descreve a falha apontando o campo, sem chave crua", () => {
    const r = ArquivoDeBackup.safeParse({ ...arquivoBom, accounts: [{ id: "x" }] });
    if (r.success) throw new Error("deveria ter falhado");

    const msg = descreverFalha(r.error);
    expect(msg).toContain("accounts");
    expect(msg).not.toContain("{");
    expect(msg).not.toContain("fieldErrors");
  });
});

describe("coerência interna do arquivo", () => {
  it("arquivo coerente não acusa problema", () => {
    expect(verificarIntegridade(arquivoBom)).toHaveLength(0);
  });

  /**
   * O caso que motivou esta checagem: restaurar um backup truncado produziria
   * lançamentos apontando para o nada, e o saldo nunca mais fecharia.
   */
  it("acusa lançamento apontando para conta que não está no arquivo", () => {
    const problemas = verificarIntegridade({
      ...arquivoBom,
      transactions: [{ ...lancamentoValido, accountId: "NAO_EXISTE" }],
    });
    expect(problemas.length).toBeGreaterThan(0);
    expect(problemas[0].tipo).toMatch(/conta/i);
  });

  it("acusa lançamento apontando para categoria inexistente", () => {
    const problemas = verificarIntegridade({
      ...arquivoBom,
      transactions: [{ ...lancamentoValido, categoryId: "SUMIU" }],
    });
    expect(problemas.some((p) => /categoria/i.test(p.tipo))).toBe(true);
  });

  it("acusa orçamento órfão", () => {
    const problemas = verificarIntegridade({
      ...arquivoBom,
      budgets: [{ id: "b1", categoryId: "SUMIU", amount: 100, month: 8, year: 2026 }],
    });
    expect(problemas.some((p) => /Orçamento/i.test(p.tipo))).toBe(true);
  });

  it("acusa identificadores repetidos", () => {
    const problemas = verificarIntegridade({
      ...arquivoBom,
      transactions: [lancamentoValido, { ...lancamentoValido }],
    });
    expect(problemas.some((p) => /duplicad/i.test(p.tipo))).toBe(true);
  });
});
