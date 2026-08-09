import { requireAdmin } from "@/lib/auth";
import {
  listarCategoriasDespesa,
  listarDespesasPorStatus,
} from "@/lib/core/repositories/expenses.repo";
import { AprovacoesClient } from "./AprovacoesClient";

export const dynamic = "force-dynamic";

export default async function AprovacoesPage() {
  await requireAdmin();

  const [fila, categorias] = await Promise.all([
    listarDespesasPorStatus("ENVIADA"),
    listarCategoriasDespesa(true),
  ]);

  return <AprovacoesClient fila={fila} categorias={categorias} />;
}
