import { requireActiveUser } from "@/lib/auth";
import { listarUsuarios } from "@/lib/core/repositories/users.repo";
import { contarPedidos } from "@/lib/core/repositories/transactions.repo";
import { Sidebar } from "@/components/layout/Sidebar";
import { BottomNav } from "@/components/layout/BottomNav";

/** Contador que nunca derruba a página: falhou, vale zero e fica registrado. */
async function semQuebrar(oQue: string, ler: () => Promise<number> | number): Promise<number> {
    try {
        return await ler();
    } catch (erro) {
        console.error(`[layout] contador "${oQue}" falhou:`, erro);
        return 0;
    }
}

export default async function AppLayout({ children }: { children: React.ReactNode }) {
    // Autenticado E liberado. Pendente vai para /aguardando; bloqueado, ao login.
    const usuario = await requireActiveUser();
    const isAdmin = usuario.role === "ADMIN";

    // Contadores de pendência. Os do administrador só são lidos para ele.
    //
    // Este layout embrulha TODAS as telas: uma falha aqui — índice do Firestore
    // ainda não publicado, por exemplo — derrubaria o app inteiro por causa de
    // um número ao lado de um item de menu. O badge é conveniência; some em
    // silêncio (com o motivo no log do servidor) em vez de levar a página junto.
    const [pendentes, aprovacoes, corrigir] = await Promise.all([
        semQuebrar("usuarios pendentes", () =>
            isAdmin ? listarUsuarios().then((u) => u.filter((x) => x.status === "PENDING").length) : 0,
        ),
        semQuebrar("pedidos aguardando", () => (isAdmin ? contarPedidos("ENVIADA") : 0)),
        semQuebrar("pedidos rejeitados", () => contarPedidos("REJEITADA", usuario.uid)),
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
