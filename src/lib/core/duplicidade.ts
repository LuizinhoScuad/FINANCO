import { paraCentavos } from "@/lib/core/money";

/**
 * O que conta como lançamento gêmeo — fonte ÚNICA da regra (D20).
 *
 * Mesma pessoa, mesmo valor em centavos, mesmo dia de calendário lido em UTC
 * (a regra de data de `datas.ts`). Nada de descrição ou categoria: o mesmo
 * gasto digitado duas vezes raramente sai com a mesma descrição, e é
 * justamente esse o caso que escapava.
 *
 * Função pura: o servidor a usa antes de gravar e as telas a usam sobre a
 * lista já carregada — os dois nunca discordam sobre o que é gêmeo.
 */

export type CandidatoADuplicidade = {
  id?: string;
  userId?: string;
  amount: number;
  date: Date | string;
};

function diaUTC(d: Date | string): string {
  const data = d instanceof Date ? d : new Date(d);
  return Number.isNaN(data.getTime()) ? "" : data.toISOString().slice(0, 10);
}

export function saoGemeos(a: CandidatoADuplicidade, b: CandidatoADuplicidade): boolean {
  if (a.id && b.id && a.id === b.id) return false;
  if (a.userId && b.userId && a.userId !== b.userId) return false;
  const dia = diaUTC(a.date);
  return dia !== "" && dia === diaUTC(b.date) && paraCentavos(a.amount) === paraCentavos(b.amount);
}

/** Os da lista que são gêmeos do candidato. */
export function semelhantes<T extends CandidatoADuplicidade>(candidato: CandidatoADuplicidade, lista: T[]): T[] {
  return lista.filter((item) => saoGemeos(candidato, item));
}

/**
 * Ids de quem tem pelo menos um gêmeo dentro da lista.
 *
 * Agrupa por pessoa + dia + centavos: custo linear, e o par aparece nos dois
 * lados — é o que a fila precisa para marcar ambos.
 */
export function marcarDuplicidades<T extends CandidatoADuplicidade & { id: string }>(lista: T[]): Set<string> {
  const grupos = new Map<string, string[]>();
  for (const item of lista) {
    const chave = `${item.userId ?? ""}|${diaUTC(item.date)}|${paraCentavos(item.amount)}`;
    grupos.set(chave, [...(grupos.get(chave) ?? []), item.id]);
  }
  const marcados = new Set<string>();
  for (const ids of grupos.values()) {
    if (ids.length > 1) for (const id of ids) marcados.add(id);
  }
  return marcados;
}
