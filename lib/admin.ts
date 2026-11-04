/**
 * Verificação de sessão dentro de cada rota /api/admin/* e do dashboard —
 * não depende apenas do proxy.ts.
 */
import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { isAllowedEmail } from "./auth";

export async function getAdminEmail(): Promise<string | null> {
  const session = await auth();
  const email = session?.user?.email ?? null;
  return isAllowedEmail(email) ? email : null;
}

/** Retorna uma resposta 401 se não autorizado; null se ok. */
export async function requireAdminApi(): Promise<NextResponse | null> {
  const email = await getAdminEmail();
  if (email) return null;
  return NextResponse.json({ ok: false, code: "NAO_AUTORIZADO", message: "Não autorizado" }, { status: 401 });
}
