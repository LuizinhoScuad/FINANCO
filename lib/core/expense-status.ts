import type { ExpenseStatus, UserRole } from "@/types";

/**
 * Máquina de estados do ressarcimento — fonte ÚNICA da regra.
 *
 * As mesmas transições precisam valer em três lugares: na server action, nas
 * regras do Firestore e nos testes. Escrever a regra três vezes garante que um
 * dia elas discordem, e a discordância entre a action e a regra do banco é
 * exatamente onde nasce a brecha do colaborador aprovar a própria despesa.
 *
 * Este arquivo é função pura de propósito: não toca banco, não depende de
 * sessão, e por isso pode ser testado sem emulador (Art. 7).
 *
 *   RASCUNHO ──> ENVIADA ──> APROVADA ──> RESSARCIDA   (só via lote)
 *                     │
 *                     └───> REJEITADA ──> ENVIADA      (corrige e reenvia)
 */

export type Transicao = {
  de: ExpenseStatus;
  para: ExpenseStatus;
  /** Quem pode disparar: o dono da despesa ou o administrador. */
  quem: "DONO" | "ADMIN";
  /** Exige motivo escrito. */
  exigeMotivo?: boolean;
  /** Só acontece pelo fechamento de lote, nunca despesa a despesa. */
  somenteViaLote?: boolean;
};

export const TRANSICOES: readonly Transicao[] = [
  { de: "RASCUNHO", para: "ENVIADA", quem: "DONO" },
  { de: "REJEITADA", para: "ENVIADA", quem: "DONO" },
  { de: "ENVIADA", para: "APROVADA", quem: "ADMIN" },
  { de: "ENVIADA", para: "REJEITADA", quem: "ADMIN", exigeMotivo: true },
  { de: "APROVADA", para: "RESSARCIDA", quem: "ADMIN", somenteViaLote: true },
] as const;

/** Estados em que o dono ainda pode mexer no conteúdo da despesa. */
export const EDITAVEIS: readonly ExpenseStatus[] = ["RASCUNHO", "REJEITADA"] as const;

/** Estados que não mudam mais o valor: nenhuma edição os alcança. */
export const IMUTAVEIS: readonly ExpenseStatus[] = ["APROVADA", "RESSARCIDA"] as const;

export function podeEditar(status: ExpenseStatus): boolean {
  return EDITAVEIS.includes(status);
}

export function podeExcluir(status: ExpenseStatus): boolean {
  return EDITAVEIS.includes(status);
}

export type ResultadoTransicao =
  | { permitida: true; transicao: Transicao }
  | { permitida: false; motivo: string };

export function avaliarTransicao(
  de: ExpenseStatus,
  para: ExpenseStatus,
  contexto: { papel: UserRole; ehDono: boolean; motivo?: string | null; viaLote?: boolean },
): ResultadoTransicao {
  const transicao = TRANSICOES.find((t) => t.de === de && t.para === para);

  if (!transicao) {
    return {
      permitida: false,
      motivo:
        de === para
          ? "A despesa já está nesse estado."
          : `Não é possível ir de ${rotulo(de)} para ${rotulo(para)}.`,
    };
  }

  if (transicao.quem === "ADMIN" && contexto.papel !== "ADMIN") {
    return { permitida: false, motivo: "Somente o administrador pode fazer isso." };
  }

  if (transicao.quem === "DONO" && !contexto.ehDono) {
    return { permitida: false, motivo: "Somente quem registrou a despesa pode fazer isso." };
  }

  if (transicao.exigeMotivo && !contexto.motivo?.trim()) {
    return { permitida: false, motivo: "Informe o motivo da rejeição." };
  }

  if (transicao.somenteViaLote && !contexto.viaLote) {
    return {
      permitida: false,
      motivo: "O ressarcimento acontece pelo fechamento de lote, não despesa a despesa.",
    };
  }

  return { permitida: true, transicao };
}

export function rotulo(status: ExpenseStatus): string {
  const mapa: Record<ExpenseStatus, string> = {
    RASCUNHO: "Rascunho",
    ENVIADA: "Enviada",
    APROVADA: "Aprovada",
    REJEITADA: "Rejeitada",
    RESSARCIDA: "Ressarcida",
  };
  return mapa[status];
}

export function corDoStatus(status: ExpenseStatus): { cor: string; fundo: string } {
  const mapa: Record<ExpenseStatus, { cor: string; fundo: string }> = {
    RASCUNHO: { cor: "#6b7a99", fundo: "rgba(107, 122, 153, 0.12)" },
    ENVIADA: { cor: "#ffc107", fundo: "rgba(255, 193, 7, 0.12)" },
    APROVADA: { cor: "#60a5fa", fundo: "rgba(96, 165, 250, 0.12)" },
    REJEITADA: { cor: "#ff4d6d", fundo: "rgba(255, 77, 109, 0.12)" },
    RESSARCIDA: { cor: "#00d98b", fundo: "rgba(0, 217, 139, 0.12)" },
  };
  return mapa[status];
}
