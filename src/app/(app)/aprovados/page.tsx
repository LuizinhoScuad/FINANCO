import { requireActiveUser } from "@/lib/auth";
import { getEquipeAtiva, getPedidos } from "@/actions/reembolsos";
import { atalhosDePeriodo } from "@/lib/core/datas";
import { AprovadosClient } from "./AprovadosClient";

export const dynamic = "force-dynamic";

/**
 * Aprovados — o dinheiro decidido: o que ainda não saiu e o que já saiu.
 *
 * Existe porque essas duas respostas dependiam de acertar um filtro em
 * Relatórios. Aqui cada uma é uma seção, e a de cima — a conta a pagar — não
 * tem filtro nenhum para errar: é sempre tudo o que está aprovado.
 *
 * O alcance é decidido no servidor, pelo papel: o gestor vê a equipe inteira,
 * separada por pessoa; qualquer outra pessoa vê apenas o que é seu (Art. 5).
 */
export default async function AprovadosPage() {
  const usuario = await requireActiveUser();
  const isAdmin = usuario.role === "ADMIN";

  // O pago é histórico e cresce sem parar: entra recortado por período, nunca
  // inteiro (RNF-03). Os últimos 90 dias cobrem o uso do dia a dia; o resto
  // está a um clique nos atalhos.
  const inicial = atalhosDePeriodo().find((a) => a.id === "90")!;

  const [aPagar, pagos, equipe] = await Promise.all([
    getPedidos({ situacao: "APROVADA" }),
    getPedidos({ situacao: "RESSARCIDA", desde: inicial.desde, ate: inicial.ate }),
    isAdmin ? getEquipeAtiva() : Promise.resolve([]),
  ]);

  return (
    <AprovadosClient
      isAdmin={isAdmin}
      pedidos={aPagar}
      pagos={pagos}
      equipe={equipe}
      periodoInicial={inicial.id}
    />
  );
}
