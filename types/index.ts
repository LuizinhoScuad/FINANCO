// Tipos locais compatíveis com os modelos Prisma
export type TxType = "INCOME" | "EXPENSE";
export type AccountType = "CASH" | "BANK" | "SAVINGS" | "INVESTMENT";

export interface Account {
    id: string;
    name: string;
    type: AccountType;
    color: string;
    balance: number;
    createdAt: Date;
    updatedAt: Date;
}

export interface Category {
    id: string;
    name: string;
    icon: string;
    type: TxType;
    color: string;
    createdAt: Date;
}

export interface Transaction {
    id: string;
    description: string;
    amount: number;
    type: TxType;
    status: "COMPLETED" | "PENDING";
    date: Date;
    accountId: string;
    categoryId: string;
    payee: string | null;
    tags: string | null;
    isInstallment: boolean;
    installment: number | null;
    totalInstallments: number | null;
    notes: string | null;
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
