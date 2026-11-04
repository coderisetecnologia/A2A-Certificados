/** Lista paginada de erros + contadores para o painel. */
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { requireAdminApi } from "@/lib/admin";
import { distinctRoutes, errorCounters, listErrorLogs } from "@/lib/db";
import { logEvent } from "@/lib/log";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const querySchema = z.object({
  page: z.coerce.number().int().min(1).max(10_000).default(1),
  pageSize: z.coerce.number().int().min(5).max(100).default(20),
  periodo: z.enum(["24h", "7d", "30d", "90d", "all"]).default("7d"),
  route: z.string().max(200).optional(),
  resolved: z.enum(["true", "false", "all"]).default("all"),
});

export async function GET(req: NextRequest) {
  const denied = await requireAdminApi();
  if (denied) return denied;

  const parsed = querySchema.safeParse(Object.fromEntries(req.nextUrl.searchParams));
  if (!parsed.success) {
    return NextResponse.json({ ok: false, code: "DADOS_INVALIDOS", message: "Filtros inválidos" }, { status: 400 });
  }
  const q = parsed.data;
  try {
    const [list, counters, routes] = await Promise.all([
      listErrorLogs({
        page: q.page,
        pageSize: q.pageSize,
        periodo: q.periodo,
        route: q.route || undefined,
        resolved: q.resolved === "all" ? undefined : q.resolved === "true",
      }),
      errorCounters(),
      distinctRoutes(),
    ]);
    return NextResponse.json(
      { ok: true, ...list, page: q.page, pageSize: q.pageSize, counters, routes },
      { headers: { "cache-control": "no-store" } },
    );
  } catch (err) {
    logEvent("error", "admin.listar_erros_falhou", { motivo: (err as Error).message });
    return NextResponse.json({ ok: false, code: "ERRO_INTERNO", message: "Falha ao consultar o banco" }, { status: 500 });
  }
}
