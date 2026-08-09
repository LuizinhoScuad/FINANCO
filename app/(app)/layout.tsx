import { requireActiveUser } from "@/lib/auth";
import { listarUsuarios } from "@/lib/core/repositories/users.repo";
import { Sidebar } from "@/components/layout/Sidebar";
import { BottomNav } from "@/components/layout/BottomNav";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
    // Autenticado E liberado. Pendente vai para /aguardando; bloqueado, ao login.
    const usuario = await requireActiveUser();
    const isAdmin = usuario.role === "ADMIN";

    // Contador de cadastros à espera — só faz sentido (e só é lido) para o admin.
    const pendentes = isAdmin
        ? (await listarUsuarios()).filter((u) => u.status === "PENDING").length
        : 0;

    return (
        <div style={{ display: "flex", minHeight: "100vh" }}>
            {/* Sidebar: visível apenas em telas >= 768px */}
            <div className="sidebar-wrapper">
                <Sidebar isAdmin={isAdmin} pendentes={pendentes} />
            </div>

            <main className="main-content">
                {children}
            </main>

            {/* Bottom nav: visível apenas em telas < 768px */}
            <div className="bottom-nav-wrapper">
                <BottomNav isAdmin={isAdmin} pendentes={pendentes} />
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
