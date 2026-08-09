import { NextRequest, NextResponse } from "next/server";

const SESSION_COOKIE_NAME = "financo_session";

/**
 * Porteiro barato: sem cookie de sessão, nem chega a carregar a página.
 *
 * NÃO valida o cookie — isso exige o Admin SDK, que não roda aqui. A validação
 * de verdade (assinatura, revogação, papel e status) acontece no servidor, em
 * `requireActiveUser()`. Este middleware só evita a viagem inútil; ele nunca é
 * a única barreira (Art. 5).
 */
export function middleware(request: NextRequest) {
  const temSessao = Boolean(request.cookies.get(SESSION_COOKIE_NAME)?.value);

  if (!temSessao) {
    const login = new URL("/login", request.url);
    login.searchParams.set("de", request.nextUrl.pathname);
    return NextResponse.redirect(login);
  }

  return NextResponse.next();
}

export const config = {
  // Só as áreas autenticadas. Fora daqui: login, tela de espera, api e estáticos.
  matcher: [
    "/dashboard/:path*",
    "/transacoes/:path*",
    "/relatorios/:path*",
    "/contas/:path*",
    "/categorias/:path*",
    "/orcamentos/:path*",
    "/admin/:path*",
  ],
};
