import { describe, expect, it } from "vitest";
import {
  descreverDadosBancarios,
  formatarCPF,
  formatarChavePix,
  lerDadosBancarios,
  normalizarChavePix,
  validarCNPJ,
  validarCPF,
} from "@/lib/core/dados-bancarios";

/**
 * Dados para reembolso.
 *
 * O que estes testes protegem: o pagamento sai por fora do sistema, lido por
 * uma pessoa do financeiro a partir do comprovante. Um CPF com dígito trocado
 * ou uma chave PIX gravada em três formatos diferentes não produzem erro
 * nenhum aqui dentro — produzem depósito na conta errada, ou nenhum depósito.
 */

const CPF_BOM = "52998224725";
const OUTRO_CPF_BOM = "11144477735";

const completo = {
  titular: "Maria Souza",
  cpf: CPF_BOM,
  pixTipo: "EMAIL",
  pixChave: "maria@exemplo.com.br",
  banco: "341 Itaú",
  agencia: "0123",
  conta: "45678-9",
  tipoConta: "CORRENTE",
  atualizadoEm: new Date("2026-09-03T12:00:00.000Z"),
};

describe("o que DEVE funcionar", () => {
  it("aceita CPF válido, com e sem máscara", () => {
    expect(validarCPF(CPF_BOM)).toBe(true);
    expect(validarCPF("529.982.247-25")).toBe(true);
    expect(validarCPF(OUTRO_CPF_BOM)).toBe(true);
  });

  it("aceita CNPJ numérico e o alfanumérico novo", () => {
    expect(validarCNPJ("11222333000181")).toBe(true);
    expect(validarCNPJ("11.222.333/0001-81")).toBe(true);
    expect(validarCNPJ("12ABC34501DE35")).toBe(true);
  });

  it("normaliza a chave por tipo", () => {
    expect(normalizarChavePix("CPF", "529.982.247-25")).toEqual({ ok: true, chave: CPF_BOM });
    expect(normalizarChavePix("EMAIL", "  Maria@Exemplo.COM.br ")).toEqual({
      ok: true,
      chave: "maria@exemplo.com.br",
    });
    expect(normalizarChavePix("ALEATORIA", "3FA85F64-5717-4562-B3FC-2C963F66AFA6")).toEqual({
      ok: true,
      chave: "3fa85f64-5717-4562-b3fc-2c963f66afa6",
    });
  });

  /** O mesmo telefone digitado de quatro jeitos vira uma chave só. */
  it("grava telefone sempre no formato do PIX", () => {
    for (const entrada of ["(11) 91234-5678", "11912345678", "+55 11 91234-5678", "5511912345678"]) {
      expect(normalizarChavePix("TELEFONE", entrada)).toEqual({ ok: true, chave: "+5511912345678" });
    }
  });

  it("aceita telefone fixo, de 10 dígitos", () => {
    expect(normalizarChavePix("TELEFONE", "(11) 3123-4567")).toEqual({
      ok: true,
      chave: "+551131234567",
    });
  });

  it("lê o mapa gravado", () => {
    const d = lerDadosBancarios(completo);
    expect(d).not.toBeNull();
    expect(d?.titular).toBe("Maria Souza");
    expect(d?.pixTipo).toBe("EMAIL");
    expect(d?.conta).toBe("45678-9");
    expect(d?.tipoConta).toBe("CORRENTE");
  });

  it("lê a data em qualquer forma que o Firestore devolva", () => {
    const esperado = new Date("2026-09-03T12:00:00.000Z").getTime();

    expect(lerDadosBancarios(completo)?.atualizadoEm.getTime()).toBe(esperado);
    expect(
      lerDadosBancarios({ ...completo, atualizadoEm: "2026-09-03T12:00:00.000Z" })?.atualizadoEm.getTime(),
    ).toBe(esperado);
    expect(
      lerDadosBancarios({
        ...completo,
        atualizadoEm: { toDate: () => new Date("2026-09-03T12:00:00.000Z") },
      })?.atualizadoEm.getTime(),
    ).toBe(esperado);
  });

  it("descreve os dados para o comprovante", () => {
    const linhas = descreverDadosBancarios(lerDadosBancarios(completo)!);
    const mapa = new Map(linhas.map((l) => [l.rotulo, l.valor]));

    expect(mapa.get("Titular")).toBe("Maria Souza");
    expect(mapa.get("CPF")).toBe("529.982.247-25");
    expect(mapa.get("PIX (E-mail)")).toBe("maria@exemplo.com.br");
    expect(mapa.get("Conta")).toBe("45678-9 (Conta corrente)");
  });

  it("omite a conta bancária quando ela não foi informada", () => {
    const soPix = lerDadosBancarios({
      ...completo,
      banco: null,
      agencia: null,
      conta: null,
      tipoConta: null,
    });

    const rotulos = descreverDadosBancarios(soPix!).map((l) => l.rotulo);
    expect(rotulos).toHaveLength(3);
    expect(rotulos.join(" ")).not.toMatch(/Banco|Agência|Conta/);
  });

  it("formata CPF e telefone para leitura humana", () => {
    expect(formatarCPF(CPF_BOM)).toBe("529.982.247-25");
    expect(formatarChavePix("TELEFONE", "+5511912345678")).toBe("+55 (11) 91234-5678");
    expect(formatarChavePix("EMAIL", "maria@exemplo.com.br")).toBe("maria@exemplo.com.br");
  });
});

describe("o que NÃO PODE acontecer", () => {
  it("recusa CPF com dígito verificador errado", () => {
    expect(validarCPF("52998224724")).toBe(false);
    expect(validarCPF("11144477730")).toBe(false);
  });

  /** O erro clássico de quem preenche por preencher. */
  it("recusa CPF de dígitos repetidos", () => {
    expect(validarCPF("00000000000")).toBe(false);
    expect(validarCPF("11111111111")).toBe(false);
    expect(validarCPF("99999999999")).toBe(false);
  });

  it("recusa CPF com quantidade errada de dígitos", () => {
    expect(validarCPF("5299822472")).toBe(false);
    expect(validarCPF("529982247250")).toBe(false);
    expect(validarCPF("")).toBe(false);
  });

  it("recusa CNPJ inválido", () => {
    expect(validarCNPJ("11222333000182")).toBe(false);
    expect(validarCNPJ("00000000000000")).toBe(false);
    expect(validarCNPJ("112223330001")).toBe(false);
  });

  it("recusa chave que não combina com o tipo escolhido", () => {
    expect(normalizarChavePix("EMAIL", "maria arroba exemplo").ok).toBe(false);
    expect(normalizarChavePix("EMAIL", "maria@exemplo").ok).toBe(false);
    expect(normalizarChavePix("CPF", "52998224724").ok).toBe(false);
    expect(normalizarChavePix("ALEATORIA", "minha-chave-do-banco").ok).toBe(false);
    expect(normalizarChavePix("TELEFONE", "1234").ok).toBe(false);
  });

  it("recusa telefone de outro país", () => {
    expect(normalizarChavePix("TELEFONE", "+1 415 555 0100").ok).toBe(false);
  });

  it("recusa chave vazia", () => {
    expect(normalizarChavePix("EMAIL", "   ").ok).toBe(false);
  });

  /**
   * Meio dado gravado é pior que nenhum: o comprovante sairia com um endereço
   * de pagamento incompleto, que parece válido para quem lê.
   */
  it("lê como 'sem dados' o que está incompleto ou corrompido", () => {
    expect(lerDadosBancarios(undefined)).toBeNull();
    expect(lerDadosBancarios(null)).toBeNull();
    expect(lerDadosBancarios({})).toBeNull();
    expect(lerDadosBancarios("pix: maria@exemplo.com.br")).toBeNull();
    expect(lerDadosBancarios({ ...completo, titular: "" })).toBeNull();
    expect(lerDadosBancarios({ ...completo, cpf: "11111111111" })).toBeNull();
    expect(lerDadosBancarios({ ...completo, pixChave: "" })).toBeNull();
    expect(lerDadosBancarios({ ...completo, pixTipo: "BITCOIN" })).toBeNull();
  });

  it("ignora tipo de conta inventado em vez de propagá-lo", () => {
    expect(lerDadosBancarios({ ...completo, tipoConta: "SALARIO" })?.tipoConta).toBeNull();
  });
});
