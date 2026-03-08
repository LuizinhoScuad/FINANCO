import { getTransactions } from "@/actions/transactions";
import { getCategories } from "@/actions/categories";
import { getAccounts } from "@/actions/accounts";
import { TransacoesClient } from "./TransacoesClient";
import { currentMonth } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function TransacoesPage({
    searchParams,
}: {
    searchParams: Promise<{ month?: string; year?: string; type?: string; categoryId?: string }>;
}) {
    const params = await searchParams;
    const { month, year } = currentMonth();
    const m = params.month ? parseInt(params.month) : month;
    const y = params.year ? parseInt(params.year) : year;

    const [transactions, categories, accounts] = await Promise.all([
        getTransactions(m, y, params.type, params.categoryId),
        getCategories(),
        getAccounts(),
    ]);

    return (
        <TransacoesClient
            transactions={transactions}
            categories={categories}
            accounts={accounts}
            month={m}
            year={y}
        />
    );
}
