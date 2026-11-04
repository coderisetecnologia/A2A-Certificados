import { onlyDigits } from "./cpf";

/**
 * Telefone: remove DDI +55 e caracteres não numéricos (a Suri costuma enviar
 * "+55 (85) 99999-8888" ou "5585999998888"). Resultado: DDD + número.
 */
export function normalizeTelefone(value: unknown): string {
  let d = onlyDigits(value);
  if ((d.length === 12 || d.length === 13) && d.startsWith("55")) d = d.slice(2);
  // Prefixo de longa distância "0" (ex.: 085999998888)
  if ((d.length === 11 || d.length === 12) && d.startsWith("0")) d = d.slice(1);
  return d;
}

function isRealDate(y: number, m: number, d: number): boolean {
  if (y < 1900 || y > 2100 || m < 1 || m > 12 || d < 1) return false;
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

/**
 * Converte datas para yyyy-MM-dd. Aceita:
 *  - yyyy-MM-dd (com ou sem horário em seguida, ex.: ISO)
 *  - dd/MM/yyyy e dd-MM-yyyy (com ou sem horário em seguida)
 * Retorna null se inválida.
 */
export function normalizeData(value: unknown): string | null {
  const s = String(value ?? "").trim();
  let y: number, m: number, d: number;
  let match = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T\s].*)?$/);
  if (match) {
    [y, m, d] = [Number(match[1]), Number(match[2]), Number(match[3])];
  } else {
    match = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})(?:[T\s].*)?$/);
    if (!match) return null;
    [d, m, y] = [Number(match[1]), Number(match[2]), Number(match[3])];
  }
  if (!isRealDate(y, m, d)) return null;
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

/** "9:00", "09:00:00", "09h00", "9h" → "09:00". Retorna null se inválido. */
export function normalizeHorario(value: unknown): string | null {
  const s = String(value ?? "").trim().toLowerCase();
  const match = s.match(/^(\d{1,2})\s*(?::|h)\s*(\d{2})?(?::\d{2}(?:\.\d+)?)?\s*h?$/) ?? s.match(/^(\d{1,2})$/);
  if (!match) return null;
  const h = Number(match[1]);
  const m = Number(match[2] ?? "0");
  if (h > 23 || m > 59) return null;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

export function normalizeCep(value: unknown): string {
  return onlyDigits(value);
}

export function formatCep(value: unknown): string {
  const d = normalizeCep(value);
  return d.length === 8 ? `${d.slice(0, 5)}-${d.slice(5)}` : d;
}

/** Remove acentos e baixa caixa: "Manhã" → "manha" */
export function slug(value: unknown): string {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim()
    .toLowerCase();
}

/** Trata "", "null", "undefined" e variáveis não resolvidas da Suri ("@Foo.Bar") como vazio. */
export function cleanText(value: unknown): string | undefined {
  if (value === null || value === undefined) return undefined;
  const s = String(value).trim();
  if (!s || s === "null" || s === "undefined" || /^@[\w.]+$/.test(s) || /^\{\{.*\}\}$/.test(s)) {
    return undefined;
  }
  return s;
}

export function primeiroNome(nome: unknown): string {
  const first = String(nome ?? "").trim().split(/\s+/)[0] ?? "";
  if (!first) return "";
  return first.charAt(0).toUpperCase() + first.slice(1).toLowerCase();
}

export function isValidEmail(value: unknown): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(value ?? "").trim());
}
