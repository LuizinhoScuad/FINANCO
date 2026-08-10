import "server-only";
import { Timestamp, type CollectionReference, type DocumentReference } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase-admin";
import { requireActiveUser } from "@/lib/auth";

/**
 * Fundação da camada de dados: caminhos, conversão e semeadura.
 *
 * Substitui o `lib/db.ts`, que imitava a interface do Prisma, era exportado como
 * `any` e carregava coleções inteiras para filtrar em memória.
 */

export type Escopo = {
  uid: string;
  raiz: DocumentReference;
  accounts: CollectionReference;
  categories: CollectionReference;
  budgets: CollectionReference;
  transactions: CollectionReference;
};

/**
 * Ponto único onde o identificador do usuário vira caminho no banco.
 *
 * Usa `requireActiveUser`, não apenas "está autenticado": passar por aqui exige
 * conta liberada. Como TODO acesso a dado pessoal atravessa esta função, a
 * verificação de status fica garantida em um lugar só — as actions de Contas,
 * Categorias e Orçamentos não precisam repetir a checagem e não podem esquecê-la
 * (Art. 5). Apontado pela auditoria da Fase 9.
 */
export async function escopo(): Promise<Escopo> {
  const { uid } = await requireActiveUser();
  return escopoDe(uid);
}

export function escopoDe(uid: string): Escopo {
  const raiz = adminDb.collection("users").doc(uid);
  return {
    uid,
    raiz,
    accounts: raiz.collection("accounts"),
    categories: raiz.collection("categories"),
    budgets: raiz.collection("budgets"),
    transactions: raiz.collection("transactions"),
  };
}

// --- conversão ---------------------------------------------------------------

export function paraData(valor: unknown): Date {
  if (valor instanceof Date) return valor;
  if (valor instanceof Timestamp) return valor.toDate();
  if (typeof valor === "string") {
    const d = new Date(valor);
    if (!Number.isNaN(d.getTime())) return d;
  }
  return new Date();
}

export function paraDataOuNulo(valor: unknown): Date | null {
  if (valor === null || valor === undefined) return null;
  return paraData(valor);
}

export function texto(valor: unknown, padrao = ""): string {
  return valor === null || valor === undefined ? padrao : String(valor);
}

export function textoOuNulo(valor: unknown): string | null {
  return valor ? String(valor) : null;
}

export function numero(valor: unknown, padrao = 0): number {
  const n = Number(valor);
  return Number.isFinite(n) ? n : padrao;
}

// --- semeadura ---------------------------------------------------------------

const CATEGORIAS_DESPESA = [
  { name: "Alimentacao", icon: "🍔", color: "#f59e0b" },
  { name: "Transporte", icon: "🚗", color: "#60a5fa" },
  { name: "Saude", icon: "🏥", color: "#34d399" },
  { name: "Moradia", icon: "🏠", color: "#f97316" },
  { name: "Lazer", icon: "🎬", color: "#a78bfa" },
  { name: "Vestuario", icon: "👕", color: "#fb7185" },
  { name: "Educacao", icon: "📚", color: "#22d3ee" },
  { name: "Eletronicos", icon: "📱", color: "#6366f1" },
  { name: "Mercado", icon: "🛒", color: "#84cc16" },
  { name: "Outros", icon: "🔧", color: "#6b7a99" },
];

const CATEGORIAS_RECEITA = [
  { name: "Salario", icon: "💰", color: "#00d98b" },
  { name: "Freelance", icon: "💼", color: "#00d98b" },
  { name: "Investimentos", icon: "📈", color: "#00d98b" },
  { name: "Outros", icon: "✨", color: "#00d98b" },
];

/**
 * Cria categorias e conta iniciais na primeira vez — uma vez só.
 *
 * A versão anterior usava um cache em memória para evitar repetir a semeadura.
 * O problema: cada instância do servidor tem o seu próprio cache, então duas
 * instâncias subindo ao mesmo tempo podiam semear em duplicidade (28 categorias
 * em vez de 14). Agora a marca `seeded` fica no documento do usuário e é lida e
 * escrita dentro da mesma transação — dois processos concorrentes, um só efeito.
 */
export async function garantirSemeadura(esc: Escopo): Promise<void> {
  const marca = await esc.raiz.get();
  if (marca.exists && marca.data()?.seeded === true) return;

  const [temCategorias, temContas] = await Promise.all([
    esc.categories.limit(1).get(),
    esc.accounts.limit(1).get(),
  ]);

  await adminDb.runTransaction(async (t) => {
    const atual = await t.get(esc.raiz);
    if (atual.exists && atual.data()?.seeded === true) return; // outro processo chegou antes

    const agora = new Date();

    if (temCategorias.empty) {
      for (const c of CATEGORIAS_DESPESA) {
        t.set(esc.categories.doc(), { ...c, type: "EXPENSE", createdAt: agora });
      }
      for (const c of CATEGORIAS_RECEITA) {
        t.set(esc.categories.doc(), { ...c, type: "INCOME", createdAt: agora });
      }
    }

    if (temContas.empty) {
      t.set(esc.accounts.doc(), {
        name: "Carteira",
        type: "CASH",
        color: "#00d98b",
        balance: 0,
        createdAt: agora,
        updatedAt: agora,
      });
    }

    t.set(esc.raiz, { seeded: true, updatedAt: agora }, { merge: true });
  });
}

/** Escopo já semeado — porta de entrada dos repositórios. */
export async function escopoPronto(): Promise<Escopo> {
  const esc = await escopo();
  await garantirSemeadura(esc);
  return esc;
}
