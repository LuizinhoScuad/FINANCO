import { getAccounts } from "@/actions/accounts";
import { ContasClient } from "./ContasClient";

export const dynamic = "force-dynamic";

export default async function ContasPage() {
    const accounts = await getAccounts();
    return <ContasClient accounts={accounts} />;
}
