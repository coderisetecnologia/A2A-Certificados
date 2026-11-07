/**
 * Mensagens devolvidas à Suri, personalizáveis pelo painel (página Mensagens).
 *
 * - Os textos padrão ficam em lib/mensagens-catalogo.ts (os originais).
 * - Personalizações ficam na tabela app_settings, chave "mensagens", como
 *   { "<chave>": "<texto>" } — só as que diferem do padrão.
 * - O wrapper das rotas (suriHandler) chama carregarMensagens() no início de
 *   cada requisição; depois msg() é síncrona e lê o cache em memória (30s).
 *   As personalizações são globais, então o cache compartilhado é seguro.
 * - Banco ausente, lento ou com falha → textos padrão (nunca derruba a rota).
 */
import { getSql } from "./db";
import { logEvent } from "./log";
import {
  interpolar,
  isMensagemChave,
  MENSAGENS,
  validarTexto,
  type MensagemChave,
  type MensagensPersonalizadas,
} from "./mensagens-catalogo";

const SETTINGS_KEY = "mensagens";
const CACHE_TTL_MS = 30_000;
const CACHE_TTL_FALHA_MS = 5_000;
const DB_TIMEOUT_MS = 1_500;

export interface MensagensResolvidas {
  personalizadas: MensagensPersonalizadas;
  /** "banco" = algo salvo no painel; "padrao" = só os textos originais */
  origem: "banco" | "padrao";
  atualizadoEm: string | null;
  atualizadoPor: string | null;
}

/**
 * Mantém só chaves conhecidas com texto válido e diferente do padrão: uma
 * mensagem inválida no banco não invalida as demais (cai no padrão só ela).
 */
export function filtrarPersonalizadas(salvo: unknown): MensagensPersonalizadas {
  const resultado: MensagensPersonalizadas = {};
  if (typeof salvo !== "object" || salvo === null || Array.isArray(salvo)) return resultado;
  for (const [chave, texto] of Object.entries(salvo)) {
    if (!isMensagemChave(chave) || typeof texto !== "string") continue;
    if (texto === MENSAGENS[chave].padrao || validarTexto(chave, texto)) continue;
    resultado[chave] = texto;
  }
  return resultado;
}

/** Valida o que veio do painel. Retorna os erros por chave, ou as mensagens prontas para salvar. */
export function validarPersonalizadas(
  entrada: unknown,
): { ok: true; mensagens: MensagensPersonalizadas } | { ok: false; erros: Record<string, string> } {
  if (typeof entrada !== "object" || entrada === null || Array.isArray(entrada)) {
    return { ok: false, erros: { "(corpo)": "Envie um objeto { chave: texto }." } };
  }
  const erros: Record<string, string> = {};
  const mensagens: MensagensPersonalizadas = {};
  for (const [chave, texto] of Object.entries(entrada)) {
    if (!isMensagemChave(chave)) {
      erros[chave] = "Mensagem desconhecida.";
      continue;
    }
    if (typeof texto !== "string") {
      erros[chave] = "O texto precisa ser uma string.";
      continue;
    }
    const problema = validarTexto(chave, texto);
    if (problema) erros[chave] = problema;
    else if (texto !== MENSAGENS[chave].padrao) mensagens[chave] = texto;
  }
  return Object.keys(erros).length > 0 ? { ok: false, erros } : { ok: true, mensagens };
}

// ─── Cache ────────────────────────────────────────────────────────────────

let cache: { value: MensagensResolvidas; expiresAt: number } | null = null;
let pending: Promise<MensagensResolvidas> | null = null;

/** Apenas para testes. */
export function __resetMensagensCache(): void {
  cache = null;
  pending = null;
}

function padraoResolvido(): MensagensResolvidas {
  return { personalizadas: {}, origem: "padrao", atualizadoEm: null, atualizadoPor: null };
}

async function carregarDoBanco(): Promise<MensagensResolvidas> {
  const sql = getSql();
  if (!sql) return padraoResolvido();
  const rows = (await sql.query(
    `SELECT value, updated_at, updated_by FROM app_settings WHERE key = $1`,
    [SETTINGS_KEY],
  )) as Array<{ value: unknown; updated_at: string | Date; updated_by: string | null }>;
  const row = rows[0];
  if (!row) return padraoResolvido();
  return {
    personalizadas: filtrarPersonalizadas(row.value),
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
      timer = setTimeout(() => reject(new Error(`timeout ao ler mensagens (${ms}ms)`)), ms);
    }),
  ]).finally(() => clearTimeout(timer));
}

/** Atualiza o cache se expirado. Nunca lança: em falha usa o último valor conhecido ou o padrão. */
export async function carregarMensagens(): Promise<MensagensResolvidas> {
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
        logEvent("warn", "mensagens.falha_leitura", { motivo: (err as Error).message, usando: cache ? "cache" : "padrao" });
        cache = { value, expiresAt: Date.now() + CACHE_TTL_FALHA_MS };
        return value;
      })
      .finally(() => {
        pending = null;
      });
  }
  return pending;
}

/**
 * Texto vigente da mensagem (personalizado ou padrão), com as variáveis
 * trocadas. Síncrona: usa o que carregarMensagens() deixou em cache.
 */
export function msg(chave: MensagemChave, vars?: Record<string, string | number>): string {
  const texto = cache?.value.personalizadas[chave] ?? MENSAGENS[chave].padrao;
  return interpolar(texto, vars);
}

/** Salva as personalizações (substitui todas). Lança em falha do banco — a rota de admin trata. */
export async function salvarMensagens(mensagens: MensagensPersonalizadas, email: string): Promise<MensagensResolvidas> {
  const sql = getSql();
  if (!sql) throw new Error("DATABASE_URL não configurada");
  const anterior = await carregarMensagens();
  const rows = (await sql.query(
    `INSERT INTO app_settings (key, value, updated_at, updated_by)
     VALUES ($1, $2::jsonb, now(), $3)
     ON CONFLICT (key) DO UPDATE
       SET value = EXCLUDED.value, updated_at = now(), updated_by = EXCLUDED.updated_by
     RETURNING updated_at`,
    [SETTINGS_KEY, JSON.stringify(mensagens), email],
  )) as Array<{ updated_at: string | Date }>;
  const value: MensagensResolvidas = {
    personalizadas: mensagens,
    origem: "banco",
    atualizadoEm: new Date(rows[0]?.updated_at ?? Date.now()).toISOString(),
    atualizadoPor: email,
  };
  cache = { value, expiresAt: Date.now() + CACHE_TTL_MS };
  const chaves = new Set([...Object.keys(anterior.personalizadas), ...Object.keys(mensagens)]) as Set<MensagemChave>;
  const alteradas = [...chaves].filter((c) => anterior.personalizadas[c] !== mensagens[c]);
  logEvent("info", "mensagens.atualizadas", { por: email, alteradas, totalPersonalizadas: Object.keys(mensagens).length });
  return value;
}
