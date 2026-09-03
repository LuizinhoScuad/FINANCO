"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireActiveUser, requireAdmin } from "@/lib/auth";
import {
  decidirPedido,
  fecharLote,
  listarFilaDeAprovacao,
  listarLotes,
  listarPedidosDaEquipe,
  listarPedidosDoUsuario,
  contarTodosOsPedidos,
  previaDeFechamento,
  type FiltroDeReembolso,
} from "@/lib/core/repositories/transactions.repo";
import { buscarPerfil, listarUsuarios } from "@/lib/core/repositories/users.repo";
import { fimDoDia, inicioDoDia, periodo } from "@/lib/core/datas";
import { traduzirErro } from "@/lib/guardrails/transactions";
import { fail, mensagemDeErro, ok, type Result } from "@/lib/guardrails/result";
import type { PedidoDeReembolso, UserProfile } from "@/types";

/**
 * Pedidos de reembolso — a camada do gestor sobre os lançamentos.
 *
 * Não existe tela própria de registro: o pedido nasce em Transações, marcado
 * pela pessoa. Aqui só se lê, decide e fecha pagamento.
 */

// --- leitura -----------------------------------------------------------------

async function mapaDeNomes(): Promise<Map<string, string>> {
  const usuarios = await listarUsuarios();
  return new Map(usuarios.map((u) => [u.uid, u.name]));
}

async function nomeDoAtor(uid: string, email: string | null): Promise<string> {
  const perfil = await buscarPerfil(uid);
  return perfil?.name || email || "Sem nome";
}

/**
 * O que a pessoa vê em Relatórios.
 *
 * O administrador enxerga a equipe inteira; qualquer outra pessoa, apenas os
 * próprios pedidos. Quem decide isso é o servidor, a partir do papel — nunca um
 * parâmetro vindo da tela (Art. 5).
 */
export async function getPedidos(filtros: {
  userId?: string;
  situacao?: string;
  desde?: string;
  ate?: string;
}): Promise<PedidoDeReembolso[]> {
  const usuario = await requireActiveUser();

  // Fronteiras em UTC (lib/core/datas.ts). Montadas no fuso de quem executa, o
  // mesmo filtro devolvia conjuntos diferentes no servidor e na máquina local —
  // e deixava de fora o lançamento do primeiro dia do período.
  const janela = periodo(filtros.desde, filtros.ate);

  const recorte: FiltroDeReembolso = {
    situacao: ehSituacao(filtros.situacao) ? filtros.situacao : undefined,
    ...janela,
  };

  if (usuario.role !== "ADMIN") {
    return listarPedidosDoUsuario(
      usuario.uid,
      await nomeDoAtor(usuario.uid, usuario.email),
      recorte,
    );
  }

  return listarPedidosDaEquipe(await mapaDeNomes(), { ...recorte, userId: filtros.userId });
}

/**
 * Quantos pedidos existem ao todo, ignorando qualquer período.
 *
 * O recorte de data acontece no banco: o que cai fora dele não chega à tela, e
 * a tela precisa deste número para poder dizer "há N fora deste período" em vez
 * de mostrar um total menor sem explicação. O alcance segue o papel (Art. 5).
 */
export async function getTotalDePedidos(situacao?: string): Promise<number> {
  const usuario = await requireActiveUser();
  return contarTodosOsPedidos(
    usuario.role === "ADMIN" ? undefined : usuario.uid,
    ehSituacao(situacao) ? situacao : undefined,
  );
}

export async function getFilaDeAprovacao(): Promise<PedidoDeReembolso[]> {
  await requireAdmin();
  return listarFilaDeAprovacao(await mapaDeNomes());
}

/**
 * Fechamentos de pagamento, com os dados de depósito prontos para o comprovante.
 *
 * Lote fechado antes da Fase 11 não tem a cópia dos dados. Em vez de deixar o
 * comprovante antigo sair sem eles, completamos com o cadastro atual da pessoa
 * — uma leitura por pessoa, não por lote. O que tem cópia usa a cópia: ela é o
 * registro do que foi enviado à época.
 */
export async function getLotes(userId?: string) {
  const usuario = await requireActiveUser();
  // Colaborador só enxerga os próprios fechamentos, dito ou não pela tela.
  const lotes = await listarLotes(usuario.role === "ADMIN" ? userId : usuario.uid);

  const semCopia = [...new Set(lotes.filter((l) => !l.dadosBancarios).map((l) => l.userId))];
  if (semCopia.length === 0) return lotes;

  const perfis = new Map(
    await Promise.all(
      semCopia.map(async (uid) => [uid, (await buscarPerfil(uid))?.dadosBancarios ?? null] as const),
    ),
  );

  return lotes.map((lote) =>
    lote.dadosBancarios ? lote : { ...lote, dadosBancarios: perfis.get(lote.userId) ?? null },
  );
}

export async function getEquipeAtiva(): Promise<Array<{ uid: string; name: string }>> {
  await requireAdmin();
  const usuarios: UserProfile[] = await listarUsuarios();
  return usuarios
    .filter((u) => u.status === "ACTIVE")
    .map((u) => ({ uid: u.uid, name: u.name }))
    .sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
}

function ehSituacao(v: unknown): v is "ENVIADA" | "APROVADA" | "REJEITADA" | "RESSARCIDA" {
  return v === "ENVIADA" || v === "APROVADA" || v === "REJEITADA" || v === "RESSARCIDA";
}

// --- decisão do gestor -------------------------------------------------------

const Decisao = z.object({
  dono: z.string().min(1),
  id: z.string().min(1),
  motivo: z.string().trim().min(3, "Escreva o motivo da rejeição.").optional(),
});

export async function aprovarPedido(dono: string, id: string): Promise<Result> {
  const admin = await requireAdmin();
  const parsed = Decisao.safeParse({ dono, id });
  if (!parsed.success) return fail("Pedido inválido.");

  try {
    await decidirPedido(dono, id, "APROVADA", {
      uid: admin.uid,
      nome: await nomeDoAtor(admin.uid, admin.email),
      papel: admin.role,
    });
    revalidatePath("/");
    return ok();
  } catch (erro) {
    return fail(mensagemDeErro(traduzirErro(erro), "Não foi possível aprovar o pedido."));
  }
}

/**
 * Aprova de uma vez tudo o que uma pessoa tem na fila.
 *
 * Cada pedido passa pela máquina de estados individualmente — não há atalho que
 * escreva direto. Um que falhe (alguém editou no meio, por exemplo) não derruba
 * os outros: o resultado diz quantos passaram e quantos ficaram.
 */
export async function aprovarTodosDaPessoa(
  userId: string,
): Promise<Result<{ aprovados: number; falharam: number; primeiroErro: string | null }>> {
  const admin = await requireAdmin();
  if (!userId) return fail("Escolha a pessoa.");

  const nome = await nomeDoAtor(admin.uid, admin.email);
  const fila = (await listarFilaDeAprovacao(await mapaDeNomes())).filter((p) => p.userId === userId);

  if (fila.length === 0) return fail("Essa pessoa não tem pedidos aguardando decisão.");

  let aprovados = 0;
  let falharam = 0;
  let primeiroErro: string | null = null;

  for (const pedido of fila) {
    try {
      await decidirPedido(pedido.userId, pedido.id, "APROVADA", {
        uid: admin.uid,
        nome,
        papel: admin.role,
      });
      aprovados++;
    } catch (erro) {
      falharam++;
      primeiroErro ??= mensagemDeErro(traduzirErro(erro), "Um pedido não pôde ser aprovado.");
    }
  }

  revalidatePath("/");
  return ok({ aprovados, falharam, primeiroErro });
}

export async function rejeitarPedido(dono: string, id: string, motivo: string): Promise<Result> {
  const admin = await requireAdmin();
  const parsed = Decisao.safeParse({ dono, id, motivo });
  if (!parsed.success) return fail("Escreva o motivo da rejeição.");

  try {
    await decidirPedido(
      dono,
      id,
      "REJEITADA",
      { uid: admin.uid, nome: await nomeDoAtor(admin.uid, admin.email), papel: admin.role },
      { motivo: parsed.data.motivo },
    );
    revalidatePath("/");
    return ok();
  } catch (erro) {
    return fail(mensagemDeErro(traduzirErro(erro), "Não foi possível rejeitar o pedido."));
  }
}

// --- fechamento de pagamento -------------------------------------------------

const Periodo = z.object({
  userId: z.string().min(1, "Escolha a pessoa."),
  desde: z.string().min(1, "Informe a data inicial."),
  ate: z.string().min(1, "Informe a data final."),
});

function intervalo(desde: string, ate: string) {
  return { desde: inicioDoDia(desde), ate: fimDoDia(ate) };
}

/**
 * Prévia obrigatória: mostra o impacto antes de qualquer escrita (Art. 1).
 *
 * Diz também se a pessoa não cadastrou os dados de depósito. É aviso, não
 * impedimento: o gestor decide se fecha assim mesmo e cobra o cadastro depois.
 */
export async function getPreviaDeLote(userId: string, desde: string, ate: string) {
  await requireAdmin();
  const parsed = Periodo.safeParse({ userId, desde, ate });
  if (!parsed.success) return { quantidade: 0, totalCents: 0, semDadosBancarios: false };

  const { desde: de, ate: a } = intervalo(desde, ate);
  const [previa, perfil] = await Promise.all([
    previaDeFechamento(userId, de, a),
    buscarPerfil(userId),
  ]);

  return {
    quantidade: previa.quantidade,
    totalCents: previa.totalCents,
    semDadosBancarios: !perfil?.dadosBancarios,
  };
}

export async function fecharLoteDePagamento(
  userId: string,
  desde: string,
  ate: string,
): Promise<Result<{ loteId: string; quantidade: number; totalCents: number }>> {
  const admin = await requireAdmin();

  const parsed = Periodo.safeParse({ userId, desde, ate });
  if (!parsed.success) return fail("Escolha a pessoa e o período do fechamento.");

  const { desde: de, ate: a } = intervalo(desde, ate);
  if (de > a) return fail("A data inicial é posterior à final.");

  // Nome e dados de depósito na mesma leitura: os dois são copiados para o
  // lote, e é essa cópia que o comprovante mostra.
  const alvo = await buscarPerfil(userId);
  if (!alvo) return fail("Pessoa não encontrada.");

  try {
    const resultado = await fecharLote(
      { uid: admin.uid, nome: await nomeDoAtor(admin.uid, admin.email) },
      { userId, userName: alvo.name, dadosBancarios: alvo.dadosBancarios },
      { desde: de, ate: a },
    );
    revalidatePath("/");
    return ok(resultado);
  } catch (erro) {
    return fail(mensagemDeErro(traduzirErro(erro), "Não foi possível fechar o lote."));
  }
}
