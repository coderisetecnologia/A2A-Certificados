/**
 * Leitura de variáveis de ambiente de forma preguiçosa (lazy): nada é validado
 * em tempo de build, apenas quando a rota realmente precisa do valor.
 */

export class ConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConfigError";
  }
}

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new ConfigError(`Variável de ambiente ${name} não configurada`);
  return value;
}

function intEnv(name: string, fallback: number, min: number, max: number): number {
  const raw = process.env[name]?.trim();
  if (!raw) return fallback;
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

export interface GfsisConfig {
  baseUrl: string;
  username: string;
  password: string;
}

/** Aceita "a2a" ou a URL completa ("https://a2a.gfsis.com.br/gestaofacil/rest"). */
export function parseGfsisSubdomain(raw: string): string | null {
  const v = raw.trim();
  if (/^[a-z0-9-]+$/i.test(v)) return v.toLowerCase();
  const m = v.match(/^(?:https?:\/\/)?([a-z0-9-]+)\.gfsis\.com\.br(?:[/:?#].*)?$/i);
  return m?.[1]?.toLowerCase() ?? null;
}

export function gfsisConfig(): GfsisConfig {
  const subdomain = parseGfsisSubdomain(required("GFSIS_SUBDOMAIN"));
  if (!subdomain) {
    throw new ConfigError("GFSIS_SUBDOMAIN inválido (use o subdomínio, ex.: 'a2a', ou a URL https://a2a.gfsis.com.br)");
  }
  return {
    baseUrl: `https://${subdomain}.gfsis.com.br/gestaofacil/rest`,
    username: required("GFSIS_USER"),
    password: required("GFSIS_PASSWORD"),
  };
}

/** Ponto de atendimento padrão, ou null se GFSIS_PONTO_ATENDIMENTO_ID estiver vazio. */
export function pontoAtendimentoPadrao(): number | null {
  const raw = process.env.GFSIS_PONTO_ATENDIMENTO_ID?.trim();
  if (!raw) return null;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 1) throw new ConfigError("GFSIS_PONTO_ATENDIMENTO_ID deve ser um número inteiro positivo");
  return n;
}

/**
 * Ponto usado em horários/agendamento: o enviado na requisição ou o padrão.
 * Só essas rotas precisam dele; autenticação e rotas de cliente funcionam sem.
 */
export function resolverPontoAtendimento(informado?: number): number {
  if (informado !== undefined) return informado;
  const padrao = pontoAtendimentoPadrao();
  if (padrao === null) {
    throw new ConfigError(
      "GFSIS_PONTO_ATENDIMENTO_ID não configurado e identificadorPontoAtendimento não enviado na requisição",
    );
  }
  return padrao;
}

/**
 * Unidade usada na consulta de situação do pedido (identificadorUnidade):
 * a enviada na requisição, senão GFSIS_UNIDADE_ID, senão o ponto de atendimento padrão.
 */
export function resolverUnidade(informada?: number): number {
  if (informada !== undefined) return informada;
  const raw = process.env.GFSIS_UNIDADE_ID?.trim();
  if (raw) {
    const n = Number(raw);
    if (!Number.isInteger(n) || n < 1) throw new ConfigError("GFSIS_UNIDADE_ID deve ser um número inteiro positivo");
    return n;
  }
  const ponto = pontoAtendimentoPadrao();
  if (ponto === null) {
    throw new ConfigError(
      "GFSIS_UNIDADE_ID (ou GFSIS_PONTO_ATENDIMENTO_ID) não configurado e identificadorUnidade não enviado na requisição",
    );
  }
  return ponto;
}

/** Retorna null quando não configurada (as rotas falham fechadas com 401). */
export function suriApiKey(): string | null {
  return process.env.SURI_API_KEY?.trim() || null;
}

export function cronSecret(): string | null {
  return process.env.CRON_SECRET?.trim() || null;
}

export function databaseUrl(): string | null {
  return process.env.DATABASE_URL?.trim() || null;
}

export const DEFAULT_ALLOWED_EMAIL = "coderisetecnologia@gmail.com";

export function allowedEmail(): string {
  return (process.env.ALLOWED_EMAIL?.trim() || DEFAULT_ALLOWED_EMAIL).toLowerCase();
}

export function tzNegocio(): string {
  const tz = process.env.TZ_NEGOCIO?.trim() || "America/Fortaleza";
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return tz;
  } catch {
    console.error(JSON.stringify({ level: "error", event: "config.tz_invalido", tz }));
    return "America/Fortaleza";
  }
}

/** Dias da semana de atendimento (0=domingo ... 6=sábado). Padrão seg–sex. */
export function diasAtendimento(): Set<number> {
  return parseDiasAtendimento(process.env.DIAS_ATENDIMENTO);
}

export function parseDiasAtendimento(raw: string | undefined): Set<number> {
  const dias = new Set(
    (raw ?? "")
      .split(",")
      .map((s) => Number.parseInt(s.trim(), 10))
      .filter((n) => Number.isInteger(n) && n >= 0 && n <= 6),
  );
  return dias.size > 0 ? dias : new Set([1, 2, 3, 4, 5]);
}

export function suriTimeoutMs(): number {
  return intEnv("SURI_TIMEOUT_MS", 10_000, 2_000, 60_000);
}

export function antecedenciaMinimaMinutos(): number {
  return intEnv("ANTECEDENCIA_MINIMA_MINUTOS", 30, 0, 24 * 60);
}
