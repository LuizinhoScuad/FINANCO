import { requireCurrentUser } from "@/lib/auth";
import { Sidebar } from "@/components/layout/Sidebar";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
    await requireCurrentUser();

    return (
        <div style={{ display: "flex", minHeight: "100vh" }}>
            <Sidebar />
            <main
                style={{
                    flex: 1,
                    padding: "2rem",
                    overflowY: "auto",
                    maxWidth: "100%",
                }}
            >
                {children}
            </main>
        </div>
    );
}
