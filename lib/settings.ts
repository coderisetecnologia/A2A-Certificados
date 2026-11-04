/**
 * Regras de negócio configuráveis pelo painel (página Configurações).
 *
 * - Ficam na tabela app_settings (Neon), chave "regras_negocio".
 * - As variáveis de ambiente (TZ_NEGOCIO, DIAS_ATENDIMENTO,
 *   ANTECEDENCIA_MINIMA_MINUTOS) são o valor PADRÃO: usadas quando nada foi
 *   salvo no painel, quando o banco não está configurado ou se ele falhar.
 * - Cache em memória por instância (30s) para não consultar o banco a cada
 *   requisição da Suri; a leitura tem timeout curto e nunca derruba a rota.
 */
import { z } from "zod";
import { getSql } from "./db";
import { antecedenciaMinimaMinutos, diasAtendimento, tzNegocio } from "./env";
import { logEvent } from "./log";

const SETTINGS_KEY = "regras_negocio";
const CACHE_TTL_MS = 30_000;
const CACHE_TTL_FALHA_MS = 5_000;
const DB_TIMEOUT_MS = 1_500;

/** Fusos do Brasil oferecidos no painel. */
export const FUSOS_BRASIL = [
  { value: "America/Noronha", label: "Fernando de Noronha (UTC−2)" },
  { value: "America/Sao_Paulo", label: "Brasília / São Paulo (UTC−3)" },
  { value: "America/Fortaleza", label: "Fortaleza (UTC−3)" },
  { value: "America/Recife", label: "Recife (UTC−3)" },
  { value: "America/Bahia", label: "Salvador (UTC−3)" },
  { value: "America/Maceio", label: "Maceió / Aracaju (UTC−3)" },
  { value: "America/Belem", label: "Belém (UTC−3)" },
  { value: "America/Araguaina", label: "Palmas / Araguaína (UTC−3)" },
  { value: "America/Santarem", label: "Santarém (UTC−3)" },
  { value: "America/Manaus", label: "Manaus (UTC−4)" },
  { value: "America/Cuiaba", label: "Cuiabá (UTC−4)" },
  { value: "America/Campo_Grande", label: "Campo Grande (UTC−4)" },
  { value: "America/Porto_Velho", label: "Porto Velho (UTC−4)" },
  { value: "America/Boa_Vista", label: "Boa Vista (UTC−4)" },
  { value: "America/Rio_Branco", label: "Rio Branco (UTC−5)" },
] as const;

export function isValidTimeZone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

export const regrasSchema = z.object({
  tzNegocio: z.string().trim().refine(isValidTimeZone, "Fuso horário inválido"),
  diasAtendimento: z
    .array(z.number().int().min(0).max(6))
    .min(1, "Selecione ao menos um dia de atendimento")
    .max(7)
    .transform((dias) => [...new Set(dias)].sort((a, b) => a - b)),
  antecedenciaMinimaMinutos: z.number().int().min(0, "Mínimo 0").max(1440, "Máximo 1440 (24h)"),
});

export type RegrasNegocio = z.output<typeof regrasSchema>;

export interface RegrasResolvidas extends RegrasNegocio {
  /** "banco" = salvo no painel; "padrao" = variáveis de ambiente */
  origem: "banco" | "padrao";
  atualizadoEm: string | null;
  atualizadoPor: string | null;
}

export function regrasPadrao(): RegrasNegocio {
  return {
    tzNegocio: tzNegocio(),
    diasAtendimento: [...diasAtendimento()].sort((a, b) => a - b),
    antecedenciaMinimaMinutos: antecedenciaMinimaMinutos(),
  };
}

/**
 * Mescla o valor salvo sobre o padrão, campo a campo: um campo inválido no
 * banco não invalida os demais (cai no padrão só ele).
 */
export function resolverRegras(salvo: unknown, padrao: RegrasNegocio): RegrasNegocio {
  const resultado: RegrasNegocio = { ...padrao, diasAtendimento: [...padrao.diasAtendimento] };
  if (typeof salvo !== "object" || salvo === null) return resultado;
  const s = salvo as Record<string, unknown>;
  const shape = regrasSchema.shape;
  const tz = shape.tzNegocio.safeParse(s.tzNegocio);
  if (tz.success) resultado.tzNegocio = tz.data;
  const dias = shape.diasAtendimento.safeParse(s.diasAtendimento);
  if (dias.success) resultado.diasAtendimento = dias.data;
  const ant = shape.antecedenciaMinimaMinutos.safeParse(s.antecedenciaMinimaMinutos);
  if (ant.success) resultado.antecedenciaMinimaMinutos = ant.data;
  return resultado;
}

// ─── Cache ────────────────────────────────────────────────────────────────

let cache: { value: RegrasResolvidas; expiresAt: number } | null = null;
let pending: Promise<RegrasResolvidas> | null = null;

/** Apenas para testes. */
export function __resetRegrasCache(): void {
  cache = null;
  pending = null;
}

function padraoResolvido(): RegrasResolvidas {
  return { ...regrasPadrao(), origem: "padrao", atualizadoEm: null, atualizadoPor: null };
}

async function carregarDoBanco(): Promise<RegrasResolvidas> {
  const sql = getSql();
  if (!sql) return padraoResolvido();
  const rows = (await sql.query(
    `SELECT value, updated_at, updated_by FROM app_settings WHERE key = $1`,
    [SETTINGS_KEY],
  )) as Array<{ value: unknown; updated_at: string | Date; updated_by: string | null }>;
  const row = rows[0];
  if (!row) return padraoResolvido();
  return {
    ...resolverRegras(row.value, regrasPadrao()),
    origem: "banco",
    atualizadoEm: new Date(row.updated_at).toISOString(),
    atualizadoPor: row.updated_by,
  };
}

function comTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  return Promise.race([
    p,
    new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error(`timeout ao ler configurações (${ms}ms)`)), ms);
    }),
  ]).finally(() => clearTimeout(timer));
}

/** Regras vigentes. Nunca lança: em falha usa o último valor conhecido ou o padrão. */
export async function getRegrasNegocio(): Promise<RegrasResolvidas> {
  if (cache && cache.expiresAt > Date.now()) return cache.value;
  if (!getSql()) return padraoResolvido();
  if (!pending) {
    pending = comTimeout(carregarDoBanco(), DB_TIMEOUT_MS)
      .then((value) => {
        cache = { value, expiresAt: Date.now() + CACHE_TTL_MS };
        return value;
      })
      .catch((err: unknown) => {
        const value = cache?.value ?? padraoResolvido();
        logEvent("warn", "settings.falha_leitura", { motivo: (err as Error).message, usando: cache ? "cache" : "padrao" });
        cache = { value, expiresAt: Date.now() + CACHE_TTL_FALHA_MS };
        return value;
      })
      .finally(() => {
        pending = null;
      });
  }
  return pending;
}

/** Salva as regras (painel). Lança em falha do banco — a rota de admin trata. */
export async function salvarRegrasNegocio(regras: RegrasNegocio, email: string): Promise<RegrasResolvidas> {
  const sql = getSql();
  if (!sql) throw new Error("DATABASE_URL não configurada");
  const anterior = await getRegrasNegocio();
  const rows = (await sql.query(
    `INSERT INTO app_settings (key, value, updated_at, updated_by)
     VALUES ($1, $2::jsonb, now(), $3)
     ON CONFLICT (key) DO UPDATE
       SET value = EXCLUDED.value, updated_at = now(), updated_by = EXCLUDED.updated_by
     RETURNING updated_at`,
    [SETTINGS_KEY, JSON.stringify(regras), email],
  )) as Array<{ updated_at: string | Date }>;
  const value: RegrasResolvidas = {
    ...regras,
    origem: "banco",
    atualizadoEm: new Date(rows[0]?.updated_at ?? Date.now()).toISOString(),
    atualizadoPor: email,
  };
  cache = { value, expiresAt: Date.now() + CACHE_TTL_MS };
  logEvent("info", "settings.atualizadas", {
    por: email,
    antes: { tz: anterior.tzNegocio, dias: anterior.diasAtendimento, antecedencia: anterior.antecedenciaMinimaMinutos },
    depois: { tz: regras.tzNegocio, dias: regras.diasAtendimento, antecedencia: regras.antecedenciaMinimaMinutos },
  });
  return value;
}
