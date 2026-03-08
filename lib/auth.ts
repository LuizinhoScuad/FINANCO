import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { adminAuth } from "@/lib/firebase-admin";

export const SESSION_COOKIE_NAME = "financo_session";
const SESSION_DURATION_MS = 1000 * 60 * 60 * 24 * 5;

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

export async function requireCurrentUser() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}

export async function requireCurrentUserId() {
  const user = await getCurrentUser();
  if (!user) {
    throw new Error("Nao autenticado.");
  }
  return user.uid;
}

export function getSessionDurationMs() {
  return SESSION_DURATION_MS;
}
