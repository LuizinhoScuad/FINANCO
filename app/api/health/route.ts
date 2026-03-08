import { existsSync } from "node:fs";
import path from "node:path";
import { NextResponse } from "next/server";

export function GET() {
  const databaseUrl = process.env.DATABASE_URL ?? "";
  const prismaDbPath = path.join(process.cwd(), "prisma", "dev.db");

  return NextResponse.json({
    ok: true,
    hasDatabaseUrl: databaseUrl.length > 0,
    databaseUrlPreview: databaseUrl ? databaseUrl.slice(0, 12) : "",
    hasPrismaDbFile: existsSync(prismaDbPath),
    prismaDbPath,
  });
}
