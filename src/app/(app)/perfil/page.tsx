import { requireActiveUser } from "@/lib/auth";
import { buscarPerfil } from "@/lib/core/repositories/users.repo";
import { FormularioDadosBancarios } from "@/components/dados-bancarios/FormularioDadosBancarios";
import { formatDateTime } from "@/lib/utils";

export const dynamic = "force-dynamic";

/** "Meus dados" — a mesma tela do portão, agora dentro do app, para corrigir. */
export default async function PerfilPage() {
  const usuario = await requireActiveUser();
  const perfil = await buscarPerfil(usuario.uid);
  const dados = perfil?.dadosBancarios ?? null;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem", maxWidth: "620px" }}>
      <div className="animate-fade-up">
        <h1 style={{ fontSize: "1.5rem", marginBottom: "0.25rem" }}>Meus dados</h1>
        <p style={{ color: "var(--color-muted)", fontSize: "0.875rem" }}>
          Para onde vai o seu reembolso.
          {dados && ` Atualizado em ${formatDateTime(dados.atualizadoEm)}.`}
        </p>
      </div>

      <div className="card animate-fade-up">
        <FormularioDadosBancarios
          modo="edicao"
          nomePadrao={perfil?.name ?? usuario.email ?? ""}
          inicial={dados}
        />
      </div>

      <p style={{ fontSize: "0.75rem", color: "var(--color-muted)" }}>
        Estes dados aparecem no comprovante dos pagamentos que ainda serão
        fechados. Comprovante já emitido guarda os dados que valiam na época.
      </p>
    </div>
  );
}
