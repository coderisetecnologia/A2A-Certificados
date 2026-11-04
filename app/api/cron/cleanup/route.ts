/**
 * Limpeza diária de error_logs com mais de 90 dias (Vercel Cron).
 * A Vercel envia "Authorization: Bearer ${CRON_SECRET}".
 */
import { NextResponse, type NextRequest } from "next/server";
import { deleteOlderThan } from "@/lib/db";
import { cronSecret } from "@/lib/env";
import { logEvent } from "@/lib/log";
import { bearerToken, safeEqual } from "@/lib/security";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const RETENCAO_DIAS = 90;

export async function GET(req: NextRequest) {
  if (!safeEqual(bearerToken(req.headers.get("authorization")), cronSecret())) {
    return NextResponse.json({ ok: false, code: "NAO_AUTORIZADO" }, { status: 401 });
  }
  try {
    const deleted = await deleteOlderThan(RETENCAO_DIAS);
    logEvent("info", "cron.cleanup", { deleted, retencaoDias: RETENCAO_DIAS });
    return NextResponse.json({ ok: true, deleted });
  } catch (err) {
    logEvent("error", "cron.cleanup_falhou", { motivo: (err as Error).message });
    return NextResponse.json({ ok: false, code: "ERRO_INTERNO" }, { status: 500 });
  }
}
