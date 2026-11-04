export type TxType = "INCOME" | "EXPENSE";
export type AccountType = "CASH" | "BANK" | "SAVINGS" | "INVESTMENT";

export type UserRole = "ADMIN" | "COLABORADOR";
export type UserStatus = "PENDING" | "ACTIVE" | "BLOCKED";

export type TipoChavePix = "CPF" | "CNPJ" | "EMAIL" | "TELEFONE" | "ALEATORIA";
export type TipoConta = "CORRENTE" | "POUPANCA";

/**
 * Para onde o dinheiro do reembolso vai — mapa em users/{uid}.dadosBancarios.
 *
 * O pagamento sai por fora do sistema: alguém do financeiro lê o comprovante e
 * deposita. PIX é obrigatório; banco/agência/conta são a alternativa para
 * quando o PIX falha, e entram todos ou nenhum.
 *
 * Documento sem o campo é lido como "sem dados" e aciona o portão de acesso —
 * nunca uma migração automática (Art. 10).
 */
export interface DadosBancarios {
    /** Quem recebe. Nem sempre é o nome do perfil (conta conjunta, por exemplo). */
    titular: string;
    /** 11 dígitos, sem máscara. */
    cpf: string;
    pixTipo: TipoChavePix;
    /** Já normalizada: telefone com +55, e-mail em minúsculas, CPF só com dígitos. */
    pixChave: string;
    banco: string | null;
    agencia: string | null;
    /** Com dígito, como no extrato: "12345-6". */
    conta: string | null;
    tipoConta: TipoConta | null;
    atualizadoEm: Date;
}

/** Perfil em users/{uid}. A fonte da verdade sobre quem é quem. */
export interface UserProfile {
    uid: string;
    name: string;
    email: string | null;
    role: UserRole;
    status: UserStatus;
    createdAt: Date;
    updatedAt: Date;
    approvedBy: string | null;
    approvedAt: Date | null;
    /** Nulo enquanto a pessoa não cadastrou como quer receber. */
    dadosBancarios: DadosBancarios | null;
    /** Último acesso, vindo do Firebase Auth — não fica gravado no documento. */
    lastSignInAt: Date | null;
}

export interface Account {
    id: string;
    name: string;
    type: string;
    color: string;
    balance: number;
    createdAt: Date;
    updatedAt: Date;
}

export interface Category {
    id: string;
    name: string;
    icon: string;
    type: string;
    color: string;
    createdAt: Date;
}

/**
 * Situação do pedido de reembolso — só existe quando `reembolso` é verdadeiro.
 *
 * Não há rascunho: o lançamento é salvo já pedindo, porque em Transações o
 * registro e o pedido são o mesmo gesto.
 */
export type AprovacaoStatus = "ENVIADA" | "APROVADA" | "REJEITADA" | "RESSARCIDA";

export interface Transaction {
    id: string;
    description: string;
    amount: number;
    type: string;
    status: string;
    date: Date;
    accountId: string;
    categoryId: string;
    payee: string | null;
    tags: string | null;
    isInstallment: boolean;
    installment: number | null;
    totalInstallments: number | null;
    notes: string | null;
    receiptUrl: string | null;
    createdAt: Date;
    updatedAt: Date;

    // --- pedido de reembolso à empresa ---------------------------------------
    /** Marcado, o lançamento entra na fila do gestor. Desmarcado, é particular. */
    reembolso: boolean;
    /** Nulo quando o lançamento é particular. */
    aprovacao: AprovacaoStatus | null;
    rejectionReason: string | null;
    approvedBy: string | null;
    approvedByName: string | null;
    approvedAt: Date | null;
    paymentBatchId: string | null;
    reimbursedAt: Date | null;

    /**
     * Quem registrou, quando não foi o próprio dono: o administrador lançando
     * em nome da pessoa (RF-65). Nulo = o dono mesmo — é como todo lançamento
     * anterior a esta funcionalidade é lido, sem migração (RNF-13).
     */
    lancadoPor: string | null;
    lancadoPorNome: string | null;
}

/** Lançamento de reembolso com o dono identificado — visão do gestor. */
export type PedidoDeReembolso = Transaction & {
    userId: string;
    userName: string;
    categoryName: string;
    accountName: string;
};

export type BatchStatus = "ABERTO" | "PAGO";

/** Fechamento de pagamento: um lote por pessoa por período. */
export interface PaymentBatch {
    id: string;
    userId: string;
    userName: string;
    periodStart: Date;
    periodEnd: Date;
    /** Em CENTAVOS (inteiro) — o total pago não pode derivar (ver money.ts). */
    totalCents: number;
    expenseCount: number;
    status: BatchStatus;
    paidAt: Date | null;
    createdBy: string;
    createdAt: Date;
    /**
     * Cópia dos dados da pessoa no momento do fechamento.
     *
     * É cópia, não referência: o comprovante prova para onde o dinheiro foi
     * enviado à época, e uma edição posterior do cadastro não reescreve isso.
     * Nulo em lote fechado antes desta funcionalidade — a leitura completa com
     * o cadastro atual.
     */
    dadosBancarios: DadosBancarios | null;
    /**
     * Estornos feitos DEPOIS do pagamento. `totalCents` continua sendo o que
     * saiu do caixa; isto é o que a pessoa recebeu a mais e deve compensar.
     * Zero e vazio em lote sem estorno — nenhuma migração (RNF-13).
     */
    estornadoCents: number;
    estornos: EstornoNoLote[];
}

/** Um item estornado de um lote já pago, como gravado no próprio lote. */
export interface EstornoNoLote {
    transactionId: string;
    description: string;
    amountCents: number;
    motivo: string;
    estornadoEm: Date;
    estornadoPorNome: string;
}

/**
 * A cópia guardada de um lançamento estornado — `estornos/{transactionId}`.
 *
 * É o que torna o estorno reversível e auditável: quem, quando, por quê, e o
 * documento inteiro como estava (Art. 6).
 */
export interface Estorno {
    id: string;
    userId: string;
    userName: string;
    description: string;
    amount: number;
    date: Date;
    /** Situação do pedido na hora do estorno; nulo se era particular. */
    aprovacaoNaEpoca: AprovacaoStatus | null;
    /** Preenchido quando o estorno veio depois do pagamento. */
    paymentBatchId: string | null;
    motivo: string;
    estornadoPor: string;
    estornadoPorNome: string;
    estornadoEm: Date;
    /** O documento original, intacto. */
    original: Record<string, unknown>;
}

/** O estorno como a tela o recebe: tudo menos a cópia do documento. */
export type EstornoResumido = Omit<Estorno, "original">;

export interface Budget {
    id: string;
    categoryId: string;
    amount: number;
    month: number;
    year: number;
    createdAt: Date;
}
