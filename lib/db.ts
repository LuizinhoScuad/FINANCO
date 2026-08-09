import { randomUUID } from "node:crypto";
import { FieldValue, Firestore, Timestamp } from "firebase-admin/firestore";
import { requireCurrentUserId } from "@/lib/auth";
import { adminDb } from "@/lib/firebase-admin";

type AccountRecord = {
  id: string;
  name: string;
  type: string;
  color: string;
  balance: number;
  createdAt: Date;
  updatedAt: Date;
};

type CategoryRecord = {
  id: string;
  name: string;
  icon: string;
  type: string;
  color: string;
  createdAt: Date;
};

type BudgetRecord = {
  id: string;
  categoryId: string;
  amount: number;
  month: number;
  year: number;
  createdAt: Date;
};

type TransactionRecord = {
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
};

type WhereDate = { gte?: Date; lte?: Date };
type WhereFilter = Record<string, unknown> | undefined;

const firestore = adminDb;
const seededUsers = new Set<string>();
const seedPromises = new Map<string, Promise<void>>();

const expenseCategories = [
  { name: "Alimentacao", icon: "🍔", color: "#f59e0b" },
  { name: "Transporte", icon: "🚗", color: "#60a5fa" },
  { name: "Saude", icon: "🏥", color: "#34d399" },
  { name: "Moradia", icon: "🏠", color: "#f97316" },
  { name: "Lazer", icon: "🎬", color: "#a78bfa" },
  { name: "Vestuario", icon: "👕", color: "#fb7185" },
  { name: "Educacao", icon: "📚", color: "#22d3ee" },
  { name: "Eletronicos", icon: "📱", color: "#6366f1" },
  { name: "Mercado", icon: "🛒", color: "#84cc16" },
  { name: "Outros", icon: "🔧", color: "#6b7a99" },
];

const incomeCategories = [
  { name: "Salario", icon: "💰", color: "#00d98b" },
  { name: "Freelance", icon: "💼", color: "#00d98b" },
  { name: "Investimentos", icon: "📈", color: "#00d98b" },
  { name: "Outros", icon: "✨", color: "#00d98b" },
];

function normalizeDate(value: Date | Timestamp | string | null | undefined) {
  if (!value) return new Date();
  if (value instanceof Date) return value;
  if (value instanceof Timestamp) return value.toDate();
  return new Date(value);
}

function toAccount(id: string, data: Record<string, unknown>): AccountRecord {
  return {
    id,
    name: String(data.name ?? ""),
    type: String(data.type ?? ""),
    color: String(data.color ?? "#00d98b"),
    balance: Number(data.balance ?? 0),
    createdAt: normalizeDate(data.createdAt as Date | Timestamp | string | undefined),
    updatedAt: normalizeDate(data.updatedAt as Date | Timestamp | string | undefined),
  };
}

function toCategory(id: string, data: Record<string, unknown>): CategoryRecord {
  return {
    id,
    name: String(data.name ?? ""),
    icon: String(data.icon ?? "📁"),
    type: String(data.type ?? ""),
    color: String(data.color ?? "#00d98b"),
    createdAt: normalizeDate(data.createdAt as Date | Timestamp | string | undefined),
  };
}

function toBudget(id: string, data: Record<string, unknown>): BudgetRecord {
  return {
    id,
    categoryId: String(data.categoryId ?? ""),
    amount: Number(data.amount ?? 0),
    month: Number(data.month ?? 1),
    year: Number(data.year ?? new Date().getFullYear()),
    createdAt: normalizeDate(data.createdAt as Date | Timestamp | string | undefined),
  };
}

function toTransaction(id: string, data: Record<string, unknown>): TransactionRecord {
  return {
    id,
    description: String(data.description ?? ""),
    amount: Number(data.amount ?? 0),
    type: String(data.type ?? ""),
    status: String(data.status ?? "COMPLETED"),
    date: normalizeDate(data.date as Date | Timestamp | string | undefined),
    accountId: String(data.accountId ?? ""),
    categoryId: String(data.categoryId ?? ""),
    payee: data.payee ? String(data.payee) : null,
    tags: data.tags ? String(data.tags) : null,
    isInstallment: Boolean(data.isInstallment),
    installment: data.installment == null ? null : Number(data.installment),
    totalInstallments: data.totalInstallments == null ? null : Number(data.totalInstallments),
    notes: data.notes ? String(data.notes) : null,
    receiptUrl: data.receiptUrl ? String(data.receiptUrl) : null,
    createdAt: normalizeDate(data.createdAt as Date | Timestamp | string | undefined),
    updatedAt: normalizeDate(data.updatedAt as Date | Timestamp | string | undefined),
  };
}

function matchesWhere(item: Record<string, unknown>, where: WhereFilter) {
  if (!where) return true;
  return Object.entries(where).every(([key, value]) => {
    if (value && typeof value === "object" && "gte" in value) {
      const date = normalizeDate(item[key] as Date | Timestamp | string | undefined);
      const range = value as WhereDate;
      if (range.gte && date < range.gte) return false;
      if (range.lte && date > range.lte) return false;
      return true;
    }

    return item[key] === value;
  });
}

function sortByField<T extends Record<string, unknown>>(items: T[], orderBy?: { [K in keyof T]?: "asc" | "desc" }) {
  if (!orderBy) return items;
  const [field, direction] = Object.entries(orderBy)[0] as [keyof T, "asc" | "desc"];
  return [...items].sort((a, b) => {
    const av = a[field];
    const bv = b[field];
    const dir = direction === "desc" ? -1 : 1;
    if (av instanceof Date && bv instanceof Date) return (av.getTime() - bv.getTime()) * dir;
    if (typeof av === "number" && typeof bv === "number") return (av - bv) * dir;
    return String(av).localeCompare(String(bv)) * dir;
  });
}

async function getUserCollections() {
  const userId = await requireCurrentUserId();
  const root = firestore.collection("users").doc(userId);
  return {
    userId,
    root,
    accounts: root.collection("accounts"),
    categories: root.collection("categories"),
    budgets: root.collection("budgets"),
    transactions: root.collection("transactions"),
  };
}

async function getCollection<T>(
  name: "accounts" | "categories" | "budgets" | "transactions",
  mapper: (id: string, data: Record<string, unknown>) => T,
) {
  const collections = await getUserCollections();
  const snapshot = await collections[name].get();
  return snapshot.docs.map((doc) => mapper(doc.id, doc.data()));
}

async function ensureSeedData() {
  const { userId, root, accounts, categories } = await getUserCollections();
  if (seededUsers.has(userId)) return;

  const existing = seedPromises.get(userId);
  if (existing) {
    await existing;
    return;
  }

  const seedPromise = (async () => {
    const [categoriesSnap, accountsSnap] = await Promise.all([categories.limit(1).get(), accounts.limit(1).get()]);
    const now = new Date();

    if (categoriesSnap.empty) {
      const batch = firestore.batch();
      for (const category of expenseCategories) {
        batch.set(categories.doc(), { ...category, type: "EXPENSE", createdAt: now });
      }
      for (const category of incomeCategories) {
        batch.set(categories.doc(), { ...category, type: "INCOME", createdAt: now });
      }
      await batch.commit();
    }

    if (accountsSnap.empty) {
      await accounts.add({
        name: "Carteira",
        type: "CASH",
        color: "#00d98b",
        balance: 0,
        createdAt: now,
        updatedAt: now,
      });
    }

    await root.set(
      {
        updatedAt: now,
      },
      { merge: true },
    );

    seededUsers.add(userId);
  })();

  seedPromises.set(userId, seedPromise);
  try {
    await seedPromise;
  } finally {
    seedPromises.delete(userId);
  }
}

async function getAccountsCollection() {
  await ensureSeedData();
  return sortByField(await getCollection("accounts", toAccount), { createdAt: "asc" });
}

async function getCategoriesCollection() {
  await ensureSeedData();
  return getCollection("categories", toCategory);
}

async function getTransactionsCollection() {
  await ensureSeedData();
  return getCollection("transactions", toTransaction);
}

async function getBudgetsCollection() {
  await ensureSeedData();
  return getCollection("budgets", toBudget);
}

async function getExportSnapshot() {
  const [accounts, categories, budgets, transactions] = await Promise.all([
    getAccountsCollection(),
    getCategoriesCollection(),
    getBudgetsCollection(),
    getTransactionsCollection(),
  ]);

  return {
    exportedAt: new Date().toISOString(),
    accounts,
    categories,
    budgets,
    transactions,
  };
}

export const db: any = {
  account: {
    async findMany(args?: { select?: { balance: true }; orderBy?: { createdAt: "asc" | "desc" } }) {
      const accounts = await getAccountsCollection();
      if (args?.select?.balance) {
        return accounts.map((account) => ({ balance: account.balance }));
      }
      return args?.orderBy ? sortByField(accounts, args.orderBy) : accounts;
    },
    async create({ data }: { data: Record<string, unknown> }) {
      const { accounts } = await getUserCollections();
      const now = new Date();
      const ref = await accounts.add({ ...data, createdAt: now, updatedAt: now });
      return toAccount(ref.id, { ...data, createdAt: now, updatedAt: now });
    },
    async update({ where, data }: { where: { id: string }; data: Record<string, unknown> }) {
      const { accounts } = await getUserCollections();
      const payload: Record<string, unknown> = { updatedAt: new Date() };
      for (const [key, value] of Object.entries(data)) {
        if (value && typeof value === "object" && "increment" in value) {
          payload[key] = FieldValue.increment(Number((value as { increment: number }).increment));
        } else {
          payload[key] = value;
        }
      }
      await accounts.doc(where.id).update(payload);
    },
    async delete({ where }: { where: { id: string } }) {
      const { accounts, transactions } = await getUserCollections();
      const txs = await getTransactionsCollection();
      const batch = firestore.batch();
      for (const tx of txs.filter((item) => item.accountId === where.id)) {
        batch.delete(transactions.doc(tx.id));
      }
      batch.delete(accounts.doc(where.id));
      await batch.commit();
    },
  },
  category: {
    async findMany(args?: { where?: WhereFilter; orderBy?: { name: "asc" | "desc" } }) {
      const categories = await getCategoriesCollection();
      const filtered = categories.filter((category) => matchesWhere(category as Record<string, unknown>, args?.where));
      return args?.orderBy ? sortByField(filtered, args.orderBy) : filtered;
    },
    async create({ data }: { data: Record<string, unknown> }) {
      const { categories } = await getUserCollections();
      const now = new Date();
      const ref = await categories.add({ ...data, createdAt: now });
      return toCategory(ref.id, { ...data, createdAt: now });
    },
    async update({ where, data }: { where: { id: string }; data: Record<string, unknown> }) {
      const { categories } = await getUserCollections();
      await categories.doc(where.id).update(data);
    },
    async delete({ where }: { where: { id: string } }) {
      const { budgets, categories } = await getUserCollections();
      const [allBudgets, transactions] = await Promise.all([getBudgetsCollection(), getTransactionsCollection()]);
      if (transactions.some((tx) => tx.categoryId === where.id)) {
        throw new Error("Categoria em uso por transacoes.");
      }

      const batch = firestore.batch();
      for (const budget of allBudgets.filter((item) => item.categoryId === where.id)) {
        batch.delete(budgets.doc(budget.id));
      }
      batch.delete(categories.doc(where.id));
      await batch.commit();
    },
  },
  budget: {
    async findMany(args?: { where?: WhereFilter; include?: { category: true } }) {
      const budgets = (await getBudgetsCollection()).filter((budget) =>
        matchesWhere(budget as Record<string, unknown>, args?.where),
      );
      if (!args?.include?.category) return budgets;

      const categories = await getCategoriesCollection();
      const categoryMap = new Map(categories.map((category) => [category.id, category]));
      return budgets.map((budget) => ({
        ...budget,
        category: categoryMap.get(budget.categoryId),
      }));
    },
    async upsert({
      where,
      update,
      create,
    }: {
      where: { categoryId_month_year: { categoryId: string; month: number; year: number } };
      update: Record<string, unknown>;
      create: Record<string, unknown>;
    }) {
      const { budgets } = await getUserCollections();
      const existing = (await getBudgetsCollection()).find(
        (budget) =>
          budget.categoryId === where.categoryId_month_year.categoryId &&
          budget.month === where.categoryId_month_year.month &&
          budget.year === where.categoryId_month_year.year,
      );

      if (existing) {
        await budgets.doc(existing.id).update(update);
        return;
      }

      await budgets.add({ ...create, createdAt: new Date() });
    },
    async delete({ where }: { where: { id: string } }) {
      const { budgets } = await getUserCollections();
      await budgets.doc(where.id).delete();
    },
  },
  transaction: {
    async findMany(args?: {
      where?: WhereFilter;
      include?: { account: true; category: true } | { category: true };
      orderBy?: { date: "asc" | "desc" };
    }) {
      const transactions = (await getTransactionsCollection()).filter((transaction) =>
        matchesWhere(transaction as Record<string, unknown>, args?.where),
      );
      const ordered = args?.orderBy ? sortByField(transactions, args.orderBy) : transactions;
      if (!args?.include) return ordered;

      const [accounts, categories] = await Promise.all([getAccountsCollection(), getCategoriesCollection()]);
      const accountMap = new Map(accounts.map((account) => [account.id, account]));
      const categoryMap = new Map(categories.map((category) => [category.id, category]));

      return ordered.map((transaction) => ({
        ...transaction,
        ...(args.include && "account" in args.include ? { account: accountMap.get(transaction.accountId) } : {}),
        category: categoryMap.get(transaction.categoryId),
      }));
    },
    async create({ data }: { data: Record<string, unknown> }) {
      const { transactions } = await getUserCollections();
      const now = new Date();
      const ref = await transactions.add({ ...data, createdAt: now, updatedAt: now });
      return toTransaction(ref.id, { ...data, createdAt: now, updatedAt: now });
    },
    async findUnique({ where }: { where: { id: string } }) {
      const { transactions } = await getUserCollections();
      const doc = await transactions.doc(where.id).get();
      if (!doc.exists) return null;
      return toTransaction(doc.id, doc.data() ?? {});
    },
    async update({ where, data }: { where: { id: string }; data: Record<string, unknown> }) {
      const { transactions } = await getUserCollections();
      await transactions.doc(where.id).update({ ...data, updatedAt: new Date() });
    },
    async delete({ where }: { where: { id: string } }) {
      const { transactions } = await getUserCollections();
      await transactions.doc(where.id).delete();
    },
    async groupBy({ where }: { by: string[]; where?: WhereFilter; _sum: { amount: true } }) {
      const transactions = (await getTransactionsCollection()).filter((transaction) =>
        matchesWhere(transaction as Record<string, unknown>, where),
      );
      const totals = new Map<string, number>();
      for (const transaction of transactions) {
        totals.set(transaction.categoryId, (totals.get(transaction.categoryId) ?? 0) + Number(transaction.amount));
      }
      return Array.from(totals.entries()).map(([categoryId, amount]) => ({
        categoryId,
        _sum: { amount },
      }));
    },
  },
  helpers: {
    firestore: firestore as Firestore,
    randomId: () => randomUUID(),
    exportData: getExportSnapshot,
  },
};
