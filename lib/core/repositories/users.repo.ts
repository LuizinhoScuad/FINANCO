import "server-only";
import { Timestamp } from "firebase-admin/firestore";
import { adminAuth, adminDb } from "@/lib/firebase-admin";
import type { UserProfile, UserRole, UserStatus } from "@/types";

/**
 * Repositório de usuários — primeiro do projeto, e molde para os demais.
 *
 * Cada usuário vive em dois lugares que precisam concordar:
 *   • custom claims no Firebase Auth → o que as regras do Storage enxergam
 *   • documento users/{uid} no Firestore → o que o painel administrativo mostra
 *
 * Este módulo é o único lugar que escreve nos dois. Manter isso concentrado
 * aqui é o que impede os dois lados de divergirem.
 */

const colecao = () => adminDb.collection("users");

function paraData(valor: unknown): Date | null {
  if (!valor) return null;
  if (valor instanceof Date) return valor;
  if (valor instanceof Timestamp) return valor.toDate();
  if (typeof valor === "string") {
    const d = new Date(valor);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  return null;
}

function paraPerfil(uid: string, dados: Record<string, unknown>): Omit<UserProfile, "lastSignInAt"> {
  return {
    uid,
    name: String(dados.name ?? dados.email ?? "Sem nome"),
    email: dados.email ? String(dados.email) : null,
    role: dados.role === "ADMIN" ? "ADMIN" : "COLABORADOR",
    status:
      dados.status === "ACTIVE" || dados.status === "BLOCKED" ? dados.status : "PENDING",
    createdAt: paraData(dados.createdAt) ?? new Date(0),
    updatedAt: paraData(dados.updatedAt) ?? new Date(0),
    approvedBy: dados.approvedBy ? String(dados.approvedBy) : null,
    approvedAt: paraData(dados.approvedAt),
  };
}

export async function buscarPerfil(uid: string): Promise<Omit<UserProfile, "lastSignInAt"> | null> {
  const doc = await colecao().doc(uid).get();
  if (!doc.exists) return null;
  return paraPerfil(doc.id, doc.data() ?? {});
}

/**
 * Todos os usuários, cruzando o perfil do Firestore com o último acesso do Auth.
 *
 * Parte do Auth, não do Firestore: assim uma conta criada no Auth que ainda não
 * ganhou perfil (cadastro interrompido no meio) continua visível para o
 * administrador em vez de sumir do painel.
 */
export async function listarUsuarios(): Promise<UserProfile[]> {
  const [{ users: contas }, docs] = await Promise.all([
    adminAuth.listUsers(1000),
    colecao().get(),
  ]);

  const perfis = new Map(docs.docs.map((d) => [d.id, paraPerfil(d.id, d.data())]));

  const lista = contas.map((conta) => {
    const perfil = perfis.get(conta.uid);
    return {
      ...(perfil ?? {
        uid: conta.uid,
        name: conta.displayName ?? conta.email ?? "Sem nome",
        email: conta.email ?? null,
        role: "COLABORADOR" as UserRole,
        status: "PENDING" as UserStatus,
        createdAt: paraData(conta.metadata.creationTime) ?? new Date(0),
        updatedAt: new Date(0),
        approvedBy: null,
        approvedAt: null,
      }),
      lastSignInAt: paraData(conta.metadata.lastSignInTime),
    };
  });

  // Pendentes primeiro: é o que o administrador precisa resolver.
  const ordem: Record<UserStatus, number> = { PENDING: 0, ACTIVE: 1, BLOCKED: 2 };
  return lista.sort(
    (a, b) => ordem[a.status] - ordem[b.status] || a.name.localeCompare(b.name, "pt-BR"),
  );
}

/** Cria o perfil de quem acabou de se cadastrar. Idempotente. */
export async function criarPerfilPendente(dados: {
  uid: string;
  name: string;
  email: string | null;
}): Promise<void> {
  const ref = colecao().doc(dados.uid);
  const existente = await ref.get();
  if (existente.exists) return;

  const agora = new Date();
  await ref.set({
    name: dados.name,
    email: dados.email,
    role: "COLABORADOR",
    status: "PENDING",
    createdAt: agora,
    updatedAt: agora,
    approvedBy: null,
    approvedAt: null,
  });
}

/**
 * Grava papel e status nos DOIS lugares.
 *
 * Ordem proposital: primeiro os claims (o que barra o acesso de fato), depois o
 * documento. Se a segunda escrita falhar, o resultado é um painel desatualizado
 * — chato, mas seguro. O inverso deixaria alguém com acesso real e aparência de
 * bloqueado.
 */
export async function definirPapelEStatus(
  uid: string,
  role: UserRole,
  status: UserStatus,
  aprovadoPor?: string,
): Promise<void> {
  await adminAuth.setCustomUserClaims(uid, { role, status });

  const patch: Record<string, unknown> = { role, status, updatedAt: new Date() };
  if (status === "ACTIVE" && aprovadoPor) {
    patch.approvedBy = aprovadoPor;
    patch.approvedAt = new Date();
  }

  await colecao().doc(uid).set(patch, { merge: true });

  // Invalida as sessões existentes: sem isso, alguém bloqueado seguiria usando
  // o cookie que já tem por até 5 dias.
  if (status !== "ACTIVE") {
    await adminAuth.revokeRefreshTokens(uid);
  }
}

/** Quantos administradores ativos existem — usado para não zerar o acesso. */
export async function contarAdminsAtivos(): Promise<number> {
  const snap = await colecao().where("role", "==", "ADMIN").where("status", "==", "ACTIVE").get();
  return snap.size;
}
