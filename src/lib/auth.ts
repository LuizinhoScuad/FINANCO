import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { adminAuth, adminDb } from "@/lib/firebase-admin";
import { lerDadosBancarios } from "@/lib/core/dados-bancarios";

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
 * O que o documento do usuário diz agora — a fonte da verdade.
 *
 * O claim vive no cookie e só muda quando a pessoa autentica de novo (até 5
 * dias). Ler o documento é o que faz um bloqueio valer na ação seguinte, sem
 * esperar a sessão expirar.
 *
 * Devolve status e presença dos dados de reembolso na MESMA leitura: o portão
 * de cadastro não custa uma ida a mais ao banco (D17).
 */
export async function getLivePerfil(
  uid: string,
): Promise<{ status: UserStatus | null; temDadosBancarios: boolean }> {
  const doc = await adminDb.collection("users").doc(uid).get();
  if (!doc.exists) return { status: null, temDadosBancarios: false };

  const dados = doc.data();
  const status = dados?.status;

  return {
    status:
      status === "ACTIVE" || status === "BLOCKED" || status === "PENDING" ? status : null,
    temDadosBancarios: lerDadosBancarios(dados?.dadosBancarios) !== null,
  };
}

/** Só o status. Envelope de `getLivePerfil` para quem não precisa do resto. */
export async function getLiveStatus(uid: string): Promise<UserStatus | null> {
  return (await getLivePerfil(uid)).status;
}

export async function requireCurrentUser() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}

/**
 * Usuário autenticado, liberado E com cadastro completo. Porta de entrada das
 * telas do app.
 *
 * Antes esta função lançava erro cru quando a sessão expirava, o que estourava
 * na tela como falha genérica de Server Action. Agora redireciona.
 *
 * O portão dos dados de reembolso vive aqui de propósito (D17): passando por
 * esta única porta, não há aba antiga, URL digitada ou server action que
 * escape dele. Quem dispensa a exigência é só a própria tela de cadastro e a
 * action que a salva — do contrário, o portão barraria o caminho para sair
 * dele.
 */
export async function requireActiveUser(
  opcoes: { exigirDadosBancarios?: boolean } = {},
): Promise<SessionUser> {
  const { exigirDadosBancarios = true } = opcoes;

  const user = await getSessionUser();
  if (!user) redirect("/login?expirada=1");

  const perfil = await getLivePerfil(user.uid);
  const status = perfil.status ?? user.status;

  if (status === "PENDING") redirect("/aguardando");
  if (status !== "ACTIVE") redirect("/login?bloqueada=1");

  if (exigirDadosBancarios && !perfil.temDadosBancarios) redirect("/dados-para-reembolso");

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
