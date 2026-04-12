// Tipos locais compatíveis com os modelos Prisma
export type TxType = "INCOME" | "EXPENSE";
export type AccountType = "CASH" | "BANK" | "SAVINGS" | "INVESTMENT";

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
