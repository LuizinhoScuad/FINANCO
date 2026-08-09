import type { AprovacaoStatus, UserRole } from "@/types";

/**
 * Máquina de estados do reembolso — fonte ÚNICA da regra.
 *
 * Herdada do módulo de ressarcimento anterior, com uma diferença: não existe
 * mais RASCUNHO. Em Transações, registrar e pedir são o mesmo gesto — o
 * lançamento marcado como reembolso já nasce ENVIADA.
 *
 * Função pura de propósito: não toca banco, não depende de sessão, e por isso é
 * testada sem emulador (Art. 7).
 *
 *   ENVIADA ──> APROVADA ──> RESSARCIDA   (só pelo fechamento de lote)
 *      │
 *      └──────> REJEITADA ──> ENVIADA     (corrige e reenvia)
 */

export type Transicao = {
  de: AprovacaoStatus;
  para: AprovacaoStatus;
  /** Quem pode disparar: o dono do lançamento ou o administrador. */
  quem: "DONO" | "ADMIN";
  /** Exige motivo escrito. */
  exigeMotivo?: boolean;
  /** Só acontece pelo fechamento de lote, nunca pedido a pedido. */
  somenteViaLote?: boolean;
};

export const TRANSICOES: readonly Transicao[] = [
  { de: "REJEITADA", para: "ENVIADA", quem: "DONO" },
  { de: "ENVIADA", para: "APROVADA", quem: "ADMIN" },
  { de: "ENVIADA", para: "REJEITADA", quem: "ADMIN", exigeMotivo: true },
  { de: "APROVADA", para: "RESSARCIDA", quem: "ADMIN", somenteViaLote: true },
] as const;

/**
 * Estados em que o dono ainda pode mexer no lançamento.
 *
 * ENVIADA entra aqui de propósito: o gestor ainda não decidiu nada, e travar a
 * correção de um valor digitado errado só produziria pedidos rejeitados de
 * propósito para poder consertar.
 */
export const EDITAVEIS: readonly AprovacaoStatus[] = ["ENVIADA", "REJEITADA"] as const;

/** Estados que não mudam mais o valor: nenhuma edição os alcança. */
export const IMUTAVEIS: readonly AprovacaoStatus[] = ["APROVADA", "RESSARCIDA"] as const;

/** Já foi atendido: o dinheiro voltou para a pessoa. */
export function jaAtendido(status: AprovacaoStatus | null): boolean {
  return status === "RESSARCIDA";
}

/**
 * Um lançamento particular (`aprovacao` nula) é sempre editável — o dono manda
 * no que é dele. O pedido de reembolso obedece à máquina.
 */
export function podeEditar(status: AprovacaoStatus | null): boolean {
  return status === null || EDITAVEIS.includes(status);
}

export function podeExcluir(status: AprovacaoStatus | null): boolean {
  return podeEditar(status);
}

export type ResultadoTransicao =
  | { permitida: true; transicao: Transicao }
  | { permitida: false; motivo: string };

export function avaliarTransicao(
  de: AprovacaoStatus,
  para: AprovacaoStatus,
  contexto: { papel: UserRole; ehDono: boolean; motivo?: string | null; viaLote?: boolean },
): ResultadoTransicao {
  const transicao = TRANSICOES.find((t) => t.de === de && t.para === para);

  if (!transicao) {
    return {
      permitida: false,
      motivo:
        de === para
          ? "O pedido já está nessa situação."
          : `Não é possível ir de ${rotulo(de)} para ${rotulo(para)}.`,
    };
  }

  if (transicao.quem === "ADMIN" && contexto.papel !== "ADMIN") {
    return { permitida: false, motivo: "Somente o administrador pode fazer isso." };
  }

  if (transicao.quem === "DONO" && !contexto.ehDono) {
    return { permitida: false, motivo: "Somente quem registrou o lançamento pode fazer isso." };
  }

  if (transicao.exigeMotivo && !contexto.motivo?.trim()) {
    return { permitida: false, motivo: "Informe o motivo da rejeição." };
  }

  if (transicao.somenteViaLote && !contexto.viaLote) {
    return {
      permitida: false,
      motivo: "O reembolso acontece pelo fechamento de lote, não pedido a pedido.",
    };
  }

  return { permitida: true, transicao };
}

export function rotulo(status: AprovacaoStatus | null): string {
  if (status === null) return "Particular";
  const mapa: Record<AprovacaoStatus, string> = {
    ENVIADA: "Aguardando aprovação",
    APROVADA: "Aprovada — a pagar",
    REJEITADA: "Rejeitada",
    RESSARCIDA: "Já atendida",
  };
  return mapa[status];
}

/** Rótulo curto, para caber na tabela do PDF e na coluna estreita do celular. */
export function rotuloCurto(status: AprovacaoStatus | null): string {
  if (status === null) return "Particular";
  const mapa: Record<AprovacaoStatus, string> = {
    ENVIADA: "Aguardando",
    APROVADA: "A pagar",
    REJEITADA: "Rejeitada",
    RESSARCIDA: "Atendida",
  };
  return mapa[status];
}

export function corDoStatus(status: AprovacaoStatus | null): { cor: string; fundo: string } {
  if (status === null) return { cor: "#6b7a99", fundo: "rgba(107, 122, 153, 0.12)" };
  const mapa: Record<AprovacaoStatus, { cor: string; fundo: string }> = {
    ENVIADA: { cor: "#ffc107", fundo: "rgba(255, 193, 7, 0.12)" },
    APROVADA: { cor: "#60a5fa", fundo: "rgba(96, 165, 250, 0.12)" },
    REJEITADA: { cor: "#ff4d6d", fundo: "rgba(255, 77, 109, 0.12)" },
    RESSARCIDA: { cor: "#00d98b", fundo: "rgba(0, 217, 139, 0.12)" },
  };
  return mapa[status];
}
