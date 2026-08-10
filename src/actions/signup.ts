"use server";

import { z } from "zod";
import { adminAuth } from "@/lib/firebase-admin";
import { fail, ok, type Result } from "@/lib/guardrails/result";
import { criarPerfilPendente } from "@/lib/core/repositories/users.repo";

const Cadastro = z.object({
  idToken: z.string().min(1),
  name: z.string().trim().min(2, "Informe seu nome completo.").max(80),
});

/**
 * Registra quem acabou de criar conta — como PENDENTE.
 *
 * Chamada sem sessão, de propósito: neste ponto a pessoa autenticou no Firebase
 * mas ainda não tem (nem deve ter) cookie de sessão. A identidade vem do token,
 * verificado aqui; o cliente não pode escrever no Firestore (as regras negam),
 * então este é o único caminho para o perfil nascer.
 *
 * NÃO define custom claims: sem claim, a pessoa não passa nem pelas regras do
 * Storage nem pela criação de sessão. O acesso só existe depois da aprovação.
 */
export async function registrarCadastro(input: {
  idToken: string;
  name: string;
}): Promise<Result> {
  const parsed = Cadastro.safeParse(input);
  if (!parsed.success) {
    return fail(parsed.error.issues[0]?.message ?? "Dados inválidos.");
  }

  let uid: string;
  let email: string | null;
  try {
    const decoded = await adminAuth.verifyIdToken(parsed.data.idToken, true);
    uid = decoded.uid;
    email = decoded.email ?? null;
  } catch {
    return fail("Não foi possível confirmar o cadastro. Tente entrar novamente.");
  }

  try {
    await criarPerfilPendente({ uid, name: parsed.data.name, email });
    return ok();
  } catch {
    return fail("Conta criada, mas o cadastro não pôde ser registrado. Avise o administrador.");
  }
}
