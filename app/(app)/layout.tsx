import { requireActiveUser } from "@/lib/auth";
import { listarUsuarios } from "@/lib/core/repositories/users.repo";
import { contarPorStatus } from "@/lib/core/repositories/expenses.repo";
import { Sidebar } from "@/components/layout/Sidebar";
import { BottomNav } from "@/components/layout/BottomNav";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
    // Autenticado E liberado. Pendente vai para /aguardando; bloqueado, ao login.
    const usuario = await requireActiveUser();
    const isAdmin = usuario.role === "ADMIN";

    // Contadores de pendência. Os do administrador só são lidos para ele.
    const [pendentes, aprovacoes, corrigir] = await Promise.all([
        isAdmin ? listarUsuarios().then((u) => u.filter((x) => x.status === "PENDING").length) : 0,
        isAdmin ? contarPorStatus("ENVIADA") : 0,
        contarPorStatus("REJEITADA", usuario.uid),
    ]);

    return (
        <div style={{ display: "flex", minHeight: "100vh" }}>
            {/* Sidebar: visível apenas em telas >= 768px */}
            <div className="sidebar-wrapper">
                <Sidebar isAdmin={isAdmin} pendentes={pendentes} aprovacoes={aprovacoes} corrigir={corrigir} />
            </div>

            <main className="main-content">
                {children}
            </main>

            {/* Bottom nav: visível apenas em telas < 768px */}
            <div className="bottom-nav-wrapper">
                <BottomNav isAdmin={isAdmin} pendentes={pendentes} aprovacoes={aprovacoes} corrigir={corrigir} />
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
