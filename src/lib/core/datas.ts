/**
 * Dia de calendário — fonte ÚNICA da regra de data do sistema.
 *
 * O PROBLEMA QUE ISTO RESOLVE. A data de um lançamento não é um instante: é um
 * dia do calendário ("gastei no dia 1º"). Ela era gravada com `new Date("2026-08-01")`,
 * que o JavaScript interpreta como **meia-noite em UTC**. O servidor roda em UTC
 * e mostrava 01/08; o navegador de quem está no Brasil (UTC-3) mostrava a mesma
 * marca como **31/07**. Filtrar "de 01/08 a 31/08" pelo que se vê na tela então
 * deixava de fora justamente o lançamento da virada — ele sumia da lista e,
 * junto com ele, o valor sumia dos totais. Foi assim que um lançamento de
 * R$ 37,00 deixou de ser somado no relatório de aprovados a pagar.
 *
 * A REGRA, agora em um lugar só:
 *
 *   - dia de calendário é gravado ao **meio-dia UTC**. Meio-dia dá 11 horas de
 *     folga para cada lado: nenhum fuso de UTC-11 a UTC+11 — o Brasil inteiro
 *     com sobra — empurra a marca para outro dia;
 *   - as fronteiras de período são **UTC**, não do fuso de quem executa. O mesmo
 *     filtro dá o mesmo resultado no servidor em UTC e na máquina do Luiz em
 *     Brasília — antes não dava;
 *   - a exibição de um dia de calendário é feita **em UTC**, e não no fuso do
 *     navegador. É isso que faz o dia digitado ser o dia mostrado.
 *
 * O histórico gravado à meia-noite UTC continua correto sem migração: 00:00Z e
 * 12:00Z caem no mesmo dia quando lidos em UTC, e ambos ficam dentro das
 * fronteiras deste módulo (Art. 10).
 *
 * Função pura: não toca banco, não depende de sessão — testada sem emulador.
 */

const ISO_DIA = /^(\d{4})-(\d{2})-(\d{2})$/;

/** `true` para "2026-08-01"; `false` para qualquer outra coisa. */
export function ehDiaISO(valor: unknown): valor is string {
  return typeof valor === "string" && ISO_DIA.test(valor);
}

/**
 * "2026-08-01" → instante gravável (2026-08-01T12:00:00Z).
 *
 * Aceita também um texto com hora (`2026-08-01T14:30`), caso em que só o dia é
 * aproveitado: quem informa a data de um gasto informa o dia, não o horário.
 */
export function diaDeCalendario(entrada: string | Date): Date {
  if (entrada instanceof Date) {
    return new Date(
      Date.UTC(entrada.getUTCFullYear(), entrada.getUTCMonth(), entrada.getUTCDate(), 12, 0, 0, 0),
    );
  }
  const dia = entrada.slice(0, 10);
  const m = ISO_DIA.exec(dia);
  if (!m) throw new Error(`Data inválida: ${entrada}`);
  return new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12, 0, 0, 0));
}

/** Primeiro instante do dia, em UTC. Fronteira INICIAL de qualquer período. */
export function inicioDoDia(dia: string): Date {
  const m = ISO_DIA.exec(dia.slice(0, 10));
  if (!m) throw new Error(`Data inválida: ${dia}`);
  return new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 0, 0, 0, 0));
}

/** Último instante do dia, em UTC. Fronteira FINAL — inclui o dia inteiro. */
export function fimDoDia(dia: string): Date {
  const m = ISO_DIA.exec(dia.slice(0, 10));
  if (!m) throw new Error(`Data inválida: ${dia}`);
  return new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 23, 59, 59, 999));
}

/** Fronteiras de um período, tolerando texto vazio ou inválido (vira `undefined`). */
export function periodo(desde?: string, ate?: string): { desde?: Date; ate?: Date } {
  return {
    desde: ehDiaISO(desde?.slice(0, 10)) ? inicioDoDia(desde!) : undefined,
    ate: ehDiaISO(ate?.slice(0, 10)) ? fimDoDia(ate!) : undefined,
  };
}

/** Mês inteiro, de fronteira a fronteira, em UTC. */
export function intervaloDoMes(mes: number, ano: number): { start: Date; end: Date } {
  return {
    start: new Date(Date.UTC(ano, mes - 1, 1, 0, 0, 0, 0)),
    end: new Date(Date.UTC(ano, mes, 0, 23, 59, 59, 999)),
  };
}

/** Instante → "2026-08-01" (o dia lido em UTC), pronto para `<input type="date">`. */
export function paraCampoDeData(d: Date | string): string {
  const data = d instanceof Date ? d : new Date(d);
  return data.toISOString().slice(0, 10);
}

/**
 * Hoje segundo o RELÓGIO DE QUEM ESTÁ USANDO — para preencher formulário e para
 * calcular atalhos de período ("este mês").
 *
 * Usa os componentes locais de propósito: `toISOString().slice(0,10)` devolvia o
 * dia seguinte para quem lançasse um gasto depois das 21h no Brasil.
 */
export function hojeNoCampo(agora = new Date()): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${agora.getFullYear()}-${p(agora.getMonth() + 1)}-${p(agora.getDate())}`;
}

/** Soma dias a um dia de calendário, sem sair do calendário. */
export function somarDias(dia: string, dias: number): string {
  const d = inicioDoDia(dia);
  d.setUTCDate(d.getUTCDate() + dias);
  return paraCampoDeData(d);
}

/** Primeiro dia do mês de um dia de calendário. */
export function primeiroDiaDoMes(dia: string): string {
  return `${dia.slice(0, 7)}-01`;
}

/** Último dia do mês de um dia de calendário. */
export function ultimoDiaDoMes(dia: string): string {
  const d = inicioDoDia(dia);
  return paraCampoDeData(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)));
}

export type AtalhoDePeriodo = { id: string; texto: string; desde: string; ate: string };

/**
 * Os atalhos de período das telas — "este mês", "últimos 30 dias" e companhia.
 *
 * Vivem aqui, e não na tela, porque Relatórios e Aprovados precisam dos mesmos:
 * dois lugares calculando "mês passado" por conta própria é o começo de dois
 * resultados diferentes para a mesma pergunta.
 *
 * Calculados pelo relógio de QUEM USA — é o dia dele que define "hoje".
 */
export function atalhosDePeriodo(agora = new Date()): AtalhoDePeriodo[] {
  const hoje = hojeNoCampo(agora);
  const mesPassado = somarDias(primeiroDiaDoMes(hoje), -1);

  return [
    { id: "mes", texto: "Este mês", desde: primeiroDiaDoMes(hoje), ate: ultimoDiaDoMes(hoje) },
    {
      id: "mes-passado",
      texto: "Mês passado",
      desde: primeiroDiaDoMes(mesPassado),
      ate: ultimoDiaDoMes(mesPassado),
    },
    { id: "30", texto: "Últimos 30 dias", desde: somarDias(hoje, -29), ate: hoje },
    { id: "90", texto: "Últimos 90 dias", desde: somarDias(hoje, -89), ate: hoje },
    { id: "ano", texto: "Este ano", desde: `${hoje.slice(0, 4)}-01-01`, ate: `${hoje.slice(0, 4)}-12-31` },
  ];
}
