import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE_NAME, getSessionDurationMs } from "@/lib/auth";
import { adminAuth, adminDb } from "@/lib/firebase-admin";

/**
 * Cria a sessão — e é aqui que uma conta não liberada para na porta.
 *
 * Verificar o status no momento do login evita que alguém que se cadastrou
 * sozinho receba um cookie válido de 5 dias antes de ser aprovado (Art. 5).
 */
export async function POST(request: NextRequest) {
  let idToken: string | undefined;

  try {
    ({ idToken } = await request.json());
  } catch {
    return NextResponse.json({ error: "Requisição inválida." }, { status: 400 });
  }

  if (!idToken) {
    return NextResponse.json({ error: "Token ausente." }, { status: 400 });
  }

  // 1. O token é válido?
  let uid: string;
  try {
    const decoded = await adminAuth.verifyIdToken(idToken, true);
    uid = decoded.uid;
  } catch {
    return NextResponse.json({ error: "Sessão inválida ou expirada." }, { status: 401 });
  }

  // 2. A conta está liberada?
  const perfil = await adminDb.collection("users").doc(uid).get();
  const status = perfil.exists ? perfil.data()?.status : undefined;

  if (status === "BLOCKED") {
    return NextResponse.json(
      { error: "Esta conta está bloqueada. Procure o administrador.", codigo: "BLOQUEADA" },
      { status: 403 },
    );
  }

  if (status !== "ACTIVE") {
    return NextResponse.json(
      {
        error: "Cadastro aguardando liberação de um administrador.",
        codigo: "PENDENTE",
      },
      { status: 403 },
    );
  }

  // 3. Libera.
  try {
    const expiresIn = getSessionDurationMs();
    const sessionCookie = await adminAuth.createSessionCookie(idToken, { expiresIn });
    const store = await cookies();
    store.set(SESSION_COOKIE_NAME, sessionCookie, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: Math.floor(expiresIn / 1000),
    });

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: "Falha ao iniciar a sessão." }, { status: 401 });
  }
}

export async function DELETE() {
  const store = await cookies();
  store.set(SESSION_COOKIE_NAME, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });

  return NextResponse.json({ success: true });
}
