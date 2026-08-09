import { requireAdmin } from "@/lib/auth";
import { listarUsuarios } from "@/lib/core/repositories/users.repo";
import { UsuariosClient } from "./UsuariosClient";

export const dynamic = "force-dynamic";

export default async function UsuariosPage() {
  const admin = await requireAdmin();
  const usuarios = await listarUsuarios();

  return <UsuariosClient usuarios={usuarios} uidAtual={admin.uid} />;
}
