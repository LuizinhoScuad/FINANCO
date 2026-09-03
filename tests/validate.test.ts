import { describe, expect, it } from "vitest";
import {
  ArquivoDeBackup,
  DadosBancariosEntrada,
  descreverFalha,
  verificarIntegridade,
} from "@/lib/guardrails/validate";

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

describe("dados para reembolso", () => {
  /** O formulário manda tudo como texto, inclusive os campos em branco. */
  const soPix = {
    titular: "Maria Souza",
    cpf: "529.982.247-25",
    pixTipo: "TELEFONE",
    pixChave: "(11) 91234-5678",
    banco: "",
    agencia: "",
    conta: "",
    tipoConta: "",
  };

  it("aceita só PIX e normaliza o que grava", () => {
    const r = DadosBancariosEntrada.safeParse(soPix);
    expect(r.success).toBe(true);
    if (!r.success) return;

    expect(r.data.cpf).toBe("52998224725");
    expect(r.data.pixChave).toBe("+5511912345678");
    expect(r.data.banco).toBeNull();
    expect(r.data.tipoConta).toBeNull();
  });

  it("aceita a conta bancária completa", () => {
    const r = DadosBancariosEntrada.safeParse({
      ...soPix,
      banco: "341 Itaú",
      agencia: "0123",
      conta: "45678-9",
      tipoConta: "POUPANCA",
    });
    expect(r.success).toBe(true);
    if (!r.success) return;
    expect(r.data.conta).toBe("45678-9");
    expect(r.data.tipoConta).toBe("POUPANCA");
  });

  it("recusa CPF inválido apontando o campo", () => {
    const r = DadosBancariosEntrada.safeParse({ ...soPix, cpf: "529.982.247-24" });
    expect(r.success).toBe(false);
    if (r.success) return;
    expect(r.error.flatten().fieldErrors.cpf?.[0]).toMatch(/CPF/i);
  });

  it("recusa chave que não combina com o tipo", () => {
    const r = DadosBancariosEntrada.safeParse({
      ...soPix,
      pixTipo: "EMAIL",
      pixChave: "não é e-mail",
    });
    expect(r.success).toBe(false);
    if (r.success) return;
    expect(r.error.flatten().fieldErrors.pixChave?.[0]).toMatch(/e-mail/i);
  });

  /**
   * Meia conta bancária não deposita nada: gravar agência sem banco só
   * produziria um comprovante que parece completo e não serve.
   */
  it("recusa conta bancária pela metade, dizendo o que falta", () => {
    const r = DadosBancariosEntrada.safeParse({ ...soPix, agencia: "0123" });
    expect(r.success).toBe(false);
    if (r.success) return;

    const campos = r.error.flatten().fieldErrors;
    expect(campos.banco?.[0]).toMatch(/banco, agência e conta/i);
    expect(campos.conta?.[0]).toMatch(/banco, agência e conta/i);
    expect(campos.agencia).toBeUndefined();
  });

  it("exige o tipo quando há conta", () => {
    const r = DadosBancariosEntrada.safeParse({
      ...soPix,
      banco: "341 Itaú",
      agencia: "0123",
      conta: "45678-9",
    });
    expect(r.success).toBe(false);
    if (r.success) return;
    expect(r.error.flatten().fieldErrors.tipoConta?.[0]).toMatch(/corrente ou poupança/i);
  });

  it("recusa titular vazio e tipo de chave inventado", () => {
    expect(DadosBancariosEntrada.safeParse({ ...soPix, titular: "" }).success).toBe(false);
    expect(DadosBancariosEntrada.safeParse({ ...soPix, pixTipo: "BITCOIN" }).success).toBe(false);
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
