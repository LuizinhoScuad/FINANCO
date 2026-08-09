export type TxType = "INCOME" | "EXPENSE";
export type AccountType = "CASH" | "BANK" | "SAVINGS" | "INVESTMENT";

export type UserRole = "ADMIN" | "COLABORADOR";
export type UserStatus = "PENDING" | "ACTIVE" | "BLOCKED";

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
}

// --- Ressarcimento de despesas da equipe -------------------------------------

export type ExpenseStatus = "RASCUNHO" | "ENVIADA" | "APROVADA" | "REJEITADA" | "RESSARCIDA";

/**
 * Despesa de rua a ser ressarcida pela empresa.
 * Valores em CENTAVOS (inteiro) — ver lib/core/money.ts.
 */
export interface Expense {
    id: string;
    userId: string;
    /** Nome desnormalizado para o relatório do admin não precisar cruzar. */
    userName: string;
    amountCents: number;
    date: Date;
    categoryId: string;
    description: string;
    /** Nulo é permitido: a foto é opcional, e a falta dela fica sinalizada. */
    receiptPath: string | null;
    receiptUrl: string | null;
    status: ExpenseStatus;
    rejectionReason: string | null;
    approvedBy: string | null;
    approvedByName: string | null;
    approvedAt: Date | null;
    paymentBatchId: string | null;
    reimbursedAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
}

/** Categoria corporativa — global, mantida pelo admin. */
export interface ExpenseCategory {
    id: string;
    name: string;
    icon: string;
    active: boolean;
    createdAt: Date;
}

export type BatchStatus = "ABERTO" | "PAGO";

/** Fechamento de pagamento: um lote por pessoa por período. */
export interface PaymentBatch {
    id: string;
    userId: string;
    userName: string;
    periodStart: Date;
    periodEnd: Date;
    totalCents: number;
    expenseCount: number;
    status: BatchStatus;
    paidAt: Date | null;
    createdBy: string;
    createdAt: Date;
}

export interface Budget {
    id: string;
    categoryId: string;
    amount: number;
    month: number;
    year: number;
    createdAt: Date;
}
