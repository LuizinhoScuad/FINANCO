import "server-only";
import { FieldValue } from "firebase-admin/firestore";
import type { DocumentReference, Transaction } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase-admin";

/**
 * Guardrail de atomicidade — Art. 2 da Constituição.
 *
 * O PROBLEMA QUE ISTO RESOLVE
 *
 * A versão anterior mantinha o saldo da conta com três escritas independentes:
 *
 *   1. reverte o saldo antigo
 *   2. grava a transação
 *   3. aplica o saldo novo
 *
 * Qualquer interrupção entre 1 e 3 — queda de rede, tempo esgotado, aba fechada
 * — deixava o saldo permanentemente errado, sem registro e sem aviso. E dois
 * cliques rápidos no mesmo botão contavam o valor duas vezes.
 *
 * Num sistema que controla dinheiro, saldo errado em silêncio é o pior modo de
 * falha possível.
 */

/** Erro de regra de negócio: aborta a transação com mensagem para o usuário. */
export class ErroDeNegocio extends Error {}

/** Lançado quando a mesma operação chega duas vezes. */
export class OperacaoDuplicada extends ErroDeNegocio {
  constructor(mensagem = "Este lançamento já foi salvo.") {
    super(mensagem);
  }
}

/**
 * Executa leitura e escrita dependentes como uma unidade.
 *
 * Regra do Firestore: TODAS as leituras vêm antes de qualquer escrita dentro do
 * bloco. O callback pode ser repetido automaticamente sob concorrência, então
 * ele não pode ter efeito colateral fora do banco (nada de enviar e-mail,
 * gravar arquivo ou incrementar contador em memória lá dentro).
 */
export async function emTransacao<T>(fn: (t: Transaction) => Promise<T>): Promise<T> {
  return adminDb.runTransaction(fn);
}

/** Alteração relativa de saldo — atômica no campo, mesmo sob concorrência. */
export function ajusteDeSaldo(delta: number) {
  return FieldValue.increment(delta);
}

/**
 * Cria um documento com identificador determinístico.
 *
 * É o mecanismo de idempotência: reenviar o mesmo formulário produz o mesmo
 * identificador, e a segunda tentativa falha em vez de duplicar o lançamento e
 * o saldo. Melhor recusar com "já foi salvo" do que aceitar em dobro.
 */
export function criarUnico(t: Transaction, ref: DocumentReference, dados: Record<string, unknown>) {
  t.create(ref, dados);
}

/** Traduz a falha de duplicidade do Firestore em erro que a interface entende. */
export function traduzirErro(erro: unknown): Error {
  if (erro instanceof ErroDeNegocio) return erro;

  const codigo = (erro as { code?: number | string })?.code;
  const mensagem = erro instanceof Error ? erro.message : String(erro);

  // 6 = ALREADY_EXISTS
  if (codigo === 6 || /already exists/i.test(mensagem)) {
    return new OperacaoDuplicada();
  }

  if (/deadline|unavailable|aborted/i.test(mensagem)) {
    return new ErroDeNegocio("O banco de dados demorou a responder. Nada foi salvo — tente de novo.");
  }

  return erro instanceof Error ? erro : new Error(mensagem);
}
