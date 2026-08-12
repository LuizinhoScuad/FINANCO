import { requireActiveUser } from "@/lib/auth";
import { getEquipeAtiva, getLotes, getPedidos, getTotalDePedidos } from "@/actions/reembolsos";
import { RelatoriosClient } from "./RelatoriosClient";

export const dynamic = "force-dynamic";

/**
 * Relatórios de reembolso — a tela é a MESMA para todo mundo.
 *
 * O que muda é o alcance, e quem decide isso é o servidor a partir do papel: o
 * gestor recebe a equipe inteira e o filtro por pessoa; qualquer outra pessoa
 * recebe só os próprios pedidos e nem sabe que o filtro existe (Art. 5).
 */
export default async function RelatoriosPage() {
  const usuario = await requireActiveUser();
  const isAdmin = usuario.role === "ADMIN";

  const [pedidos, lotes, equipe, totalDePedidos] = await Promise.all([
    getPedidos({}),
    getLotes(),
    isAdmin ? getEquipeAtiva() : Promise.resolve([]),
    // Quantos pedidos existem no total: o recorte de período é feito no banco,
    // então sem este número a tela não teria como avisar que algo ficou fora.
    getTotalDePedidos(),
  ]);

  return (
    <RelatoriosClient
      isAdmin={isAdmin}
      pedidos={pedidos}
      lotes={lotes}
      equipe={equipe}
      totalDePedidos={totalDePedidos}
    />
  );
}
