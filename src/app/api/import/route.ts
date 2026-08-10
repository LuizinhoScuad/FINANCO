import { NextRequest, NextResponse } from "next/server";
import { getSessionUser, getLiveStatus } from "@/lib/auth";
import { adminDb } from "@/lib/firebase-admin";
import { copiarAntesDeSobrescrever } from "@/lib/guardrails/backup";
import { ArquivoDeBackup, descreverFalha, verificarIntegridade } from "@/lib/guardrails/validate";
import { contarRegistros } from "@/lib/core/repositories/snapshot.repo";

export const dynamic = "force-dynamic";

/**
 * Restauração de backup — a operação mais perigosa do sistema.
 *
 * COMO ERA: conferia apenas se os quatro campos eram listas, apagava TODAS as
 * coleções do usuário e reinseria o conteúdo. Sem validação do que entrava, sem
 * cópia prévia, sem prévia do impacto e sem tratamento de erro no trecho
 * destrutivo. Um arquivo malformado ou uma queda no meio apagava tudo.
 *
 * COMO É AGORA, nesta ordem, sem pular etapa (Art. 1):
 *   1. valida o arquivo inteiro contra o schema
 *   2. confere a coerência interna (nada aponta para o que não existe)
 *   3. devolve a PRÉVIA e para — nada foi escrito
 *   4. só com confirmação explícita: copia o estado atual
 *   5. só com a cópia confirmada: substitui
 */

const LIMITE_BYTES = 10 * 1024 * 1024;

/** Texto ISO volta a ser Date; o resto passa como está. */
function reidratar(valor: unknown): unknown {
  if (typeof valor === "string" && /^\d{4}-\d{2}-\d{2}T[\d:.]+Z?$/.test(valor)) {
    const d = new Date(valor);
    if (!Number.isNaN(d.getTime())) return d;
  }
  if (valor && typeof valor === "object" && "_seconds" in valor) {
    const t = valor as { _seconds: number };
    return new Date(t._seconds * 1000);
  }
  return valor;
}

export async function POST(req: NextRequest) {
  const usuario = await getSessionUser();
  if (!usuario) {
    return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  }
  if ((await getLiveStatus(usuario.uid)) !== "ACTIVE") {
    return NextResponse.json({ error: "Conta não liberada." }, { status: 403 });
  }

  const tamanho = Number(req.headers.get("content-length") ?? 0);
  if (tamanho > LIMITE_BYTES) {
    return NextResponse.json({ error: "Arquivo grande demais (máximo 10 MB)." }, { status: 413 });
  }

  let corpo: unknown;
  try {
    corpo = await req.json();
  } catch {
    return NextResponse.json({ error: "O arquivo não é um JSON válido." }, { status: 400 });
  }

  const envelope = corpo as { confirmado?: boolean; dados?: unknown };
  const bruto = envelope?.dados ?? corpo;

  // 1. Schema
  const parsed = ArquivoDeBackup.safeParse(bruto);
  if (!parsed.success) {
    return NextResponse.json({ error: descreverFalha(parsed.error) }, { status: 400 });
  }
  const dados = parsed.data;

  // 2. Coerência interna
  const problemas = verificarIntegridade(dados);
  if (problemas.length > 0) {
    return NextResponse.json(
      {
        error: "O arquivo tem inconsistências e não pode ser restaurado.",
        problemas,
      },
      { status: 422 },
    );
  }

  const entrando = {
    accounts: dados.accounts.length,
    categories: dados.categories.length,
    budgets: dados.budgets.length,
    transactions: dados.transactions.length,
  };

  // 3. Prévia — nada foi escrito até aqui
  if (envelope?.confirmado !== true) {
    const atual = await contarRegistros();
    return NextResponse.json({
      previa: true,
      atual,
      entrando,
      aviso:
        "Os dados atuais serão SUBSTITUÍDOS pelo conteúdo do arquivo. " +
        "Uma cópia de segurança será gravada automaticamente antes.",
    });
  }

  // 4. Cópia de segurança — aborta se falhar
  let copia;
  try {
    copia = await copiarAntesDeSobrescrever(usuario.uid);
  } catch (erro) {
    return NextResponse.json(
      {
        error:
          "Não foi possível gravar a cópia de segurança. Nada foi alterado. " +
          (erro instanceof Error ? erro.message : ""),
      },
      { status: 500 },
    );
  }

  // 5. Substituição
  const raiz = adminDb.collection("users").doc(usuario.uid);
  const colecoes = {
    accounts: raiz.collection("accounts"),
    categories: raiz.collection("categories"),
    budgets: raiz.collection("budgets"),
    transactions: raiz.collection("transactions"),
  } as const;

  try {
    for (const ref of Object.values(colecoes)) {
      const snap = await ref.get();
      for (let i = 0; i < snap.docs.length; i += 400) {
        const lote = adminDb.batch();
        for (const d of snap.docs.slice(i, i + 400)) lote.delete(d.ref);
        await lote.commit();
      }
    }

    for (const [nome, itens] of Object.entries(dados) as [string, unknown][]) {
      if (!(nome in colecoes)) continue;
      const ref = colecoes[nome as keyof typeof colecoes];
      const lista = itens as Array<Record<string, unknown>>;

      for (let i = 0; i < lista.length; i += 400) {
        const lote = adminDb.batch();
        for (const item of lista.slice(i, i + 400)) {
          const { id, ...resto } = item;
          const normalizado: Record<string, unknown> = {};
          for (const [k, v] of Object.entries(resto)) normalizado[k] = reidratar(v);
          lote.set(ref.doc(String(id)), normalizado);
        }
        await lote.commit();
      }
    }
  } catch (erro) {
    return NextResponse.json(
      {
        error:
          "A restauração falhou no meio do processo. Seus dados anteriores estão na cópia de segurança: " +
          copia.caminho,
        detalhe: erro instanceof Error ? erro.message : String(erro),
        copiaDeSeguranca: copia.caminho,
      },
      { status: 500 },
    );
  }

  return NextResponse.json({
    success: true,
    restaurado: entrando,
    copiaDeSeguranca: { caminho: copia.caminho, registros: copia.registros },
  });
}
