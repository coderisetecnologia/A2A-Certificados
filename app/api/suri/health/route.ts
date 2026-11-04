/** Healthcheck simples — não chama o GFSIS nem o banco. */
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET() {
  return NextResponse.json(
    { ok: true, code: "OK", message: "API Suri x GFSIS no ar", data: { timestamp: new Date().toISOString() } },
    { headers: { "cache-control": "no-store" } },
  );
}
