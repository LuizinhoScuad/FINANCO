import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { gerarSnapshot } from "@/lib/core/repositories/snapshot.repo";

export const dynamic = "force-dynamic";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  }

  const payload = await gerarSnapshot();

  return new NextResponse(JSON.stringify(payload, null, 2), {
    status: 200,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="financo-backup-${user.uid}.json"`,
      "Cache-Control": "no-store",
    },
  });
}
