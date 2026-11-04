import { describe, expect, it } from "vitest";
import {
  avaliarTransicao,
  estornoAposPagamento,
  IMUTAVEIS,
  jaAtendido,
  podeEditar,
  podeEstornar,
  podeExcluir,
  resumirEstorno,
  rotulo,
  rotuloCurto,
  TRANSICOES,
} from "@/lib/core/aprovacao";
import type { AprovacaoStatus } from "@/types";

const TODOS: AprovacaoStatus[] = ["ENVIADA", "APROVADA", "REJEITADA", "RESSARCIDA"];

const dono = { papel: "COLABORADOR" as const, ehDono: true };
const outroColaborador = { papel: "COLABORADOR" as const, ehDono: false };
const admin = { papel: "ADMIN" as const, ehDono: false };

describe("o que DEVE funcionar", () => {
  it("admin aprova pedido enviado", () => {
    expect(avaliarTransicao("ENVIADA", "APROVADA", admin).permitida).toBe(true);
  });

  it("admin rejeita com motivo", () => {
    expect(avaliarTransicao("ENVIADA", "REJEITADA", { ...admin, motivo: "falta o recibo" }).permitida).toBe(true);
  });

  it("dono corrige e reenvia o que foi rejeitado", () => {
    expect(avaliarTransicao("REJEITADA", "ENVIADA", dono).permitida).toBe(true);
  });

  it("aprovado vira atendido pelo fechamento de lote", () => {
    expect(avaliarTransicao("APROVADA", "RESSARCIDA", { ...admin, viaLote: true }).permitida).toBe(true);
  });
});

describe("o que NÃO PODE acontecer", () => {
  it("colaborador não aprova o próprio pedido", () => {
    const r = avaliarTransicao("ENVIADA", "APROVADA", dono);
    expect(r.permitida).toBe(false);
    if (!r.permitida) expect(r.motivo).toMatch(/administrador/i);
  });

  it("colaborador não aprova o pedido de outro", () => {
    expect(avaliarTransicao("ENVIADA", "APROVADA", outroColaborador).permitida).toBe(false);
  });

  it("colaborador não marca o próprio pedido como atendido", () => {
    expect(avaliarTransicao("APROVADA", "RESSARCIDA", { ...dono, viaLote: true }).permitida).toBe(false);
  });

  it("rejeição sem motivo é recusada", () => {
    expect(avaliarTransicao("ENVIADA", "REJEITADA", admin).permitida).toBe(false);
    expect(avaliarTransicao("ENVIADA", "REJEITADA", { ...admin, motivo: "   " }).permitida).toBe(false);
  });

  it("ressarcimento fora de lote é recusado, mesmo para o admin", () => {
    const r = avaliarTransicao("APROVADA", "RESSARCIDA", admin);
    expect(r.permitida).toBe(false);
    if (!r.permitida) expect(r.motivo).toMatch(/lote/i);
  });

  it("pedido já atendido não volta atrás por nenhum caminho", () => {
    for (const destino of TODOS) {
      expect(avaliarTransicao("RESSARCIDA", destino, { ...admin, viaLote: true, motivo: "x" }).permitida).toBe(false);
    }
  });

  it("pedido aprovado não é rejeitado depois", () => {
    expect(avaliarTransicao("APROVADA", "REJEITADA", { ...admin, motivo: "mudei de ideia" }).permitida).toBe(false);
  });

  it("não existe transição para o mesmo estado", () => {
    for (const s of TODOS) {
      expect(avaliarTransicao(s, s, { ...admin, viaLote: true, motivo: "x" }).permitida).toBe(false);
    }
  });
});

describe("edição e exclusão", () => {
  it("estado imutável não é editável nem excluível", () => {
    for (const s of IMUTAVEIS) {
      expect(podeEditar(s)).toBe(false);
      expect(podeExcluir(s)).toBe(false);
    }
  });

  it("enviado e rejeitado ainda podem ser corrigidos", () => {
    expect(podeEditar("ENVIADA")).toBe(true);
    expect(podeEditar("REJEITADA")).toBe(true);
  });

  it("lançamento particular é sempre do dono", () => {
    expect(podeEditar(null)).toBe(true);
    expect(podeExcluir(null)).toBe(true);
  });
});

describe("estorno pelo gestor", () => {
  it("vale em toda situação, inclusive a já paga e a particular", () => {
    for (const s of [...TODOS, null]) expect(podeEstornar(s)).toBe(true);
  });

  it("só o já pago exige mexer no lote fechado", () => {
    expect(estornoAposPagamento("RESSARCIDA")).toBe(true);
    for (const s of ["ENVIADA", "APROVADA", "REJEITADA", null] as const) {
      expect(estornoAposPagamento(s)).toBe(false);
    }
  });

  it("o estorno não é uma transição: a máquina continua sem estado de estornado", () => {
    expect(TRANSICOES.some((t) => String(t.para).includes("ESTORN"))).toBe(false);
  });
});

describe("rótulos", () => {
  it("só o atendido conta como atendido", () => {
    expect(jaAtendido("RESSARCIDA")).toBe(true);
    for (const s of ["ENVIADA", "APROVADA", "REJEITADA"] as AprovacaoStatus[]) {
      expect(jaAtendido(s)).toBe(false);
    }
    expect(jaAtendido(null)).toBe(false);
  });

  it("todo estado tem rótulo, inclusive o particular", () => {
    for (const s of [...TODOS, null]) {
      expect(rotulo(s).length).toBeGreaterThan(0);
      expect(rotuloCurto(s).length).toBeGreaterThan(0);
    }
  });

  it("o atendido é anunciado como tal, sem ambiguidade", () => {
    expect(rotulo("RESSARCIDA")).toMatch(/atendida/i);
  });
});

describe("integridade da máquina", () => {
  it("não há duas regras para o mesmo par de estados", () => {
    const pares = TRANSICOES.map((t) => `${t.de}->${t.para}`);
    expect(pares.length).toBe(new Set(pares).size);
  });

  it("todo estado alcançável a partir de ENVIADA", () => {
    const alcancados = new Set<AprovacaoStatus>(["ENVIADA"]);
    for (let i = 0; i < TRANSICOES.length; i++) {
      for (const t of TRANSICOES) if (alcancados.has(t.de)) alcancados.add(t.para);
    }
    for (const s of TODOS) expect(alcancados.has(s)).toBe(true);
  });
});

describe("o estorno que vai para a tela", () => {
  /** O que importa de um Timestamp do Firestore: classe com `toDate()`. */
  class TimestampFalso {
    toDate() {
      return new Date(0);
    }
  }

  const estorno = {
    id: "u1-t1",
    userId: "u1",
    userName: "José Carlos",
    description: "Combustível",
    amount: 2000,
    date: new Date("2026-11-03T12:00:00Z"),
    aprovacaoNaEpoca: "APROVADA" as const,
    paymentBatchId: null,
    motivo: "Lançado em duplicidade",
    estornadoPor: "admin",
    estornadoPorNome: "Luciano",
    estornadoEm: new Date("2026-11-04T10:00:00Z"),
    original: { description: "Combustível", date: new TimestampFalso(), createdAt: new TimestampFalso() },
  };

  it("deixa a cópia do documento para trás e leva todo o resto", () => {
    const resumo = resumirEstorno(estorno);
    expect("original" in resumo).toBe(false);
    const { original: _original, ...esperado } = estorno;
    void _original;
    expect(resumo).toEqual(esperado);
  });

  it("não carrega nenhuma classe além de Date — é o que o Next aceita na fronteira servidor → tela", () => {
    const temClasseEstranha = (v: unknown): boolean => {
      if (v === null || typeof v !== "object") return false;
      if (v instanceof Date) return false;
      if (Array.isArray(v)) return v.some(temClasseEstranha);
      if (Object.getPrototypeOf(v) !== Object.prototype) return true;
      return Object.values(v).some(temClasseEstranha);
    };
    expect(temClasseEstranha(estorno)).toBe(true); // o cru quebraria
    expect(temClasseEstranha(resumirEstorno(estorno))).toBe(false);
  });

  it("não altera o estorno original", () => {
    resumirEstorno(estorno);
    expect(estorno.original.date).toBeInstanceOf(TimestampFalso);
  });
});
