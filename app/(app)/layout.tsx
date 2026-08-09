import { requireActiveUser } from "@/lib/auth";
import { Sidebar } from "@/components/layout/Sidebar";
import { BottomNav } from "@/components/layout/BottomNav";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
    // Autenticado E liberado. Pendente vai para /aguardando; bloqueado, ao login.
    await requireActiveUser();

    return (
        <div style={{ display: "flex", minHeight: "100vh" }}>
            {/* Sidebar: visível apenas em telas >= 768px */}
            <div className="sidebar-wrapper">
                <Sidebar />
            </div>

            <main className="main-content">
                {children}
            </main>

            {/* Bottom nav: visível apenas em telas < 768px */}
            <div className="bottom-nav-wrapper">
                <BottomNav />
            </div>

            <style>{`
                .sidebar-wrapper { display: flex; }
                .bottom-nav-wrapper { display: none; }
                .main-content {
                    flex: 1;
                    padding: 2rem;
                    overflow-y: auto;
                    max-width: 100%;
                    min-width: 0;
                }

                @media (max-width: 767px) {
                    .sidebar-wrapper { display: none; }
                    .bottom-nav-wrapper { display: block; }
                    .main-content {
                        padding: 1rem;
                        padding-bottom: calc(64px + env(safe-area-inset-bottom) + 1rem);
                    }
                }
            `}</style>
        </div>
    );
}
