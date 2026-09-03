import { redirect } from "next/navigation";
import { requireActiveUser } from "@/lib/auth";
import { buscarPerfil } from "@/lib/core/repositories/users.repo";
import { FormularioDadosBancarios } from "@/components/dados-bancarios/FormularioDadosBancarios";

export const dynamic = "force-dynamic";

/**
 * Portão: quem está ativo e ainda não disse como quer receber para aqui.
 *
 * Fica FORA do grupo (app) pelo mesmo motivo de `/aguardando`: dentro dele, o
 * layout autenticado — que é justamente quem redireciona para cá — mandaria
 * para cá de novo, em laço infinito. Por isso também dispensa a própria
 * exigência (`exigirDadosBancarios: false`): é a porta de saída dela.
 */
export default async function DadosParaReembolsoPage() {
  const usuario = await requireActiveUser({ exigirDadosBancarios: false });
  const perfil = await buscarPerfil(usuario.uid);

  // Já cadastrou e voltou aqui pelo histórico do navegador: esta tela não tem
  // mais o que fazer, e a edição mora em "Meus dados".
  if (perfil?.dadosBancarios) redirect("/perfil");

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        padding: "1.5rem",
      }}
    >
      {/* `margin: auto` no lugar de `align-items: center`: com o formulário
          mais alto que a tela — celular deitado, teclado aberto — centralizar
          por flex deixa o topo do cartão inalcançável. */}
      <div className="card" style={{ maxWidth: "560px", width: "100%", margin: "auto" }}>
        <div style={{ fontSize: "2rem", marginBottom: "0.5rem" }}>◈</div>

        <h1 style={{ fontSize: "1.25rem", marginBottom: "0.5rem" }}>Seus dados para reembolso</h1>

        <p style={{ color: "var(--color-muted)", fontSize: "0.875rem", marginBottom: "1.5rem" }}>
          É por aqui que a empresa devolve o que você pagou do próprio bolso: os
          dados abaixo saem no comprovante que o financeiro usa para depositar.
          Só você e o administrador enxergam esta informação.
        </p>

        <FormularioDadosBancarios
          modo="primeiro-acesso"
          nomePadrao={perfil?.name ?? usuario.email ?? ""}
          inicial={null}
        />
      </div>
    </div>
  );
}
