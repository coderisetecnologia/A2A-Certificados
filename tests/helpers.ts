import { vi } from "vitest";

export const API_KEY = "test-suri-key";

export function setTestEnv(): void {
  process.env.GFSIS_SUBDOMAIN = "teste";
  process.env.GFSIS_USER = "INTEGRACAO";
  process.env.GFSIS_PASSWORD = "senha-secreta";
  process.env.GFSIS_PONTO_ATENDIMENTO_ID = "10";
  process.env.SURI_API_KEY = API_KEY;
  process.env.TZ_NEGOCIO = "America/Fortaleza";
  process.env.DIAS_ATENDIMENTO = "1,2,3,4,5";
  process.env.SURI_TIMEOUT_MS = "10000";
  process.env.ANTECEDENCIA_MINIMA_MINUTOS = "30";
  delete process.env.DATABASE_URL;
}

export interface Call {
  method: string;
  path: string;
  query: URLSearchParams;
  body: unknown;
  headers: Headers;
  signal?: AbortSignal | null;
}

type Route = (call: Call) => Response | Promise<Response>;

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

/** Mock de fetch roteado por "MÉTODO /caminho" (caminho após /gestaofacil/rest). */
export function mockFetch(routes: Record<string, Route>) {
  const calls: Call[] = [];
  const fn = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
    const method = (init?.method ?? "GET").toUpperCase();
    const path = url.hostname.endsWith("gfsis.com.br") ? url.pathname.replace("/gestaofacil/rest", "") : url.href;
    const call: Call = {
      method,
      path,
      query: url.searchParams,
      body: init?.body ? JSON.parse(String(init.body)) : undefined,
      headers: new Headers(init?.headers),
      signal: init?.signal,
    };
    calls.push(call);
    const route = routes[`${method} ${path}`] ?? routes[path];
    if (!route) throw new Error(`Rota não mockada: ${method} ${path}`);
    return route(call);
  });
  vi.stubGlobal("fetch", fn);
  return { calls, fn, count: (key: string) => calls.filter((c) => `${c.method} ${c.path}` === key).length };
}

export const authOk: Route = () => json({ token: "tok-1", expiresIn: 3600 });

export async function callRoute(
  handler: (req: any) => Promise<Response>,
  body: unknown,
  apiKey: string | null = API_KEY,
): Promise<{ status: number; body: any }> {
  const { NextRequest } = await import("next/server");
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (apiKey) headers["x-api-key"] = apiKey;
  const req = new NextRequest("http://localhost/api/suri/test", {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
  const res = await handler(req);
  return { status: res.status, body: await res.json() };
}

/** Linhas de console.error com event=error_log (gravação em error_logs). */
export function captureErrorLogs() {
  const lines: any[] = [];
  vi.spyOn(console, "error").mockImplementation((line: unknown) => {
    try {
      const parsed = JSON.parse(String(line));
      if (parsed.event === "error_log") lines.push(parsed);
    } catch {
      // ignora
    }
  });
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "log").mockImplementation(() => {});
  return lines;
}
