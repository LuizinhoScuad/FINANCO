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
}

export interface Budget {
    id: string;
    categoryId: string;
    amount: number;
    month: number;
    year: number;
    createdAt: Date;
}
