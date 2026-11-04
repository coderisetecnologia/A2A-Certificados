import { onlyDigits } from "./cpf";

/** CPF 12345678909 → ***.456.789-** */
export function maskCpf(value: unknown): string {
  const d = onlyDigits(value);
  if (d.length !== 11) return d ? "***" : "";
  return `***.${d.slice(3, 6)}.${d.slice(6, 9)}-**`;
}

/** CNPJ 12345678000190 → **.345.678/****-** */
export function maskCnpj(value: unknown): string {
  const d = onlyDigits(value);
  if (d.length !== 14) return d ? "***" : "";
  return `**.${d.slice(2, 5)}.${d.slice(5, 8)}/****-**`;
}

/** joao.silva@gmail.com → jo***@gmail.com */
export function maskEmail(value: unknown): string {
  const email = String(value ?? "").trim();
  const at = email.lastIndexOf("@");
  if (at < 1) return email ? "***" : "";
  const user = email.slice(0, at);
  const domain = email.slice(at + 1);
  const visible = user.length <= 2 ? user.slice(0, 1) : user.slice(0, 2);
  return `${visible}***@${domain}`;
}

/** 85999998888 → (85) *****-8888 */
export function maskTelefone(value: unknown): string {
  let d = onlyDigits(value);
  if (!d) return "";
  if ((d.length === 12 || d.length === 13) && d.startsWith("55")) d = d.slice(2);
  if (d.length < 8) return "****";
  const last4 = d.slice(-4);
  if (d.length >= 10) {
    const ddd = d.slice(0, 2);
    const middle = "*".repeat(d.length - 6);
    return `(${ddd}) ${middle}-${last4}`;
  }
  return `${"*".repeat(d.length - 4)}-${last4}`;
}

/** Mantém só o ano: 1990-05-25 → "**∕**∕1990" (com barras normais). */
export function maskDataNascimento(value: unknown): string {
  const s = String(value ?? "");
  const year = s.match(/\b(19|20)\d{2}\b/)?.[0];
  return year ? `**/**/${year}` : s ? "**/**/****" : "";
}

/** "João da Silva" → "João S." */
export function maskNome(value: unknown): string {
  const parts = String(value ?? "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "";
  const first = parts[0]!;
  const last = parts.length > 1 ? ` ${parts[parts.length - 1]!.charAt(0).toUpperCase()}.` : "";
  return first + last;
}

const SECRET_KEYS = /^(password|senha|token|accesstoken|acesstoken|authorization|secret|apikey|x-api-key)$/i;

type Masker = (v: unknown) => string;
const FIELD_MASKERS: Array<[RegExp, Masker]> = [
  [/^cpf$/i, maskCpf],
  [/^cnpj$/i, maskCnpj],
  [/^e-?mail(nf)?$/i, maskEmail],
  [/^(telefone|celular|phone|whatsapp)$/i, maskTelefone],
  [/^datanascimento$/i, maskDataNascimento],
  [/^(nome|contato|name)$/i, maskNome],
  [/^(numero|complemento)$/i, (v) => (v ? "***" : "")],
];

/**
 * Mascara recursivamente um payload para gravação em log/banco (LGPD):
 * CPF/CNPJ/e-mail/telefone parciais, nome reduzido, segredos removidos.
 */
export function maskPayload(input: unknown, depth = 0): unknown {
  if (depth > 6) return "[...]";
  if (input === null || input === undefined) return input;
  if (Array.isArray(input)) return input.slice(0, 50).map((v) => maskPayload(v, depth + 1));
  if (typeof input !== "object") {
    // Strings soltas que parecem CPF são mascaradas por precaução.
    if (typeof input === "string" && /^\d{3}\.?\d{3}\.?\d{3}-?\d{2}$/.test(input.trim())) {
      return maskCpf(input);
    }
    return input;
  }
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(input as Record<string, unknown>)) {
    if (SECRET_KEYS.test(key)) {
      out[key] = "[REMOVIDO]";
      continue;
    }
    const masker = FIELD_MASKERS.find(([re]) => re.test(key))?.[1];
    if (masker && (typeof value === "string" || typeof value === "number")) {
      out[key] = masker(value);
    } else {
      out[key] = maskPayload(value, depth + 1);
    }
  }
  return out;
}

/** Remove trechos sensíveis de textos livres (respostas do GFSIS) e limita a 2 KB. */
export function sanitizeSnippet(text: unknown, maxBytes = 2048): string {
  let s = typeof text === "string" ? text : JSON.stringify(text ?? "");
  s = s
    .replace(/("?(?:token|accessToken|acessToken|password|senha)"?\s*[:=]\s*)"[^"]*"/gi, '$1"[REMOVIDO]"')
    .replace(/\b(Bearer|Basic)\s+[A-Za-z0-9._~+/=-]+/g, "$1 [REMOVIDO]")
    .replace(/\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/g, (m) => maskCpf(m))
    .replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, (m) => maskEmail(m));
  const buf = Buffer.from(s, "utf8");
  if (buf.byteLength <= maxBytes) return s;
  return buf.subarray(0, maxBytes - 3).toString("utf8").replace(/�$/, "") + "...";
}
