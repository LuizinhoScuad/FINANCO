import { requireAdmin } from "@/lib/auth";
import {
  listarCategoriasDespesa,
  listarDespesasParaRelatorio,
  listarLotes,
} from "@/lib/core/repositories/expenses.repo";
import { listarUsuarios } from "@/lib/core/repositories/users.repo";
import { RelatoriosClient } from "./RelatoriosClient";

export const dynamic = "force-dynamic";

export default async function RelatoriosPage() {
  await requireAdmin();

  const [despesas, categorias, usuarios, lotes] = await Promise.all([
    listarDespesasParaRelatorio({}),
    listarCategoriasDespesa(true),
    listarUsuarios(),
    listarLotes(),
  ]);

  return (
    <RelatoriosClient
      despesas={despesas}
      categorias={categorias}
      usuarios={usuarios.filter((u) => u.status === "ACTIVE").map((u) => ({ uid: u.uid, name: u.name }))}
      lotes={lotes}
    />
  );
}
