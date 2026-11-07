/**
 * Wrapper padrão das rotas /api/suri/*:
 *  - valida x-api-key (tempo constante) → 401
 *  - gera/propaga correlation_id e mede duração
 *  - valida o corpo com zod
 *  - aplica o orçamento de tempo (SURI_TIMEOUT_MS)
 *  - converte exceções em respostas estáveis (nunca expõe stack/token)
 *  - grava em error_logs apenas falhas técnicas e validações do GFSIS
 */
import { NextResponse, type NextRequest } from "next/server";
import type { z } from "zod";
import { Budget, BudgetExceededError, RESPONSE_MARGIN_MS } from "./budget";
import { ConfigError, suriApiKey, suriTimeoutMs } from "./env";
import { failure, type HandlerResult, type SuriBody } from "./errors";
import { GfsisError } from "./gfsis";
import { logEvent, recordError } from "./log";
import { carregarMensagens, msg } from "./mensagens";
import { safeEqual } from "./security";

export interface SuriContext {
  correlationId: string;
  route: string;
  budget: Budget;
  /** Corpo original (para gravação mascarada em caso de erro). */
  rawBody: unknown;
  log: (event: string, fields?: Record<string, unknown>) => void;
}

function newCorrelationId(req: NextRequest): string {
  const incoming = req.headers.get("x-correlation-id")?.trim();
  return incoming && /^[\w-]{8,64}$/.test(incoming) ? incoming : crypto.randomUUID();
}

function respond(status: number, body: SuriBody, correlationId: string): NextResponse {
  return NextResponse.json(
    { ...body, correlationId },
    { status, headers: { "x-correlation-id": correlationId, "cache-control": "no-store" } },
  );
}

function resumoZod(error: z.ZodError): { campos: string; mensagem: string } {
  const campos = [...new Set(error.issues.map((i) => i.path.join(".") || "(corpo)"))];
  return {
    campos: campos.join(","),
    mensagem: error.issues
      .slice(0, 5)
      .map((i) => `${i.path.join(".") || "(corpo)"}: ${i.message}`)
      .join("; "),
  };
}

export function exceptionToResult(err: unknown): { status: number; result: HandlerResult } {
  if (err instanceof GfsisError) {
    return {
      status: 200,
      result: failure("GFSIS_INDISPONIVEL", msg("geral.gfsis_indisponivel"), {}, {
        step: "gfsis",
        gfsisEndpoint: err.endpoint,
        httpStatus: err.status,
        errorCode: `GFSIS_${err.kind.toUpperCase()}`,
        message: err.message,
        responseSnippet: err.snippet,
      }),
    };
  }
  if (err instanceof BudgetExceededError) {
    return {
      status: 200,
      result: failure("GFSIS_INDISPONIVEL", msg("geral.gfsis_indisponivel"), {}, {
        step: "orcamento",
        errorCode: "TIMEOUT_ORCAMENTO",
        message: err.message,
      }),
    };
  }
  if (err instanceof ConfigError) {
    return {
      status: 500,
      result: failure("CONFIGURACAO_INVALIDA", msg("geral.configuracao_invalida"), {}, {
        step: "config",
        errorCode: "CONFIGURACAO_INVALIDA",
        message: err.message,
      }),
    };
  }
  const e = err as Error;
  return {
    status: 500,
    result: failure("ERRO_INTERNO", msg("geral.erro_interno"), {}, {
      step: "excecao",
      errorCode: "ERRO_INTERNO",
      message: `${e?.name ?? "Error"}: ${e?.message ?? String(err)}`,
    }),
  };
}

export function suriHandler<S extends z.ZodType>(
  route: string,
  schema: S,
  handler: (input: z.infer<S>, ctx: SuriContext) => Promise<HandlerResult>,
) {
  return async function POST(req: NextRequest): Promise<NextResponse> {
    const startedAt = Date.now();
    const correlationId = newCorrelationId(req);
    await carregarMensagens();

    const expected = suriApiKey();
    if (!expected) logEvent("error", "config.suri_api_key_ausente", { correlationId, route });
    if (!safeEqual(req.headers.get("x-api-key"), expected)) {
      logEvent("warn", "suri.nao_autorizado", { correlationId, route });
      return respond(401, { ok: false, code: "NAO_AUTORIZADO", message: msg("geral.nao_autorizado"), data: {} }, correlationId);
    }

    let rawBody: unknown;
    let bodyOk = true;
    try {
      rawBody = await req.json();
    } catch {
      bodyOk = false;
    }

    const budget = new Budget(suriTimeoutMs() - RESPONSE_MARGIN_MS, startedAt);
    const ctx: SuriContext = {
      correlationId,
      route,
      budget,
      rawBody,
      log: (event, fields = {}) => logEvent("info", event, { correlationId, route, ...fields }),
    };

    let status = 200;
    let result: HandlerResult;
    if (!bodyOk) {
      result = failure("DADOS_INVALIDOS", msg("geral.json_invalido"), {}, {
        step: "validacao",
        errorCode: "JSON_INVALIDO",
        message: "Corpo da requisição não é um JSON válido",
      });
    } else {
      const parsed = schema.safeParse(rawBody ?? {});
      if (!parsed.success) {
        const { campos, mensagem } = resumoZod(parsed.error);
        result = failure("DADOS_INVALIDOS", msg("geral.dados_invalidos"), { campos }, {
          step: "validacao",
          errorCode: "DADOS_INVALIDOS",
          message: mensagem,
        });
      } else {
        try {
          result = await handler(parsed.data, ctx);
        } catch (err) {
          ({ status, result } = exceptionToResult(err));
          if (status === 500) {
            logEvent("error", "suri.excecao", {
              correlationId,
              route,
              stack: (err as Error)?.stack?.split("\n").slice(0, 6).join(" | "),
            });
          }
        }
      }
    }

    if (result.errorLog) {
      recordError({ correlationId, route, requestPayload: rawBody, ...result.errorLog });
    }

    logEvent(result.ok ? "info" : "warn", "suri.request", {
      correlationId,
      route,
      ok: result.ok,
      code: result.code,
      httpStatus: status,
      durationMs: Date.now() - startedAt,
    });

    return respond(
      status,
      { ok: result.ok, code: result.code, message: result.message, data: result.data ?? {} },
      correlationId,
    );
  };
}
