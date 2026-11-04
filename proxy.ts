/**
 * Proxy (antigo middleware.ts no Next.js 16): primeira camada de proteção do
 * painel. Cada rota /api/admin/* e o dashboard verificam a sessão de novo.
 * /api/suri/*, /api/cron/* e /api/auth/* ficam de fora (proteção própria).
 */
import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { isAllowedEmail } from "@/lib/auth";

export default auth((req) => {
  if (isAllowedEmail(req.auth?.user?.email)) return NextResponse.next();
  if (req.nextUrl.pathname.startsWith("/api/admin")) {
    return NextResponse.json({ ok: false, code: "NAO_AUTORIZADO", message: "Não autorizado" }, { status: 401 });
  }
  const url = new URL("/login", req.nextUrl.origin);
  url.searchParams.set("callbackUrl", req.nextUrl.pathname);
  return NextResponse.redirect(url);
});

export const config = {
  matcher: ["/dashboard/:path*", "/api/admin/:path*"],
};
