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

export interface Budget {
    id: string;
    categoryId: string;
    amount: number;
    month: number;
    year: number;
    createdAt: Date;
}
