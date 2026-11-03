import { describe, expect, it } from "vitest";
import { marcarDuplicidades, saoGemeos, semelhantes } from "@/lib/core/duplicidade";
import { diaDeCalendario } from "@/lib/core/datas";

/**
 * O caso que motivou: dois pedidos iguais lançados no mesmo dia, aprovados em
 * bloco e só notados na hora de pagar. O critério é deliberadamente estreito —
 * mesma pessoa, mesmo valor em centavos, mesmo dia — para alertar sem
 * atrapalhar quem tem despesa legítima repetida.
 */

const dia = diaDeCalendario("2026-11-03");
const meiaNoite = new Date("2026-11-03T00:00:00Z"); // histórico antigo, ainda o mesmo dia
const outroDia = diaDeCalendario("2026-11-04");

describe("o que É gêmeo", () => {
  it("mesmo valor e mesmo dia", () => {
    expect(saoGemeos({ amount: 37, date: dia }, { amount: 37, date: dia })).toBe(true);
  });

  it("meia-noite e meio-dia UTC são o mesmo dia de calendário", () => {
    expect(saoGemeos({ amount: 37, date: dia }, { amount: 37, date: meiaNoite })).toBe(true);
  });

  it("valor igual com deriva de ponto flutuante continua igual", () => {
    expect(saoGemeos({ amount: 0.1 + 0.2, date: dia }, { amount: 0.3, date: dia })).toBe(true);
  });

  it("a data pode vir como texto ISO", () => {
    expect(saoGemeos({ amount: 37, date: "2026-11-03T12:00:00.000Z" }, { amount: 37, date: dia })).toBe(true);
  });
});

describe("o que NÃO é gêmeo", () => {
  it("um centavo de diferença", () => {
    expect(saoGemeos({ amount: 37, date: dia }, { amount: 37.01, date: dia })).toBe(false);
  });

  it("dia diferente", () => {
    expect(saoGemeos({ amount: 37, date: dia }, { amount: 37, date: outroDia })).toBe(false);
  });

  it("pessoas diferentes nunca são gêmeas", () => {
    expect(saoGemeos({ userId: "a", amount: 37, date: dia }, { userId: "b", amount: 37, date: dia })).toBe(false);
  });

  it("o lançamento não é gêmeo de si mesmo", () => {
    expect(saoGemeos({ id: "x", amount: 37, date: dia }, { id: "x", amount: 37, date: dia })).toBe(false);
  });

  it("data inválida não casa com nada", () => {
    expect(saoGemeos({ amount: 37, date: "quando?" }, { amount: 37, date: dia })).toBe(false);
  });
});

describe("semelhantes", () => {
  it("devolve só os gêmeos do candidato, sem ele mesmo", () => {
    const lista = [
      { id: "1", amount: 37, date: dia },
      { id: "2", amount: 37, date: dia },
      { id: "3", amount: 12, date: dia },
      { id: "4", amount: 37, date: outroDia },
    ];
    expect(semelhantes({ id: "1", amount: 37, date: dia }, lista).map((l) => l.id)).toEqual(["2"]);
    expect(semelhantes({ amount: 37, date: dia }, lista).map((l) => l.id)).toEqual(["1", "2"]);
  });
});

describe("marcarDuplicidades", () => {
  it("marca os dois lados do par e deixa o resto em paz", () => {
    const marcados = marcarDuplicidades([
      { id: "a", userId: "u1", amount: 37, date: dia },
      { id: "b", userId: "u1", amount: 37, date: dia },
      { id: "c", userId: "u1", amount: 12, date: dia },
      { id: "d", userId: "u2", amount: 37, date: dia }, // outra pessoa
    ]);
    expect([...marcados].sort()).toEqual(["a", "b"]);
  });

  it("trio é marcado inteiro", () => {
    const marcados = marcarDuplicidades([
      { id: "a", userId: "u1", amount: 5, date: dia },
      { id: "b", userId: "u1", amount: 5, date: dia },
      { id: "c", userId: "u1", amount: 5, date: dia },
    ]);
    expect(marcados.size).toBe(3);
  });

  it("lista vazia ou sem pares não marca nada", () => {
    expect(marcarDuplicidades([]).size).toBe(0);
    expect(marcarDuplicidades([{ id: "a", userId: "u1", amount: 5, date: dia }]).size).toBe(0);
  });
});
