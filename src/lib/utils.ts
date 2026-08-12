import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";
import { intervaloDoMes } from "@/lib/core/datas";

export function cn(...inputs: ClassValue[]) {
    return twMerge(clsx(inputs));
}

export function formatCurrency(value: number | string | null | undefined): string {
    const num = typeof value === "string" ? parseFloat(value) : (value ?? 0);
    return new Intl.NumberFormat("pt-BR", {
        style: "currency",
        currency: "BRL",
    }).format(num);
}

/**
 * Dia de calendário — a data de um lançamento, de um período, de um pedido.
 *
 * Formatado em UTC de propósito: o dia é gravado ao meio-dia UTC (ver
 * `lib/core/datas.ts`) e é assim que o dia digitado continua sendo o dia
 * mostrado, no servidor e no navegador de quem está no Brasil. Formatar no fuso
 * local exibia 31/07 para o lançamento do dia 1º — e era isso que fazia o
 * filtro de período parecer que "come" um lançamento.
 */
export function formatDate(date: string | Date): string {
    return new Intl.DateTimeFormat("pt-BR", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        timeZone: "UTC",
    }).format(new Date(date));
}

/**
 * Carimbo de acontecimento — pago em, aprovado em, último acesso.
 *
 * Aqui o instante importa, então vale o fuso de quem lê. Não confundir com
 * `formatDate`: aquele é dia de calendário, este é momento no tempo.
 */
export function formatDateTime(date: string | Date): string {
    return new Intl.DateTimeFormat("pt-BR", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
    }).format(new Date(date));
}

export function formatMonth(month: number, year: number): string {
    return new Intl.DateTimeFormat("pt-BR", {
        month: "long",
        year: "numeric",
    }).format(new Date(year, month - 1));
}

export function currentMonth(): { month: number; year: number } {
    const now = new Date();
    return { month: now.getMonth() + 1, year: now.getFullYear() };
}

/**
 * Fronteiras do mês — em UTC, para casar com o dia de calendário gravado.
 *
 * Calculadas no fuso local, a mesma consulta devolvia conjuntos diferentes na
 * máquina de quem desenvolve (UTC-3) e no servidor (UTC): o lançamento do dia 1º
 * ficava de fora aqui e dentro lá.
 */
export function getMonthRange(month: number, year: number): { start: Date; end: Date } {
    return intervaloDoMes(month, year);
}
