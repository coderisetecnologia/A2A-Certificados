/**
 * Neon Postgres — usado SOMENTE para registrar erros (tabela error_logs).
 */
import { neon, type NeonQueryFunction } from "@neondatabase/serverless";
import { databaseUrl } from "./env";

let client: NeonQueryFunction<false, false> | null = null;

export function getSql(): NeonQueryFunction<false, false> | null {
  const url = databaseUrl();
  if (!url) return null;
  client ??= neon(url);
  return client;
}

function requireSql(): NeonQueryFunction<false, false> {
  const sql = getSql();
  if (!sql) throw new Error("DATABASE_URL não configurada");
  return sql;
}

export const MIGRATION_SQL = [
  `CREATE TABLE IF NOT EXISTS error_logs (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at timestamptz NOT NULL DEFAULT now(),
    correlation_id text NOT NULL,
    route text NOT NULL,
    step text,
    gfsis_endpoint text,
    http_status int,
    error_code text,
    message text,
    request_payload jsonb,
    response_snippet text,
    resolved boolean NOT NULL DEFAULT false,
    resolved_at timestamptz
  )`,
  `CREATE INDEX IF NOT EXISTS error_logs_created_at_idx ON error_logs (created_at DESC)`,
  `CREATE INDEX IF NOT EXISTS error_logs_resolved_idx ON error_logs (resolved, created_at DESC)`,
  `CREATE INDEX IF NOT EXISTS error_logs_correlation_idx ON error_logs (correlation_id)`,
  // Configurações editáveis pelo painel (regras de negócio).
  `CREATE TABLE IF NOT EXISTS app_settings (
    key text PRIMARY KEY,
    value jsonb NOT NULL,
    updated_at timestamptz NOT NULL DEFAULT now(),
    updated_by text
  )`,
];

export interface ErrorLogInsert {
  correlationId: string;
  route: string;
  step?: string;
  gfsisEndpoint?: string;
  httpStatus?: number;
  errorCode?: string;
  message?: string;
  requestPayload?: unknown;
  responseSnippet?: string;
}

export interface ErrorLogRow {
  id: string;
  created_at: string;
  correlation_id: string;
  route: string;
  step: string | null;
  gfsis_endpoint: string | null;
  http_status: number | null;
  error_code: string | null;
  message: string | null;
  request_payload?: unknown;
  response_snippet?: string | null;
  resolved: boolean;
  resolved_at: string | null;
}

export async function insertErrorLog(rec: ErrorLogInsert): Promise<void> {
  const sql = requireSql();
  await sql.query(
    `INSERT INTO error_logs
      (correlation_id, route, step, gfsis_endpoint, http_status, error_code, message, request_payload, response_snippet)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9)`,
    [
      rec.correlationId,
      rec.route,
      rec.step ?? null,
      rec.gfsisEndpoint ?? null,
      rec.httpStatus ?? null,
      rec.errorCode ?? null,
      rec.message?.slice(0, 1000) ?? null,
      rec.requestPayload === undefined ? null : JSON.stringify(rec.requestPayload),
      rec.responseSnippet ?? null,
    ],
  );
}

export type PeriodoFiltro = "24h" | "7d" | "30d" | "90d" | "all";

export interface ListFilters {
  periodo: PeriodoFiltro;
  route?: string;
  resolved?: boolean;
  page: number;
  pageSize: number;
}

const PERIODO_INTERVAL: Record<Exclude<PeriodoFiltro, "all">, string> = {
  "24h": "24 hours",
  "7d": "7 days",
  "30d": "30 days",
  "90d": "90 days",
};

export async function listErrorLogs(f: ListFilters): Promise<{ items: ErrorLogRow[]; total: number }> {
  const sql = requireSql();
  const where: string[] = [];
  const params: unknown[] = [];
  if (f.periodo !== "all") {
    params.push(PERIODO_INTERVAL[f.periodo]);
    where.push(`created_at >= now() - $${params.length}::interval`);
  }
  if (f.route) {
    params.push(f.route);
    where.push(`route = $${params.length}`);
  }
  if (f.resolved !== undefined) {
    params.push(f.resolved);
    where.push(`resolved = $${params.length}`);
  }
  const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";
  const countRows = (await sql.query(`SELECT count(*)::int AS total FROM error_logs ${whereSql}`, params)) as Array<{
    total: number;
  }>;
  params.push(f.pageSize, (f.page - 1) * f.pageSize);
  const items = (await sql.query(
    `SELECT id, created_at, correlation_id, route, step, gfsis_endpoint, http_status, error_code, message, resolved, resolved_at
       FROM error_logs ${whereSql}
      ORDER BY created_at DESC
      LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params,
  )) as ErrorLogRow[];
  return { items, total: countRows[0]?.total ?? 0 };
}

export async function getErrorLog(id: string): Promise<ErrorLogRow | null> {
  const sql = requireSql();
  const rows = (await sql.query(`SELECT * FROM error_logs WHERE id = $1`, [id])) as ErrorLogRow[];
  return rows[0] ?? null;
}

export async function setResolved(id: string, resolved: boolean): Promise<ErrorLogRow | null> {
  const sql = requireSql();
  const rows = (await sql.query(
    `UPDATE error_logs
        SET resolved = $2, resolved_at = CASE WHEN $2 THEN now() ELSE NULL END
      WHERE id = $1
      RETURNING id, resolved, resolved_at`,
    [id, resolved],
  )) as ErrorLogRow[];
  return rows[0] ?? null;
}

export async function errorCounters(): Promise<{ last24h: number; last7d: number; unresolved: number }> {
  const sql = requireSql();
  const rows = (await sql.query(
    `SELECT
       count(*) FILTER (WHERE created_at >= now() - interval '24 hours')::int AS last24h,
       count(*) FILTER (WHERE created_at >= now() - interval '7 days')::int AS last7d,
       count(*) FILTER (WHERE NOT resolved)::int AS unresolved
     FROM error_logs`,
  )) as Array<{ last24h: number; last7d: number; unresolved: number }>;
  return rows[0] ?? { last24h: 0, last7d: 0, unresolved: 0 };
}

export async function distinctRoutes(): Promise<string[]> {
  const sql = requireSql();
  const rows = (await sql.query(`SELECT DISTINCT route FROM error_logs ORDER BY route`)) as Array<{ route: string }>;
  return rows.map((r) => r.route);
}

export async function deleteOlderThan(days: number): Promise<number> {
  const sql = requireSql();
  const rows = (await sql.query(
    `WITH d AS (DELETE FROM error_logs WHERE created_at < now() - make_interval(days => $1) RETURNING 1)
     SELECT count(*)::int AS deleted FROM d`,
    [days],
  )) as Array<{ deleted: number }>;
  return rows[0]?.deleted ?? 0;
}
