/**
 * Cliente HTTP do GFSIS (https://gfsis.readme.io).
 *
 * - Token em cache em memória da instância, renovado 5 min antes de expirar,
 *   com deduplicação de autenticações concorrentes (uma única Promise).
 * - Em 401: reautentica uma vez e repete a chamada.
 * - Retry 1x em 5xx/timeout/erro de rede, apenas se ainda houver orçamento
 *   e apenas quando `retry` estiver habilitado (desligado para POST /Agendamento).
 * - Parsers tolerantes: a documentação do GFSIS traz exemplos divergentes
 *   (ex.: `token`/`accessToken`, `horariosDisponiveis`/`listaHorarios`,
 *   `idAgendamento`/`id`, datas yyyy-MM-dd ou dd/MM/yyyy).
 */
import { Budget, BudgetExceededError } from "./budget";
import { gfsisConfig } from "./env";
import { normalizeCep, normalizeData, normalizeHorario, normalizeTelefone } from "./normalize";
import { onlyDigits } from "./cpf";

// ─── Erros ────────────────────────────────────────────────────────────────

export type GfsisErrorKind = "timeout" | "network" | "http" | "auth" | "budget" | "invalid_response";

export class GfsisError extends Error {
  constructor(
    public readonly kind: GfsisErrorKind,
    message: string,
    public readonly endpoint: string,
    public readonly status?: number,
    public readonly snippet?: string,
  ) {
    super(message);
    this.name = "GfsisError";
  }
}

export interface GfsisResponse {
  status: number;
  data: unknown;
  text: string;
  endpoint: string;
}

// ─── Constantes ───────────────────────────────────────────────────────────

const PER_CALL_TIMEOUT_MS = 8_000;
const AUTH_TIMEOUT_MS = 5_000;
const RETRY_MIN_BUDGET_MS = 1_500;
const RETRY_BACKOFF_MS = 300;
const TOKEN_REFRESH_MARGIN_MS = 5 * 60 * 1000;
const DEFAULT_TOKEN_TTL_MS = 3600 * 1000;

// ─── Cache de token ──────────────────────────────────────────────────────

interface CachedToken {
  token: string;
  expiresAt: number;
}

let cachedToken: CachedToken | null = null;
let pendingAuth: Promise<string> | null = null;

/** Apenas para testes. */
export function __resetTokenCache(): void {
  cachedToken = null;
  pendingAuth = null;
}

// ─── Utilitários ──────────────────────────────────────────────────────────

function tryParseJson(text: string): unknown {
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Envelope de erro de negócio do GFSIS: { status: "error", message: "..." }.
 * Vem com HTTP 500 (cliente/ponto não encontrado, CPF inválido) ou 200
 * (nenhum horário). Retorna a mensagem, ou null se não for esse formato.
 */
export function mensagemErroNegocio(data: unknown): string | null {
  if (!isRecord(data) || String(data.status).toLowerCase() !== "error") return null;
  const msg = data.message ?? data.mensagem;
  return typeof msg === "string" ? msg.trim() : null;
}

const semAcento = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const RE_CLIENTE_NAO_ENCONTRADO = /cliente nao (foi )?encontrad/;
const RE_CPF_INVALIDO = /(cpf|cnpj|documento).*invalid/;
const RE_SEM_AGENDAMENTO = /(nao possui|nenhum) (nenhum )?agendamento|agendamento nao (foi )?encontrad/;
const RE_PONTO_NAO_ENCONTRADO = /ponto de atendimento nao (foi )?encontrad/;
const RE_SEM_HORARIOS = /nenhum horario|sem horario/;
const RE_HORARIO_INDISPONIVEL = /(horario|data).*(indisponivel|nao (esta )?disponivel|ocupad)|ja existe agendamento/;

/** Mensagem de erro de negócio sem acentos e em minúsculas ("" se não houver). */
function erroNegocio(data: unknown): string {
  const m = mensagemErroNegocio(data);
  return m === null ? "" : semAcento(m);
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function str(v: unknown): string {
  if (v === null || v === undefined) return "";
  return String(v).trim();
}

async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs: number,
  endpoint: string,
): Promise<{ status: number; text: string }> {
  if (timeoutMs <= 0) throw new GfsisError("budget", "Sem tempo restante para chamar o GFSIS", endpoint);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...init, signal: controller.signal, cache: "no-store" });
    const text = await res.text(); // leitura do corpo também coberta pelo timeout
    return { status: res.status, text };
  } catch (err) {
    if (controller.signal.aborted) {
      throw new GfsisError("timeout", `Timeout após ${timeoutMs}ms`, endpoint);
    }
    throw new GfsisError("network", `Falha de rede: ${(err as Error).message ?? "desconhecida"}`, endpoint);
  } finally {
    clearTimeout(timer);
  }
}

// ─── Autenticação ─────────────────────────────────────────────────────────

function jwtExpMs(token: string): number | null {
  const payload = token.split(".")[1];
  if (!payload) return null;
  try {
    const json = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as { exp?: unknown };
    return typeof json.exp === "number" ? json.exp * 1000 : null;
  } catch {
    return null;
  }
}

/**
 * Aceita os dois formatos documentados:
 *  { token, expiresIn: 3600 }  |  { accessToken, expirationDate: "2023-12-06 08:38" }
 * A expiração vem de `expiresIn`, senão do `exp` do JWT, senão 1h.
 */
export function parseAuthResponse(data: unknown, nowMs: number = Date.now()): CachedToken | null {
  if (!isRecord(data)) return null;
  const token = str(data.token ?? data.accessToken ?? data.acessToken ?? data.access_token);
  if (!token) return null;
  const expiresIn = Number(data.expiresIn ?? data.expires_in);
  let expiresAt: number;
  if (Number.isFinite(expiresIn) && expiresIn > 0) {
    expiresAt = nowMs + expiresIn * 1000;
  } else {
    expiresAt = jwtExpMs(token) ?? nowMs + DEFAULT_TOKEN_TTL_MS;
  }
  // Nunca confiar em validade maior que 1h (documentada) — evita relógio errado.
  expiresAt = Math.min(expiresAt, nowMs + DEFAULT_TOKEN_TTL_MS);
  return { token, expiresAt };
}

async function authenticate(budget: Budget): Promise<CachedToken> {
  const cfg = gfsisConfig();
  const endpoint = "POST /auth";
  const basic = Buffer.from(`${cfg.username}:${cfg.password}`, "utf8").toString("base64");
  // A documentação mostra as duas formas (JSON e Basic); enviamos ambas.
  const { status, text } = await fetchWithTimeout(
    `${cfg.baseUrl}/auth`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        Authorization: `Basic ${basic}`,
      },
      body: JSON.stringify({ username: cfg.username, password: cfg.password }),
    },
    budget.timeoutFor(AUTH_TIMEOUT_MS),
    endpoint,
  );
  if (status === 200 || status === 201) {
    const parsed = parseAuthResponse(tryParseJson(text));
    if (!parsed) throw new GfsisError("invalid_response", "Resposta de autenticação sem token", endpoint, status);
    return parsed;
  }
  if (status === 401 || status === 403 || status === 422) {
    throw new GfsisError("auth", "Credenciais do usuário integração recusadas pelo GFSIS", endpoint, status, text);
  }
  throw new GfsisError("http", `GFSIS respondeu ${status} na autenticação`, endpoint, status, text);
}

export async function getToken(budget: Budget, forceRefresh = false): Promise<string> {
  if (!forceRefresh && cachedToken && cachedToken.expiresAt - TOKEN_REFRESH_MARGIN_MS > Date.now()) {
    return cachedToken.token;
  }
  if (!pendingAuth) {
    pendingAuth = authenticate(budget)
      .then((t) => {
        cachedToken = t;
        return t.token;
      })
      .finally(() => {
        pendingAuth = null;
      });
  }
  return pendingAuth;
}

function invalidateToken(token: string): void {
  if (cachedToken?.token === token) cachedToken = null;
}

// ─── Requisição genérica ──────────────────────────────────────────────────

export interface RequestOptions {
  query?: Record<string, string | number | undefined>;
  body?: unknown;
  budget: Budget;
  /** Retry 1x em 5xx/timeout/rede. Padrão: true. Use false para operações não idempotentes. */
  retry?: boolean;
  /** Timeout máximo desta chamada (limitado pelo orçamento). Padrão: 8s. */
  timeoutMs?: number;
}

/**
 * Faz uma chamada autenticada. Retorna a resposta para qualquer status < 500
 * (exceto 401 após reautenticar). Lança GfsisError para falhas técnicas.
 */
export async function gfsisRequest(method: "GET" | "POST", path: string, opts: RequestOptions): Promise<GfsisResponse> {
  const cfg = gfsisConfig();
  const endpoint = `${method} /${path}`;
  const url = new URL(`${cfg.baseUrl}/${path}`);
  for (const [k, v] of Object.entries(opts.query ?? {})) {
    if (v !== undefined) url.searchParams.set(k, String(v));
  }
  const retry = opts.retry ?? true;
  let attempt = 0;
  let reauthenticated = false;

  for (;;) {
    try {
      opts.budget.ensure();
    } catch (e) {
      if (e instanceof BudgetExceededError) throw new GfsisError("budget", e.message, endpoint);
      throw e;
    }
    const token = await getToken(opts.budget);
    let result: { status: number; text: string };
    try {
      result = await fetchWithTimeout(
        url.toString(),
        {
          method,
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: "application/json",
            ...(opts.body !== undefined ? { "Content-Type": "application/json" } : {}),
          },
          body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
        },
        opts.budget.timeoutFor(opts.timeoutMs ?? PER_CALL_TIMEOUT_MS),
        endpoint,
      );
    } catch (err) {
      if (
        err instanceof GfsisError &&
        (err.kind === "timeout" || err.kind === "network") &&
        retry &&
        attempt === 0 &&
        opts.budget.remaining() > RETRY_MIN_BUDGET_MS
      ) {
        attempt++;
        await sleep(RETRY_BACKOFF_MS);
        continue;
      }
      throw err;
    }

    const { status, text } = result;
    // O GFSIS responde 401 ou 403 ("Token de acesso não informado.") quando não
    // aceita o token: nos dois casos, renova o token e repete uma vez.
    if ((status === 401 || status === 403) && !reauthenticated) {
      reauthenticated = true;
      invalidateToken(token);
      continue;
    }
    if (status === 401) {
      throw new GfsisError("auth", "Token recusado pelo GFSIS mesmo após reautenticar", endpoint, status, text);
    }
    // 403 persistente com token novo não é problema de token (ex.: falta de
    // permissão): segue para o chamador como qualquer outra resposta < 500.
    if (status >= 500) {
      // O GFSIS devolve erros de NEGÓCIO como HTTP 500 com
      // { status: "error", message } ("Cliente não encontrado", "CPF inválido",
      // "Ponto de atendimento não encontrado"...). Isso não é queda: sem retry,
      // a resposta vai para o chamador interpretar pela mensagem.
      const data = tryParseJson(text);
      if (mensagemErroNegocio(data) !== null) return { status, data, text, endpoint };
      if (retry && attempt === 0 && opts.budget.remaining() > RETRY_MIN_BUDGET_MS) {
        attempt++;
        await sleep(RETRY_BACKOFF_MS);
        continue;
      }
      throw new GfsisError("http", `GFSIS respondeu ${status}`, endpoint, status, text);
    }
    return { status, data: tryParseJson(text), text, endpoint };
  }
}

// ─── Parsers ──────────────────────────────────────────────────────────────

export interface GfsisErroItem {
  codigo?: string;
  mensagem: string;
}

/** Aceita { erro, codigo, mensagem } | { erros: [{codigo, mensagem}] } | { mensagem } | { message }. */
export function parseGfsisErrors(data: unknown, text = ""): GfsisErroItem[] {
  const items: GfsisErroItem[] = [];
  const push = (o: Record<string, unknown>) => {
    const codigo = str(o.codigo ?? o.code ?? o.codigoErro);
    const mensagem = str(o.mensagem ?? o.message ?? o.descricao ?? o.erro ?? o.error);
    if (codigo || (mensagem && mensagem !== "true")) {
      items.push({ codigo: codigo ? codigo.padStart(3, "0") : undefined, mensagem: mensagem === "true" ? "" : mensagem });
    }
  };
  if (Array.isArray(data)) {
    data.filter(isRecord).forEach(push);
  } else if (isRecord(data)) {
    const lista = data.erros ?? data.errors;
    if (Array.isArray(lista)) {
      lista.filter(isRecord).forEach(push);
    } else {
      push(data);
    }
  } else if (text.trim()) {
    items.push({ mensagem: text.trim().slice(0, 300) });
  }
  return items;
}

/** Aceita { horariosDisponiveis: [...] } | { listaHorarios: [...] } | [...] | { mensagem } (sem horários). */
export function parseHorarios(data: unknown): { horarios: string[]; mensagem?: string } {
  let lista: unknown;
  let mensagem: string | undefined;
  if (Array.isArray(data)) {
    lista = data;
  } else if (isRecord(data)) {
    lista = data.horariosDisponiveis ?? data.listaHorarios ?? data.horarios;
    mensagem = str(data.mensagem ?? data.message) || undefined;
  } else if (typeof data === "string") {
    mensagem = data;
  }
  const horarios = Array.isArray(lista)
    ? [...new Set(lista.map((h) => normalizeHorario(isRecord(h) ? h.horario : h)).filter((h): h is string => !!h))].sort()
    : [];
  return { horarios, mensagem };
}

export interface AgendamentoInfo {
  id: string | null;
  data: string | null;
  horario: string | null;
}

/** Aceita { idAgendamento, data, horario } | { id, data: "20/11/2023", horario }. */
export function parseAgendamento(data: unknown): AgendamentoInfo | null {
  if (!isRecord(data)) return null;
  const rawId = data.idAgendamento ?? data.id ?? data.identificador;
  const id = rawId === null || rawId === undefined || rawId === "" ? null : String(rawId);
  const parsed: AgendamentoInfo = {
    id,
    data: normalizeData(data.data ?? data.dataAgendamento),
    horario: normalizeHorario(data.horario ?? data.hora),
  };
  if (!parsed.id && !parsed.data) return null;
  return parsed;
}

export interface ClienteGfsis {
  id?: string;
  nome: string;
  cpf: string;
  cnpj: string;
  email: string;
  telefone: string;
  logradouro: string;
  numero: string;
  complemento: string;
  bairro: string;
  uf: string;
  municipio: string;
  cep: string;
  codigoIbge: string;
  /** yyyy-MM-dd ou "" */
  dataNascimento: string;
}

/** Normaliza o retorno do ConsultaCliente (telefone "Celular: 37...", data "15-04-1985" etc.). */
export function parseCliente(data: unknown): ClienteGfsis | null {
  if (!isRecord(data)) return null;
  const cliente: ClienteGfsis = {
    id: str(data.id) || undefined,
    nome: str(data.nome ?? data.razaoSocial),
    cpf: onlyDigits(data.cpf),
    cnpj: onlyDigits(data.cnpj),
    email: str(data.email),
    telefone: normalizeTelefone(data.telefone ?? data.celular),
    logradouro: str(data.logradouro),
    numero: str(data.numero),
    complemento: str(data.complemento),
    bairro: str(data.bairro),
    uf: str(data.uf).toUpperCase(),
    municipio: str(data.municipio),
    cep: normalizeCep(data.cep),
    codigoIbge: onlyDigits(data.codigoIbge),
    dataNascimento: normalizeData(data.dataNascimento) ?? "",
  };
  if (!cliente.nome && !cliente.cpf && !cliente.cnpj) return null;
  return cliente;
}

// ─── Operações de alto nível ──────────────────────────────────────────────

export type ConsultaClienteResult =
  | { status: "encontrado"; cliente: ClienteGfsis }
  | { status: "nao_encontrado" }
  | { status: "cpf_invalido"; mensagem: string };

export async function consultarCliente(cpf: string, budget: Budget): Promise<ConsultaClienteResult> {
  const res = await gfsisRequest("GET", "ConsultaCliente", { query: { cpf }, budget });
  // O GFSIS responde "Cliente não encontrado" / "CPF inválido" como HTTP 500.
  const negocio = erroNegocio(res.data);
  if (res.status === 404 || RE_CLIENTE_NAO_ENCONTRADO.test(negocio)) return { status: "nao_encontrado" };
  if (RE_CPF_INVALIDO.test(negocio)) return { status: "cpf_invalido", mensagem: mensagemErroNegocio(res.data) ?? "CPF inválido" };
  if (res.status === 400) {
    return { status: "cpf_invalido", mensagem: parseGfsisErrors(res.data, res.text)[0]?.mensagem ?? "CPF inválido" };
  }
  if (res.status === 200) {
    const cliente = parseCliente(res.data);
    if (!cliente) return { status: "nao_encontrado" };
    return { status: "encontrado", cliente };
  }
  throw new GfsisError("http", `Status inesperado ${res.status}`, res.endpoint, res.status, res.text);
}

/** Campos vazios devem ser omitidos para não apagar dados existentes no GFSIS. */
export interface ClientePayload {
  cpf: string;
  nome?: string;
  email?: string;
  telefone?: string;
  logradouro?: string;
  numero?: string;
  complemento?: string;
  bairro?: string;
  uf?: string;
  municipio?: string;
  cep?: string;
  codigoIbge?: string;
  dataNascimento?: string;
}

export type SalvarClienteResult =
  | { status: "ok"; id: string | null }
  | { status: "erro"; httpStatus: number; erros: GfsisErroItem[]; text: string };

export async function salvarCliente(payload: ClientePayload, budget: Budget): Promise<SalvarClienteResult> {
  const res = await gfsisRequest("POST", "Cliente", { body: payload, budget });
  if (res.status >= 200 && res.status < 300) {
    const id = isRecord(res.data) ? str(res.data.id) || null : null;
    // Alguns endpoints do GFSIS retornam 200 com { erro: true }.
    if (isRecord(res.data) && (res.data.erro === true || Array.isArray(res.data.erros) || mensagemErroNegocio(res.data) !== null)) {
      return { status: "erro", httpStatus: res.status, erros: parseGfsisErrors(res.data, res.text), text: res.text };
    }
    return { status: "ok", id };
  }
  return { status: "erro", httpStatus: res.status, erros: parseGfsisErrors(res.data, res.text), text: res.text };
}

export type HorariosDiaResult =
  | { status: "ok"; horarios: string[]; mensagem?: string }
  | { status: "ponto_nao_encontrado"; text: string }
  | { status: "invalido"; httpStatus: number; mensagem: string; text: string };

export async function consultarHorariosDia(data: string, ponto: number, budget: Budget): Promise<HorariosDiaResult> {
  const res = await gfsisRequest("GET", "ConsultaHorarioAgenda", {
    query: { data, identificadorPontoAtendimento: ponto },
    budget,
  });
  const negocio = erroNegocio(res.data);
  if (res.status === 404 || RE_PONTO_NAO_ENCONTRADO.test(negocio)) return { status: "ponto_nao_encontrado", text: res.text };
  // "Nenhum horário disponível para essa data" vem como 200 { status: "error", message }.
  if (RE_SEM_HORARIOS.test(negocio)) return { status: "ok", horarios: [], mensagem: mensagemErroNegocio(res.data) ?? undefined };
  if (res.status === 200 && !negocio) return { status: "ok", ...parseHorarios(res.data ?? res.text) };
  return {
    status: "invalido",
    httpStatus: res.status,
    mensagem: parseGfsisErrors(res.data, res.text)[0]?.mensagem ?? `Status ${res.status}`,
    text: res.text,
  };
}

/** GET /ConsultaAgendamentoCliente — próximo agendamento futuro e não cancelado. */
export async function consultarProximoAgendamento(
  cpf: string,
  budget: Budget,
  opts: { timeoutMs?: number; retry?: boolean } = {},
): Promise<AgendamentoInfo | null> {
  const res = await gfsisRequest("GET", "ConsultaAgendamentoCliente", { query: { cpf }, budget, ...opts });
  // "Cliente não possui nenhum agendamento" / "CPF inválido" vêm como HTTP 500.
  const negocio = erroNegocio(res.data);
  if (res.status === 404) return null;
  if (RE_SEM_AGENDAMENTO.test(negocio) || RE_CLIENTE_NAO_ENCONTRADO.test(negocio) || RE_CPF_INVALIDO.test(negocio)) return null;
  if (res.status === 200) return parseAgendamento(res.data);
  if (res.status === 400) return null; // CPF inválido p/ GFSIS: tratado antes pela nossa validação
  throw new GfsisError("http", `Status inesperado ${res.status}`, res.endpoint, res.status, res.text);
}

export interface AgendamentoPayload {
  data: string;
  horario: string;
  identificadorPontoAtendimento: number;
  observacao?: string;
  videoconferencia: boolean;
  contato?: string;
  cliente: {
    nome: string;
    cpf: string;
    email: string;
    telefone?: string;
    logradouro?: string;
    numero?: string;
    complemento?: string;
    bairro?: string;
    municipio?: string;
    uf?: string;
    cep?: string;
    codigoIbge?: string;
  };
}

export type CriarAgendamentoResult =
  | { status: "criado"; agendamento: AgendamentoInfo; mensagem?: string }
  | { status: "indisponivel"; mensagem: string }
  | { status: "ponto_nao_encontrado"; mensagem: string; text: string }
  | { status: "invalido"; httpStatus: number; mensagem: string; erros: GfsisErroItem[]; text: string };

/**
 * POST /Agendamento — SEM retry automático (não idempotente).
 * Timeout/5xx propagam como GfsisError para a rota verificar via
 * consultarProximoAgendamento se o agendamento foi criado.
 */
export async function criarAgendamento(
  payload: AgendamentoPayload,
  budget: Budget,
  timeoutMs?: number,
): Promise<CriarAgendamentoResult> {
  const res = await gfsisRequest("POST", "Agendamento", { body: payload, budget, retry: false, timeoutMs });
  const erros = parseGfsisErrors(res.data, res.text);
  const mensagem = erros[0]?.mensagem ?? "";
  const negocio = erroNegocio(res.data);
  if (RE_PONTO_NAO_ENCONTRADO.test(negocio)) return { status: "ponto_nao_encontrado", mensagem, text: res.text };
  if (RE_HORARIO_INDISPONIVEL.test(negocio)) return { status: "indisponivel", mensagem: mensagem || "Horário não disponível" };
  // Um 200/201 com { status: "error" } NÃO é agendamento criado.
  if ((res.status === 200 || res.status === 201) && !negocio) {
    const ag = parseAgendamento(res.data);
    if (ag) return { status: "criado", agendamento: ag, mensagem: isRecord(res.data) ? str(res.data.mensagem) || undefined : undefined };
    return { status: "criado", agendamento: { id: null, data: payload.data, horario: payload.horario } };
  }
  if (res.status === 409) return { status: "indisponivel", mensagem: mensagem || "Horário não disponível" };
  if (res.status === 404) return { status: "ponto_nao_encontrado", mensagem, text: res.text };
  return { status: "invalido", httpStatus: res.status, mensagem, erros, text: res.text };
}

/**
 * Teste de conexão para o painel: força autenticação e, se houver ponto de
 * atendimento, faz uma consulta de agenda. Sem ponto, testa só a autenticação.
 */
export async function testarConexao(
  budget: Budget,
  data: string,
  ponto: number | null,
): Promise<{ authMs: number; consultaMs: number | null; status: string }> {
  const t0 = Date.now();
  await getToken(budget, true);
  const authMs = Date.now() - t0;
  if (ponto === null) return { authMs, consultaMs: null, status: "sem_ponto" };
  const t1 = Date.now();
  const r = await consultarHorariosDia(data, ponto, budget);
  return { authMs, consultaMs: Date.now() - t1, status: r.status };
}
