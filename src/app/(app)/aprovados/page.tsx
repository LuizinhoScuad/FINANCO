import { requireActiveUser } from "@/lib/auth";
import { getPedidos } from "@/actions/reembolsos";
import { AprovadosClient } from "./AprovadosClient";

export const dynamic = "force-dynamic";

/**
 * Aprovados — o dinheiro que já foi decidido e ainda não saiu.
 *
 * Existe porque essa resposta estava espalhada: para saber quanto havia a pagar,
 * o gestor precisava ir a Relatórios, escolher a situação certa no filtro e
 * confiar que o total mostrado era só o aprovado. Aqui a pergunta é a própria
 * tela — não há filtro para errar.
 *
 * O alcance é decidido no servidor, pelo papel: o gestor vê a equipe inteira,
 * separada por pessoa; qualquer outra pessoa vê apenas o que tem a receber
 * (Art. 5).
 */
export default async function AprovadosPage() {
  const usuario = await requireActiveUser();
  const isAdmin = usuario.role === "ADMIN";

  const pedidos = await getPedidos({ situacao: "APROVADA" });

  return <AprovadosClient isAdmin={isAdmin} pedidos={pedidos} />;
}
