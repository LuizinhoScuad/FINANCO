/**
 * Resultado tipado de uma operação.
 *
 * Existe por um motivo concreto: hoje três telas do sistema (Contas, Categorias
 * e Orçamentos) chamam a action, recebem `{ error }` e **ignoram**. Uma
 * validação recusada faz o formulário fechar como se tivesse dado certo, e o
 * usuário só descobre depois que o dado não está lá.
 *
 * Com `Result<T>`, quem chama é obrigado pelo TypeScript a olhar o `ok` antes
 * de acessar o dado — o erro deixa de ser opcional (Art. 6).
 */
export type Result<T = void> =
  | { ok: true; data: T }
  | { ok: false; error: string; campos?: Record<string, string[]> };

export function ok(): Result<void>;
export function ok<T>(data: T): Result<T>;
export function ok<T>(data?: T): Result<T | void> {
  return { ok: true, data: data as T };
}

export function fail(error: string, campos?: Record<string, string[]>): Result<never> {
  return { ok: false, error, campos };
}

/**
 * Converte a falha de um schema Zod em mensagem legível.
 * Evita o `alert(JSON.stringify(erro))` que hoje mostra chaves cruas ao usuário.
 */
export function failFromZod(flattened: {
  fieldErrors: Record<string, string[] | undefined>;
  formErrors: string[];
}): Result<never> {
  const campos: Record<string, string[]> = {};
  for (const [campo, msgs] of Object.entries(flattened.fieldErrors)) {
    if (msgs?.length) campos[campo] = msgs;
  }

  const primeira =
    flattened.formErrors[0] ?? Object.values(campos)[0]?.[0] ?? "Dados inválidos.";

  return { ok: false, error: primeira, campos };
}

/** Mensagem de erro amigável a partir de uma exceção qualquer. */
export function mensagemDeErro(erro: unknown, padrao = "Algo deu errado."): string {
  if (erro instanceof Error && erro.message) return erro.message;
  if (typeof erro === "string" && erro) return erro;
  return padrao;
}
