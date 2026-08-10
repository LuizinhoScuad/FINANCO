import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";

export const dynamic = "force-dynamic";

/** Timeout curto: um health check nunca pode ficar pendurado. */
const PROBE_TIMEOUT_MS = 5000;

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(`timeout após ${ms}ms`)), ms),
    ),
  ]);
}

/**
 * Probe real: faz uma leitura mínima no Firestore.
 * Retorna 503 quando a dependência está fora — o valor de um health check
 * está em falhar quando algo está quebrado.
 */
export async function GET() {
  const startedAt = Date.now();

  let firestoreOk = false;
  let firestoreError: string | null = null;

  try {
    await withTimeout(adminDb.collection("users").limit(1).get(), PROBE_TIMEOUT_MS);
    firestoreOk = true;
  } catch (error) {
    firestoreError = error instanceof Error ? error.message : String(error);
  }

  const body = {
    ok: firestoreOk,
    checks: {
      firestore: {
        ok: firestoreOk,
        error: firestoreError,
      },
    },
    projectId: process.env.GCLOUD_PROJECT ?? process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ?? null,
    latencyMs: Date.now() - startedAt,
  };

  return NextResponse.json(body, {
    status: firestoreOk ? 200 : 503,
    headers: { "Cache-Control": "no-store" },
  });
}
