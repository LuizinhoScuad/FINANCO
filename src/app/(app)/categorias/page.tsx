import { getCategories } from "@/actions/categories";
import { CategoriasClient } from "./CategoriasClient";

export const dynamic = "force-dynamic";

export default async function CategoriasPage() {
    const categories = await getCategories();
    return <CategoriasClient categories={categories} />;
}
