"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { fail, mensagemDeErro, ok, type Result } from "@/lib/guardrails/result";
import {
  buscarPerfil,
  contarAdminsAtivos,
  definirPapelEStatus,
  garantirPerfil,
  listarUsuarios,
} from "@/lib/core/repositories/users.repo";
import type { UserProfile } from "@/types";

export async function obterUsuarios(): Promise<Result<UserProfile[]>> {
  try {
    await requireAdmin();
    return ok(await listarUsuarios());
  } catch (erro) {
    return fail(mensagemDeErro(erro, "Não foi possível carregar os usuários."));
  }
}

export async function aprovarUsuario(uid: string): Promise<Result> {
  try {
    const admin = await requireAdmin();

    // Conta que existe no Auth sem perfil no banco ganha o perfil agora — é o
    // que o painel promete ao listá-la (ver garantirPerfil).
    const perfil = await garantirPerfil(uid);
    if (perfil.status === "ACTIVE") return ok();

    await definirPapelEStatus(uid, perfil.role, "ACTIVE", admin.uid);
    revalidatePath("/admin/usuarios");
    return ok();
  } catch (erro) {
    return fail(mensagemDeErro(erro, "Não foi possível aprovar."));
  }
}

export async function bloquearUsuario(uid: string): Promise<Result> {
  try {
    const admin = await requireAdmin();

    // Duas travas para ninguém trancar a porta com a chave dentro (Art. 1).
    if (uid === admin.uid) {
      return fail("Você não pode bloquear a própria conta.");
    }

    const perfil = await buscarPerfil(uid);
    if (!perfil) return fail("Usuário não encontrado.");

    if (perfil.role === "ADMIN" && perfil.status === "ACTIVE") {
      const admins = await contarAdminsAtivos();
      if (admins <= 1) {
        return fail("Este é o último administrador ativo. Promova outro antes de bloqueá-lo.");
      }
    }

    await definirPapelEStatus(uid, perfil.role, "BLOCKED");
    revalidatePath("/admin/usuarios");
    return ok();
  } catch (erro) {
    return fail(mensagemDeErro(erro, "Não foi possível bloquear."));
  }
}

export async function alterarPapel(uid: string, role: "ADMIN" | "COLABORADOR"): Promise<Result> {
  try {
    const admin = await requireAdmin();

    if (uid === admin.uid && role !== "ADMIN") {
      return fail("Você não pode rebaixar a própria conta.");
    }

    const perfil = await buscarPerfil(uid);
    if (!perfil) return fail("Usuário não encontrado.");

    if (perfil.role === "ADMIN" && role === "COLABORADOR") {
      const admins = await contarAdminsAtivos();
      if (admins <= 1) {
        return fail("Este é o último administrador ativo.");
      }
    }

    await definirPapelEStatus(uid, role, perfil.status, admin.uid);
    revalidatePath("/admin/usuarios");
    return ok();
  } catch (erro) {
    return fail(mensagemDeErro(erro, "Não foi possível alterar o papel."));
  }
}
