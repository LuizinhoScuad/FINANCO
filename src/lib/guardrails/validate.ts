import { z } from "zod";

/**
 * Validação do arquivo de backup — Art. 1 e Art. 6.
 *
 * A rota de importação apaga TODAS as coleções do usuário antes de reinserir.
 * A versão anterior conferia apenas se os quatro campos eram listas: qualquer
 * lista de lixo passava, os dados eram apagados e o lixo entrava no lugar.
 */

/** Aceita Date, texto ISO ou Timestamp serializado do Firestore. */
const DataFlexivel = z.union([
  z.string().refine((s) => !Number.isNaN(Date.parse(s)), "Data inválida."),
  z.date(),
  z.object({ _seconds: z.number(), _nanoseconds: z.number() }),
]);

const Conta = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  type: z.string().min(1),
  color: z.string().min(1),
  balance: z.number(),
  createdAt: DataFlexivel.optional().nullable(),
  updatedAt: DataFlexivel.optional().nullable(),
});

const Categoria = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  icon: z.string().optional().nullable(),
  type: z.enum(["INCOME", "EXPENSE"]),
  color: z.string().optional().nullable(),
  createdAt: DataFlexivel.optional().nullable(),
});

const Orcamento = z.object({
  id: z.string().min(1),
  categoryId: z.string().min(1),
  amount: z.number().nonnegative(),
  month: z.number().int().min(1).max(12),
  year: z.number().int().min(2000).max(2200),
  createdAt: DataFlexivel.optional().nullable(),
});

const Lancamento = z.object({
  id: z.string().min(1),
  description: z.string(),
  amount: z.number(),
  type: z.enum(["INCOME", "EXPENSE"]),
  status: z.enum(["PENDING", "COMPLETED"]),
  date: DataFlexivel,
  accountId: z.string().min(1),
  categoryId: z.string().min(1),
  payee: z.string().optional().nullable(),
  tags: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
  receiptUrl: z.string().optional().nullable(),
  isInstallment: z.boolean().optional().nullable(),
  installment: z.number().optional().nullable(),
  totalInstallments: z.number().optional().nullable(),
  createdAt: DataFlexivel.optional().nullable(),
  updatedAt: DataFlexivel.optional().nullable(),

  // Pedido de reembolso. Precisam estar declarados: `z.object` descarta campo
  // desconhecido, e sem isto uma restauração devolveria todos os pedidos ao
  // estado de lançamento particular — apagando aprovações e pagamentos.
  // Opcionais porque backup antigo, feito antes desta funcionalidade, não os tem.
  reembolso: z.boolean().optional().nullable(),
  aprovacao: z.enum(["ENVIADA", "APROVADA", "REJEITADA", "RESSARCIDA"]).optional().nullable(),
  rejectionReason: z.string().optional().nullable(),
  approvedBy: z.string().optional().nullable(),
  approvedByName: z.string().optional().nullable(),
  approvedAt: DataFlexivel.optional().nullable(),
  paymentBatchId: z.string().optional().nullable(),
  reimbursedAt: DataFlexivel.optional().nullable(),
});

export const ArquivoDeBackup = z.object({
  exportedAt: z.string().optional(),
  versao: z.number().optional(),
  accounts: z.array(Conta),
  categories: z.array(Categoria),
  budgets: z.array(Orcamento),
  transactions: z.array(Lancamento),
});

export type ArquivoDeBackup = z.infer<typeof ArquivoDeBackup>;

export type ProblemaDeIntegridade = { tipo: string; detalhe: string };

/**
 * Coerência interna: todo lançamento aponta para conta e categoria que existem
 * DENTRO do próprio arquivo.
 *
 * Sem esta checagem, restaurar um backup truncado produziria um sistema onde
 * lançamentos apontam para o nada — e o saldo nunca mais fecharia.
 */
export function verificarIntegridade(dados: ArquivoDeBackup): ProblemaDeIntegridade[] {
  const problemas: ProblemaDeIntegridade[] = [];

  const contas = new Set(dados.accounts.map((c) => c.id));
  const categorias = new Set(dados.categories.map((c) => c.id));

  const semConta = dados.transactions.filter((l) => !contas.has(l.accountId));
  if (semConta.length > 0) {
    problemas.push({
      tipo: "Lançamento sem conta",
      detalhe: `${semConta.length} lançamento(s) apontam para conta que não está no arquivo.`,
    });
  }

  const semCategoria = dados.transactions.filter((l) => !categorias.has(l.categoryId));
  if (semCategoria.length > 0) {
    problemas.push({
      tipo: "Lançamento sem categoria",
      detalhe: `${semCategoria.length} lançamento(s) apontam para categoria que não está no arquivo.`,
    });
  }

  const orcamentoOrfao = dados.budgets.filter((o) => !categorias.has(o.categoryId));
  if (orcamentoOrfao.length > 0) {
    problemas.push({
      tipo: "Orçamento sem categoria",
      detalhe: `${orcamentoOrfao.length} orçamento(s) apontam para categoria que não está no arquivo.`,
    });
  }

  const duplicados = (ids: string[]) => ids.length !== new Set(ids).size;
  if (duplicados(dados.accounts.map((c) => c.id))) {
    problemas.push({ tipo: "Contas duplicadas", detalhe: "Há contas com o mesmo identificador." });
  }
  if (duplicados(dados.transactions.map((l) => l.id))) {
    problemas.push({ tipo: "Lançamentos duplicados", detalhe: "Há lançamentos com o mesmo identificador." });
  }

  return problemas;
}

/** Primeira mensagem legível de uma falha de schema, sem chaves cruas. */
export function descreverFalha(erro: z.ZodError): string {
  const primeira = erro.issues[0];
  if (!primeira) return "Arquivo de backup inválido.";
  const caminho = primeira.path.join(" → ");
  return caminho ? `Arquivo inválido em "${caminho}": ${primeira.message}` : primeira.message;
}
