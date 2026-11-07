/** Healthcheck simples — não chama o GFSIS (o banco só para ler a mensagem, com cache e timeout). */
import { NextResponse } from "next/server";
import { carregarMensagens, msg } from "@/lib/mensagens";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  await carregarMensagens();
  return NextResponse.json(
    { ok: true, code: "OK", message: msg("geral.health"), data: { timestamp: new Date().toISOString() } },
    { headers: { "cache-control": "no-store" } },
  );
}
