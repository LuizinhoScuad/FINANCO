import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { adminAuth, adminDb } from "@/lib/firebase-admin";

export const SESSION_COOKIE_NAME = "financo_session";
const SESSION_DURATION_MS = 1000 * 60 * 60 * 24 * 5;

export type UserRole = "ADMIN" | "COLABORADOR";
export type UserStatus = "PENDING" | "ACTIVE" | "BLOCKED";

export type SessionUser = {
  uid: string;
  email: string | null;
  role: UserRole;
  status: UserStatus;
};

export async function getSessionCookie() {
  const store = await cookies();
  return store.get(SESSION_COOKIE_NAME)?.value ?? null;
}

export async function getCurrentUser() {
  const sessionCookie = await getSessionCookie();
  if (!sessionCookie) return null;

  try {
    return await adminAuth.verifySessionCookie(sessionCookie, true);
  } catch {
    return null;
  }
}

/**
 * Papel e status a partir dos custom claims do cookie de sessão.
 *
 * Conta antiga, criada antes de existirem papéis, não tem claim nenhum:
 * tratamos como COLABORADOR/PENDING — ou seja, sem acesso — até que um
 * administrador decida. Falhar fechado é o comportamento correto (Art. 5).
 */
export async function getSessionUser(): Promise<SessionUser | null> {
  const user = await getCurrentUser();
  if (!user) return null;

  return {
    uid: user.uid,
    email: user.email ?? null,
    role: user.role === "ADMIN" ? "ADMIN" : "COLABORADOR",
    status:
      user.status === "ACTIVE" || user.status === "BLOCKED" || user.status === "PENDING"
        ? user.status
        : "PENDING",
  };
}

/**
 * Status gravado no documento do usuário — a fonte da verdade.
 *
 * O claim vive no cookie e só muda quando a pessoa autentica de novo (até 5
 * dias). Ler o documento é o que faz um bloqueio valer na ação seguinte, sem
 * esperar a sessão expirar. Use em toda ação sensível.
 */
export async function getLiveStatus(uid: string): Promise<UserStatus | null> {
  const doc = await adminDb.collection("users").doc(uid).get();
  if (!doc.exists) return null;
  const status = doc.data()?.status;
  return status === "ACTIVE" || status === "BLOCKED" || status === "PENDING" ? status : null;
}

export async function requireCurrentUser() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}

/**
 * Usuário autenticado E liberado. Porta de entrada das telas do app.
 *
 * Antes esta função lançava erro cru quando a sessão expirava, o que estourava
 * na tela como falha genérica de Server Action. Agora redireciona.
 */
export async function requireActiveUser(): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) redirect("/login?expirada=1");

  const status = (await getLiveStatus(user.uid)) ?? user.status;

  if (status === "PENDING") redirect("/aguardando");
  if (status !== "ACTIVE") redirect("/login?bloqueada=1");

  return { ...user, status };
}

export async function requireAdmin(): Promise<SessionUser> {
  const user = await requireActiveUser();
  if (user.role !== "ADMIN") redirect("/dashboard");
  return user;
}

/**
 * Identificador do usuário para a camada de dados.
 *
 * Mantém o nome antigo por compatibilidade com `lib/db.ts` e as actions
 * existentes; some junto com o shim na Fase 4.
 */
export async function requireCurrentUserId() {
  const user = await getSessionUser();
  if (!user) redirect("/login?expirada=1");
  return user.uid;
}

export function getSessionDurationMs() {
  return SESSION_DURATION_MS;
}
