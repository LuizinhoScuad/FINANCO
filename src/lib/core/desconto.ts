import { arredondar } from "@/lib/core/money";

/**
 * Desconto de valor já pago — fonte ÚNICA da regra (D22, RF-73 a RF-77).
 *
 * O desconto é um pedido de reembolso com valor NEGATIVO. O sinal mora no
 * próprio `amount` de propósito: assim toda soma que já existe (prévia, lote,
 * Aprovados, Relatórios, PDF, XLSX) abate sem precisar lembrar de um campo à
 * parte. Esquecer um sinal numa soma é o erro silencioso que o Art. 2 proíbe.
 *
 * Função pura: não toca banco, não depende de sessão.
 */

/** O que a pessoa digita (positivo) → o que é gravado (negativo). */
export function valorDeDesconto(digitado: number): number {
  if (!Number.isFinite(digitado) || digitado <= 0) {
    throw new Error("O valor do desconto precisa ser maior que zero.");
  }
  return -arredondar(digitado);
}

export function ehDesconto(l: { desconto?: boolean | null }): boolean {
  return l.desconto === true;
}

/** O selo que fila, Aprovados e Relatórios mostram no lugar de "sem comprovante". */
export const ROTULO_DE_DESCONTO = "desconto · já pago antes";

/**
 * O lote pode fechar com este total?
 *
 * Negativo, não: seria a empresa cobrando a pessoa pelo fechamento — isso se
 * resolve deixando o desconto para o próximo lote. Zero, sim: a pessoa
 * compensou exatamente o que devia e o registro do fechamento vale como prova.
 */
export function loteFechaComTotal(totalCents: number): { ok: true } | { ok: false; motivo: string } {
  if (!Number.isInteger(totalCents)) {
    return { ok: false, motivo: "Total do lote inválido." };
  }
  if (totalCents < 0) {
    return {
      ok: false,
      motivo:
        "Os descontos superam os pedidos aprovados deste período. Inclua mais pedidos no período ou deixe o desconto para o próximo fechamento.",
    };
  }
  return { ok: true };
}
