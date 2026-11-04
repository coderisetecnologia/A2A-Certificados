/**
 * Aba "Testes" do painel: executa as rotas /api/suri/* exatamente como a Suri
 * faria (mesma validação, regras e chamadas ao GFSIS), mas autenticado pela
 * sessão do admin. A SURI_API_KEY é aplicada aqui no servidor e nunca vai ao
 * navegador. O correlation_id começa com "painel-teste-" para ficar fácil de
 * identificar na aba de erros.
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdminApi } from "@/lib/admin";
import { suriApiKey } from "@/lib/env";
import { POST as agendar } from "@/app/api/suri/agendar/route";
import { POST as clienteConsultar } from "@/app/api/suri/cliente/consultar/route";
import { POST as clienteSalvar } from "@/app/api/suri/cliente/salvar/route";
import { GET as health } from "@/app/api/suri/health/route";
import { POST as horarios } from "@/app/api/suri/horarios/route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ROTAS = {
  health: { path: "/api/suri/health", method: "GET" },
  "cliente/consultar": { path: "/api/suri/cliente/consultar", method: "POST" },
  "cliente/salvar": { path: "/api/suri/cliente/salvar", method: "POST" },
  horarios: { path: "/api/suri/horarios", method: "POST" },
  agendar: { path: "/api/suri/agendar", method: "POST" },
} as const;

type Rota = keyof typeof ROTAS;

const HANDLERS: Record<Exclude<Rota, "health">, (req: NextRequest) => Promise<NextResponse>> = {
  "cliente/consultar": clienteConsultar,
  "cliente/salvar": clienteSalvar,
  horarios,
  agendar,
};

const schema = z.object({
  rota: z.enum(Object.keys(ROTAS) as [Rota, ...Rota[]]),
  body: z.unknown().optional(),
});

export async function POST(req: NextRequest) {
  const denied = await requireAdminApi();
  if (denied) return denied;

  let entrada: z.infer<typeof schema>;
  try {
    entrada = schema.parse(await req.json());
  } catch {
    return NextResponse.json({ ok: false, message: "Requisição de teste inválida." }, { status: 400 });
  }

  const { path, method } = ROTAS[entrada.rota];
  const startedAt = Date.now();
  let res: NextResponse;

  if (entrada.rota === "health") {
    res = health();
  } else {
    const key = suriApiKey();
    if (!key) {
      return NextResponse.json({
        ok: false,
        message: "SURI_API_KEY não está configurada no servidor. Sem ela, a Suri (e este teste) recebem 401.",
      });
    }
    const interno = new NextRequest(new URL(path, req.nextUrl.origin), {
      method,
      headers: {
        "Content-Type": "application/json",
        "x-api-key": key,
        "x-correlation-id": `painel-teste-${crypto.randomUUID()}`,
      },
      body: JSON.stringify(entrada.body ?? {}),
    });
    res = await HANDLERS[entrada.rota](interno);
  }

  const texto = await res.text();
  let resposta: unknown = texto;
  try {
    resposta = JSON.parse(texto);
  } catch {
    // mantém como texto
  }

  return NextResponse.json(
    { ok: true, rota: path, method, httpStatus: res.status, durationMs: Date.now() - startedAt, resposta },
    { headers: { "cache-control": "no-store" } },
  );
}
