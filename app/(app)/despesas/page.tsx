import { requireActiveUser } from "@/lib/auth";
import {
  listarCategoriasDespesa,
  listarDespesasDoUsuario,
} from "@/lib/core/repositories/expenses.repo";
import { DespesasClient } from "./DespesasClient";

export const dynamic = "force-dynamic";

export default async function DespesasPage() {
  const usuario = await requireActiveUser();

  const [despesas, categorias] = await Promise.all([
    listarDespesasDoUsuario(usuario.uid),
    listarCategoriasDespesa(),
  ]);

  return <DespesasClient despesas={despesas} categorias={categorias} />;
}
