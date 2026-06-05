import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { adminDb } from "@/lib/firebase-admin";

export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  }

  let payload: Record<string, unknown>;
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido." }, { status: 400 });
  }

  const { accounts, categories, budgets, transactions } = payload as {
    accounts?: unknown[];
    categories?: unknown[];
    budgets?: unknown[];
    transactions?: unknown[];
  };

  if (!Array.isArray(accounts) || !Array.isArray(categories) || !Array.isArray(budgets) || !Array.isArray(transactions)) {
    return NextResponse.json({ error: "Arquivo de backup inválido ou corrompido." }, { status: 400 });
  }

  const root = adminDb.collection("users").doc(user.uid);
  const cols = {
    accounts: root.collection("accounts"),
    categories: root.collection("categories"),
    budgets: root.collection("budgets"),
    transactions: root.collection("transactions"),
  };

  // Apaga coleções existentes em lotes
  for (const [name, ref] of Object.entries(cols)) {
    const snap = await ref.get();
    let batch = adminDb.batch();
    let count = 0;
    for (const doc of snap.docs) {
      batch.delete(doc.ref);
      count++;
      if (count === 400) {
        await batch.commit();
        batch = adminDb.batch();
        count = 0;
      }
    }
    if (count > 0) await batch.commit();
  }

  // Reinsere os dados do backup em lotes
  for (const [name, items] of Object.entries({ accounts, categories, budgets, transactions })) {
    const ref = cols[name as keyof typeof cols];
    let batch = adminDb.batch();
    let count = 0;
    for (const item of items as Array<Record<string, unknown>>) {
      const { id, ...data } = item;
      // Converte strings ISO para Date
      const normalized: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(data)) {
        if (typeof v === "string" && /^\d{4}-\d{2}-\d{2}T/.test(v)) {
          normalized[k] = new Date(v);
        } else {
          normalized[k] = v;
        }
      }
      batch.set(ref.doc(String(id)), normalized);
      count++;
      if (count === 400) {
        await batch.commit();
        batch = adminDb.batch();
        count = 0;
      }
    }
    if (count > 0) await batch.commit();
  }

  return NextResponse.json({
    success: true,
    restored: {
      accounts: accounts.length,
      categories: categories.length,
      budgets: budgets.length,
      transactions: transactions.length,
    },
  });
}
