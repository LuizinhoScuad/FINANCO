/**
 * Aritmética monetária.
 *
 * Dinheiro em ponto flutuante mente: `0.1 + 0.2` vale `0.30000000000000004`.
 * Some algumas centenas de lançamentos e o saldo deriva alguns centavos — o
 * bastante para o total de um ressarcimento não bater com a soma das despesas,
 * e para a equipe perder a confiança no sistema.
 *
 * O módulo de ressarcimento guarda tudo em CENTAVOS (inteiro), onde esse erro
 * não existe. O módulo pessoal ainda guarda em reais (decimal) por continuidade
 * (Art. 10); as funções `arredondar` e `somar` existem para conter a deriva lá
 * enquanto isso.
 */

/** Reais → centavos. `12.34` → `1234` */
export function paraCentavos(reais: number): number {
  return Math.round(reais * 100);
}

/** Centavos → reais. `1234` → `12.34` */
export function paraReais(centavos: number): number {
  return centavos / 100;
}

/** Arredonda para 2 casas sem o erro de `toFixed` em valores como 1.005. */
export function arredondar(valor: number): number {
  return Math.round((valor + Number.EPSILON) * 100) / 100;
}

/** Soma valores decimais em centavos, devolvendo em reais. */
export function somar(...valores: number[]): number {
  return paraReais(valores.reduce((acc, v) => acc + paraCentavos(v), 0));
}

/**
 * Efeito de um lançamento sobre o saldo da conta.
 *
 * Fonte única desta regra: antes ela aparecia repetida em quatro lugares de
 * `actions/transactions.ts`, e bastava um sinal trocado num deles para o saldo
 * derivar sem ninguém notar.
 */
export function deltaDeSaldo(tipo: string, valor: number): number {
  return arredondar(tipo === "INCOME" ? valor : -valor);
}

export function formatarCentavos(centavos: number): string {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(
    paraReais(centavos),
  );
}
