import { requireAdmin } from "@/lib/auth";
import { getEquipeAtiva, getFilaDeAprovacao } from "@/actions/reembolsos";
import { AprovacoesClient } from "./AprovacoesClient";

export const dynamic = "force-dynamic";

export default async function AprovacoesPage() {
  await requireAdmin();

  const [fila, equipe] = await Promise.all([getFilaDeAprovacao(), getEquipeAtiva()]);

  return <AprovacoesClient fila={fila} equipe={equipe} />;
}
