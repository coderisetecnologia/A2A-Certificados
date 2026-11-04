/** Detalhe de um erro (payload mascarado) e marcação de resolvido. */
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { requireAdminApi } from "@/lib/admin";
import { getErrorLog, setResolved } from "@/lib/db";
import { logEvent } from "@/lib/log";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const idSchema = z.uuid();

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: Ctx) {
  const denied = await requireAdminApi();
  if (denied) return denied;
  const id = idSchema.safeParse((await params).id);
  if (!id.success) return NextResponse.json({ ok: false, code: "DADOS_INVALIDOS" }, { status: 400 });
  try {
    const item = await getErrorLog(id.data);
    if (!item) return NextResponse.json({ ok: false, code: "NAO_ENCONTRADO" }, { status: 404 });
    return NextResponse.json({ ok: true, item }, { headers: { "cache-control": "no-store" } });
  } catch (err) {
    logEvent("error", "admin.detalhe_erro_falhou", { motivo: (err as Error).message });
    return NextResponse.json({ ok: false, code: "ERRO_INTERNO" }, { status: 500 });
  }
}

const patchSchema = z.object({ resolved: z.boolean() });

export async function PATCH(req: NextRequest, { params }: Ctx) {
  const denied = await requireAdminApi();
  if (denied) return denied;
  const id = idSchema.safeParse((await params).id);
  const body = patchSchema.safeParse(await req.json().catch(() => null));
  if (!id.success || !body.success) return NextResponse.json({ ok: false, code: "DADOS_INVALIDOS" }, { status: 400 });
  try {
    const item = await setResolved(id.data, body.data.resolved);
    if (!item) return NextResponse.json({ ok: false, code: "NAO_ENCONTRADO" }, { status: 404 });
    return NextResponse.json({ ok: true, item });
  } catch (err) {
    logEvent("error", "admin.resolver_erro_falhou", { motivo: (err as Error).message });
    return NextResponse.json({ ok: false, code: "ERRO_INTERNO" }, { status: 500 });
  }
}
