import { describe, expect, it } from "vitest";
import {
  diaDeCalendario,
  ehDiaISO,
  fimDoDia,
  hojeNoCampo,
  inicioDoDia,
  intervaloDoMes,
  paraCampoDeData,
  periodo,
  primeiroDiaDoMes,
  somarDias,
  ultimoDiaDoMes,
} from "@/lib/core/datas";
import { formatDate, getMonthRange } from "@/lib/utils";

/**
 * O caso que motivou este arquivo, em uma frase: um lançamento de R$ 37,00
 * sumia dos totais do relatório porque a data gravada à meia-noite UTC era
 * exibida como o dia anterior no navegador brasileiro — e o filtro de período,
 * montado a partir do que se via na tela, passava ao lado dele.
 */

describe("dia de calendário", () => {
  it("grava ao meio-dia UTC — nenhum fuso do planeta muda o dia", () => {
    const d = diaDeCalendario("2026-08-01");
    expect(d.toISOString()).toBe("2026-08-01T12:00:00.000Z");

    // Do Havaí (UTC-10) a Brasília (UTC-3) até a Ásia (UTC+11): dia 1º em todos.
    for (const deslocamento of [-11, -10, -3, 0, 8, 11]) {
      const local = new Date(d.getTime() + deslocamento * 3600_000);
      expect(local.toISOString().slice(0, 10)).toBe("2026-08-01");
    }
  });

  it("ignora a hora quando ela vem junto — o gasto tem dia, não horário", () => {
    expect(diaDeCalendario("2026-08-01T23:45").toISOString()).toBe("2026-08-01T12:00:00.000Z");
  });

  it("recusa texto que não é data", () => {
    expect(() => diaDeCalendario("ontem")).toThrow();
    expect(ehDiaISO("2026-8-1")).toBe(false);
    expect(ehDiaISO("2026-08-01")).toBe(true);
  });
});

describe("fronteiras de período", () => {
  it("abrem e fecham o dia inteiro, em UTC", () => {
    expect(inicioDoDia("2026-08-01").toISOString()).toBe("2026-08-01T00:00:00.000Z");
    expect(fimDoDia("2026-08-31").toISOString()).toBe("2026-08-31T23:59:59.999Z");
  });

  it("abraçam o lançamento do primeiro e do último dia — o que sumia antes", () => {
    const { desde, ate } = periodo("2026-08-01", "2026-08-31");
    const primeiro = diaDeCalendario("2026-08-01");
    const ultimo = diaDeCalendario("2026-08-31");

    expect(primeiro >= desde!).toBe(true);
    expect(primeiro <= ate!).toBe(true);
    expect(ultimo >= desde!).toBe(true);
    expect(ultimo <= ate!).toBe(true);
  });

  it("abraçam também o histórico gravado à meia-noite UTC, sem migração", () => {
    const antigo = new Date("2026-08-01T00:00:00.000Z");
    const { desde, ate } = periodo("2026-08-01", "2026-08-31");
    expect(antigo >= desde! && antigo <= ate!).toBe(true);
  });

  it("deixam de fora o dia seguinte ao fim do período", () => {
    const { ate } = periodo("2026-08-01", "2026-08-31");
    expect(diaDeCalendario("2026-09-01") > ate!).toBe(true);
  });

  it("tratam campo vazio como ausência de recorte", () => {
    expect(periodo("", "")).toEqual({ desde: undefined, ate: undefined });
    expect(periodo(undefined, "2026-08-31").desde).toBeUndefined();
  });
});

describe("mês inteiro", () => {
  it("vai do primeiro instante do dia 1 ao último do último dia", () => {
    const { start, end } = intervaloDoMes(2, 2024); // ano bissexto
    expect(start.toISOString()).toBe("2024-02-01T00:00:00.000Z");
    expect(end.toISOString()).toBe("2024-02-29T23:59:59.999Z");
  });

  it("é o mesmo intervalo que a tela de Transações usa", () => {
    expect(getMonthRange(8, 2026)).toEqual(intervaloDoMes(8, 2026));
  });

  it("inclui o lançamento do dia 1º", () => {
    const { start, end } = intervaloDoMes(8, 2026);
    const primeiro = diaDeCalendario("2026-08-01");
    expect(primeiro >= start && primeiro <= end).toBe(true);
  });
});

describe("exibição", () => {
  it("mostra o dia que foi digitado, não o de véspera", () => {
    expect(formatDate(diaDeCalendario("2026-08-01"))).toBe("01/08/2026");
    // Histórico gravado à meia-noite UTC também aparece no dia certo.
    expect(formatDate(new Date("2026-08-01T00:00:00.000Z"))).toBe("01/08/2026");
  });

  it("volta para o campo de formulário sem perder o dia", () => {
    expect(paraCampoDeData(diaDeCalendario("2026-12-31"))).toBe("2026-12-31");
  });
});

describe("atalhos de período", () => {
  it("hoje segue o relógio de quem usa, não o UTC", () => {
    // 22h no Brasil ainda é hoje — `toISOString()` devolvia o dia seguinte.
    const noite = new Date(2026, 7, 1, 22, 30);
    expect(hojeNoCampo(noite)).toBe("2026-08-01");
  });

  it("caminham pelo calendário sem tropeçar na virada do mês", () => {
    expect(somarDias("2026-03-01", -1)).toBe("2026-02-28");
    expect(somarDias("2024-03-01", -1)).toBe("2024-02-29");
    expect(somarDias("2026-08-15", 30)).toBe("2026-09-14");
    expect(primeiroDiaDoMes("2026-08-15")).toBe("2026-08-01");
    expect(ultimoDiaDoMes("2026-02-10")).toBe("2026-02-28");
    expect(ultimoDiaDoMes("2026-12-01")).toBe("2026-12-31");
  });
});
