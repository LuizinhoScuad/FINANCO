import { getTransactions } from "@/actions/transactions";
import { getCategories } from "@/actions/categories";
import { getAccounts } from "@/actions/accounts";
import { TransacoesClient } from "./TransacoesClient";
import { currentMonth } from "@/lib/utils";

export const dynamic = "force-dynamic";

/**
 * Teto da listagem sem recorte de mês.
 *
 * "Todos os períodos" é conveniência, não desculpa para arrastar a coleção
 * inteira para a memória (RNF-03). Passando disso, a tela avisa em vez de
 * fingir que mostrou tudo.
 */
const TETO_SEM_RECORTE = 500;

export default async function TransacoesPage({
    searchParams,
}: {
    searchParams: Promise<{ month?: string; year?: string; type?: string; categoryId?: string; periodo?: string }>;
}) {
    const params = await searchParams;
    const { month, year } = currentMonth();
    const m = params.month ? parseInt(params.month) : month;
    const y = params.year ? parseInt(params.year) : year;

    const tudo = params.periodo === "tudo";

    const [transactions, categories, accounts] = await Promise.all([
        tudo
            ? getTransactions(undefined, undefined, params.type, params.categoryId, TETO_SEM_RECORTE)
            : getTransactions(m, y, params.type, params.categoryId),
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
            tudo={tudo}
            truncado={tudo && transactions.length >= TETO_SEM_RECORTE}
        />
    );
}
