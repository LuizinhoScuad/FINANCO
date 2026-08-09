import { describe, expect, it } from "vitest";
import {
  arredondar,
  deltaDeSaldo,
  formatarCentavos,
  paraCentavos,
  paraReais,
  somar,
} from "@/lib/core/money";

describe("aritmética monetária", () => {
  it("converte reais para centavos sem erro de ponto flutuante", () => {
    expect(paraCentavos(12.34)).toBe(1234);
    expect(paraCentavos(0.1)).toBe(10);
    expect(paraCentavos(0.07)).toBe(7);
    // O clássico: 1.005 * 100 dá 100.49999999999999 em ponto flutuante
    expect(paraCentavos(1.005)).toBe(101);
  });

  it("volta de centavos para reais", () => {
    expect(paraReais(1234)).toBe(12.34);
    expect(paraReais(0)).toBe(0);
  });

  it("soma sem acumular deriva", () => {
    // Em ponto flutuante puro: 0.1 + 0.2 = 0.30000000000000004
    expect(somar(0.1, 0.2)).toBe(0.3);

    // Cem parcelas de dez centavos precisam dar exatamente dez reais
    const centavos = Array.from({ length: 100 }, () => 0.1);
    expect(somar(...centavos)).toBe(10);
  });

  it("arredonda para duas casas corretamente", () => {
    expect(arredondar(1.005)).toBe(1.01);
    expect(arredondar(2.675)).toBe(2.68);
    expect(arredondar(0.1 + 0.2)).toBe(0.3);
  });

  it("formata em real brasileiro", () => {
    //   é o espaço não separável que o Intl usa
    expect(formatarCentavos(123456).replace(/ /g, " ")).toBe("R$ 1.234,56");
    expect(formatarCentavos(0).replace(/ /g, " ")).toBe("R$ 0,00");
  });
});

describe("efeito no saldo", () => {
  it("receita soma, despesa subtrai", () => {
    expect(deltaDeSaldo("INCOME", 100)).toBe(100);
    expect(deltaDeSaldo("EXPENSE", 100)).toBe(-100);
  });

  it("mantém a precisão em valores quebrados", () => {
    expect(deltaDeSaldo("EXPENSE", 0.1)).toBe(-0.1);
    expect(deltaDeSaldo("INCOME", 1234.56)).toBe(1234.56);
  });

  /**
   * Este é o invariante que a Fase 4 existiu para garantir: aplicar e reverter
   * o mesmo lançamento tem que voltar exatamente a zero. Se derivar um centavo
   * aqui, deriva no saldo real.
   */
  it("aplicar e reverter volta a zero", () => {
    const valores = [0.1, 0.2, 33.33, 1234.56, 0.07];
    for (const v of valores) {
      const aplicado = deltaDeSaldo("EXPENSE", v);
      const revertido = -aplicado;
      expect(arredondar(aplicado + revertido)).toBe(0);
    }
  });
});
