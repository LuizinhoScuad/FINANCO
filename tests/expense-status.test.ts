import { describe, expect, it } from "vitest";
import {
  avaliarTransicao,
  IMUTAVEIS,
  podeEditar,
  podeExcluir,
  rotulo,
  TRANSICOES,
} from "@/lib/core/expense-status";
import type { ExpenseStatus } from "@/types";

const TODOS: ExpenseStatus[] = ["RASCUNHO", "ENVIADA", "APROVADA", "REJEITADA", "RESSARCIDA"];

const dono = { papel: "COLABORADOR" as const, ehDono: true };
const outroColaborador = { papel: "COLABORADOR" as const, ehDono: false };
const admin = { papel: "ADMIN" as const, ehDono: false };

describe("máquina de estados — o que DEVE funcionar", () => {
  it("dono envia o rascunho", () => {
    expect(avaliarTransicao("RASCUNHO", "ENVIADA", dono).permitida).toBe(true);
  });

  it("admin aprova despesa enviada", () => {
    expect(avaliarTransicao("ENVIADA", "APROVADA", admin).permitida).toBe(true);
  });

  it("admin rejeita com motivo", () => {
    expect(avaliarTransicao("ENVIADA", "REJEITADA", { ...admin, motivo: "falta o recibo" }).permitida).toBe(true);
  });

  it("dono corrige e reenvia o que foi rejeitado", () => {
    expect(avaliarTransicao("REJEITADA", "ENVIADA", dono).permitida).toBe(true);
  });

  it("aprovada vira ressarcida pelo fechamento de lote", () => {
    expect(avaliarTransicao("APROVADA", "RESSARCIDA", { ...admin, viaLote: true }).permitida).toBe(true);
  });
});

describe("máquina de estados — o que NÃO pode acontecer", () => {
  /** A brecha mais grave que este sistema poderia ter. */
  it("colaborador NÃO aprova a própria despesa", () => {
    const r = avaliarTransicao("ENVIADA", "APROVADA", dono);
    expect(r.permitida).toBe(false);
    if (!r.permitida) expect(r.motivo).toMatch(/administrador/i);
  });

  it("colaborador não mexe na despesa de outro", () => {
    expect(avaliarTransicao("RASCUNHO", "ENVIADA", outroColaborador).permitida).toBe(false);
  });

  it("rejeição sem motivo é recusada", () => {
    const r = avaliarTransicao("ENVIADA", "REJEITADA", admin);
    expect(r.permitida).toBe(false);
    if (!r.permitida) expect(r.motivo).toMatch(/motivo/i);
  });

  it("rejeição com motivo só de espaços é recusada", () => {
    expect(avaliarTransicao("ENVIADA", "REJEITADA", { ...admin, motivo: "   " }).permitida).toBe(false);
  });

  it("não se pula de ENVIADA direto para RESSARCIDA", () => {
    expect(avaliarTransicao("ENVIADA", "RESSARCIDA", { ...admin, viaLote: true }).permitida).toBe(false);
  });

  it("ressarcimento fora do fechamento de lote é recusado", () => {
    const r = avaliarTransicao("APROVADA", "RESSARCIDA", admin);
    expect(r.permitida).toBe(false);
    if (!r.permitida) expect(r.motivo).toMatch(/lote/i);
  });

  it("aprovada não volta atrás", () => {
    expect(avaliarTransicao("APROVADA", "RASCUNHO", admin).permitida).toBe(false);
    expect(avaliarTransicao("APROVADA", "ENVIADA", admin).permitida).toBe(false);
    expect(avaliarTransicao("APROVADA", "REJEITADA", admin).permitida).toBe(false);
  });

  it("ressarcida é o fim da linha — nada sai dela", () => {
    for (const destino of TODOS) {
      expect(avaliarTransicao("RESSARCIDA", destino, { ...admin, viaLote: true }).permitida).toBe(false);
    }
  });

  it("permanecer no mesmo estado não é transição", () => {
    for (const s of TODOS) {
      expect(avaliarTransicao(s, s, admin).permitida).toBe(false);
    }
  });

  /**
   * Varredura completa dos 25 pares possíveis: qualquer caminho que não esteja
   * na tabela precisa ser recusado, com qualquer ator e qualquer contexto.
   * Protege contra alguém acrescentar um estado e esquecer de fechar a regra.
   */
  it("nenhum caminho fora da tabela é aceito, por ninguém", () => {
    const contextos = [
      { ...dono, motivo: "x", viaLote: true },
      { ...outroColaborador, motivo: "x", viaLote: true },
      { ...admin, motivo: "x", viaLote: true },
    ];

    for (const de of TODOS) {
      for (const para of TODOS) {
        if (TRANSICOES.some((t) => t.de === de && t.para === para)) continue;

        for (const ctx of contextos) {
          expect(avaliarTransicao(de, para, ctx).permitida, `${de} → ${para}`).toBe(false);
        }
      }
    }
  });

  /** E o inverso: todo caminho da tabela funciona com o ator certo. */
  it("todo caminho da tabela funciona com o ator correto", () => {
    for (const t of TRANSICOES) {
      const ator = t.quem === "ADMIN" ? admin : dono;
      const r = avaliarTransicao(t.de, t.para, { ...ator, motivo: "motivo válido", viaLote: true });
      expect(r.permitida, `${t.de} → ${t.para} como ${t.quem}`).toBe(true);
    }
  });

  /** E cada caminho recusa o ator errado. */
  it("todo caminho da tabela recusa o ator errado", () => {
    for (const t of TRANSICOES) {
      const errado = t.quem === "ADMIN" ? dono : admin;
      const r = avaliarTransicao(t.de, t.para, { ...errado, motivo: "motivo válido", viaLote: true });
      expect(r.permitida, `${t.de} → ${t.para} como ${errado.papel}`).toBe(false);
    }
  });
});

describe("edição e exclusão", () => {
  it("só rascunho e rejeitada são editáveis", () => {
    expect(podeEditar("RASCUNHO")).toBe(true);
    expect(podeEditar("REJEITADA")).toBe(true);
    expect(podeEditar("ENVIADA")).toBe(false);
    expect(podeEditar("APROVADA")).toBe(false);
    expect(podeEditar("RESSARCIDA")).toBe(false);
  });

  it("o que é imutável não é editável nem excluível", () => {
    for (const s of IMUTAVEIS) {
      expect(podeEditar(s)).toBe(false);
      expect(podeExcluir(s)).toBe(false);
    }
  });
});

describe("apresentação", () => {
  it("todo estado tem rótulo em português", () => {
    for (const s of TODOS) {
      expect(rotulo(s)).toBeTruthy();
      expect(rotulo(s)).not.toBe(s);
    }
  });
});
