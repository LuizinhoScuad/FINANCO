import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE_NAME, getSessionDurationMs } from "@/lib/auth";
import { adminAuth } from "@/lib/firebase-admin";

export async function POST(request: NextRequest) {
  try {
    const { idToken } = await request.json();
    if (!idToken) {
      return NextResponse.json({ error: "Token ausente." }, { status: 400 });
    }

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
    return NextResponse.json({ error: "Falha ao iniciar sessao." }, { status: 401 });
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
