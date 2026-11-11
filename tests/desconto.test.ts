import { describe, expect, it } from "vitest";
import { ehDesconto, loteFechaComTotal, valorDeDesconto } from "@/lib/core/desconto";
import { paraCentavos } from "@/lib/core/money";

/**
 * O caso que motivou: o Luciano pagou um lançamento em duplicidade e só viu
 * depois, com o dinheiro já na conta da pessoa. O desconto é o pedido negativo
 * que abate do próximo lote — e o sinal precisa estar certo em todo lugar.
 */

describe("valorDeDesconto", () => {
  it("o que se digita positivo é gravado negativo", () => {
    expect(valorDeDesconto(37)).toBe(-37);
    expect(valorDeDesconto(12.5)).toBe(-12.5);
  });

  it("arredonda a dois centavos, sem o erro do ponto flutuante", () => {
    expect(valorDeDesconto(1.005)).toBe(-1.01);
    expect(paraCentavos(valorDeDesconto(0.1 + 0.2))).toBe(-30);
  });

  it("zero, negativo e não-número são recusados", () => {
    expect(() => valorDeDesconto(0)).toThrow(/maior que zero/);
    expect(() => valorDeDesconto(-5)).toThrow(/maior que zero/);
    expect(() => valorDeDesconto(Number.NaN)).toThrow();
    expect(() => valorDeDesconto(Number.POSITIVE_INFINITY)).toThrow();
  });
});

describe("ehDesconto", () => {
  it("só a marca explícita conta — documento antigo sem o campo é pedido comum", () => {
    expect(ehDesconto({ desconto: true })).toBe(true);
    expect(ehDesconto({ desconto: false })).toBe(false);
    expect(ehDesconto({})).toBe(false);
    expect(ehDesconto({ desconto: null })).toBe(false);
  });
});

describe("loteFechaComTotal", () => {
  it("positivo fecha", () => {
    expect(loteFechaComTotal(3700).ok).toBe(true);
  });

  it("zero fecha — a pessoa compensou exatamente o que devia", () => {
    expect(loteFechaComTotal(0).ok).toBe(true);
  });

  it("negativo é recusado com explicação", () => {
    const r = loteFechaComTotal(-1);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.motivo).toMatch(/descontos superam/i);
  });

  it("centavos quebrados não são total de lote", () => {
    expect(loteFechaComTotal(12.5).ok).toBe(false);
  });

  it("a soma com sinal de pedidos e descontos é o que decide", () => {
    const pedidos = [37, 120.4];
    const descontos = [valorDeDesconto(50)];
    const total = [...pedidos, ...descontos].reduce((s, v) => s + paraCentavos(v), 0);
    expect(total).toBe(10740);
    expect(loteFechaComTotal(total).ok).toBe(true);

    const demais = [...pedidos, valorDeDesconto(200)].reduce((s, v) => s + paraCentavos(v), 0);
    expect(loteFechaComTotal(demais).ok).toBe(false);
  });
});
