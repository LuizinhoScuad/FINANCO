import { getBudgets } from "@/actions/budgets";
import { getCategories } from "@/actions/categories";
import { OrcamentosClient } from "./OrcamentosClient";
import { currentMonth } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function OrcamentosPage({
    searchParams,
}: {
    searchParams: Promise<{ month?: string; year?: string }>;
}) {
    const params = await searchParams;
    const { month, year } = currentMonth();
    const m = params.month ? parseInt(params.month) : month;
    const y = params.year ? parseInt(params.year) : year;

    const [budgets, categories] = await Promise.all([
        getBudgets(m, y),
        getCategories("EXPENSE"),
    ]);

    return <OrcamentosClient budgets={budgets} categories={categories} month={m} year={y} />;
}
