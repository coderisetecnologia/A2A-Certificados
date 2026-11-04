/**
 * Logs estruturados (JSON em uma linha) — aparecem nos logs da Vercel.
 * Nunca registrar dados pessoais sem máscara.
 */
import { waitUntil } from "@vercel/functions";
import { insertErrorLog, getSql, type ErrorLogInsert } from "./db";
import { maskPayload, sanitizeSnippet } from "./mask";

type Level = "info" | "warn" | "error";

export function logEvent(level: Level, event: string, fields: Record<string, unknown> = {}): void {
  const line = JSON.stringify({ level, event, ts: new Date().toISOString(), ...fields });
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}

/**
 * Grava um erro no Neon sem nunca quebrar a resposta:
 * - payload é mascarado e o snippet limitado a 2 KB;
 * - falhas do banco viram apenas console.error;
 * - a Promise é registrada com waitUntil para sobreviver ao fim da função.
 */
export function recordError(rec: ErrorLogInsert): Promise<void> {
  const safe: ErrorLogInsert = {
    ...rec,
    requestPayload: rec.requestPayload === undefined ? undefined : maskPayload(rec.requestPayload),
    responseSnippet: rec.responseSnippet ? sanitizeSnippet(rec.responseSnippet) : undefined,
    message: rec.message ? sanitizeSnippet(rec.message, 1000) : undefined,
  };
  logEvent("error", "error_log", {
    correlationId: safe.correlationId,
    route: safe.route,
    step: safe.step,
    gfsisEndpoint: safe.gfsisEndpoint,
    httpStatus: safe.httpStatus,
    errorCode: safe.errorCode,
    message: safe.message,
  });

  const promise = (async () => {
    try {
      if (!getSql()) {
        logEvent("warn", "error_log.db_nao_configurado", { correlationId: safe.correlationId });
        return;
      }
      await insertErrorLog(safe);
    } catch (err) {
      logEvent("error", "error_log.falha_gravacao", {
        correlationId: safe.correlationId,
        motivo: (err as Error).message,
      });
    }
  })();

  try {
    waitUntil(promise);
  } catch {
    // Fora do runtime da Vercel waitUntil pode não existir; a Promise segue normalmente.
  }
  return promise;
}
