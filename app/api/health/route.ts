import { NextResponse } from "next/server";

export function GET() {
  return NextResponse.json({
    ok: true,
    hasFirebaseConfig: Boolean(process.env.FIREBASE_CONFIG || process.env.GCLOUD_PROJECT),
    projectId: process.env.GCLOUD_PROJECT ?? null,
  });
}
