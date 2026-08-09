import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { LoginClient } from "./LoginClient";

export const dynamic = "force-dynamic";

const AVISOS: Record<string, string> = {
  expirada: "Sua sessão expirou. Entre novamente.",
  bloqueada: "Esta conta está bloqueada. Procure o administrador.",
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await getCurrentUser();
  if (user) redirect("/dashboard");

  const params = await searchParams;
  const aviso = Object.keys(AVISOS).find((chave) => params[chave] === "1");

  return <LoginClient aviso={aviso ? AVISOS[aviso] : undefined} />;
}
