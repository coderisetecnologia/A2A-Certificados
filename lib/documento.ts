/**
 * Documento do cliente: CPF (pessoa física) ou CNPJ (pessoa jurídica).
 *
 * O CNPJ aceita o formato alfanumérico da Receita Federal (em vigor desde
 * julho/2026): 12 posições com letras ou números + 2 dígitos verificadores.
 */
import { z } from "zod";
import { isValidCpf, onlyDigits } from "./cpf";
import { failure, type HandlerResult } from "./errors";
import { msg } from "./mensagens";
import { cleanText } from "./normalize";

export type TipoDocumento = "cpf" | "cnpj";

export interface Documento {
  tipo: TipoDocumento;
  /** Sem máscara: 11 dígitos (CPF) ou 14 caracteres maiúsculos (CNPJ). */
  numero: string;
}

/** Mantém letras e números, em maiúsculas (CNPJ alfanumérico). */
export function normalizeCnpj(value: unknown): string {
  return String(value ?? "")
    .toUpperCase()
    .replace(/[^0-9A-Z]/g, "");
}

/** Dígito verificador do CNPJ: valor do caractere = código ASCII − 48; pesos 2..9 da direita. */
function dvCnpj(base: string): number {
  let soma = 0;
  for (let i = 0; i < base.length; i++) {
    const peso = 2 + (i % 8);
    soma += (base.charCodeAt(base.length - 1 - i) - 48) * peso;
  }
  const resto = soma % 11;
  return resto < 2 ? 0 : 11 - resto;
}

/** Valida CNPJ numérico ou alfanumérico, com ou sem máscara. */
export function isValidCnpj(value: unknown): boolean {
  const cnpj = normalizeCnpj(value);
  if (!/^[0-9A-Z]{12}\d{2}$/.test(cnpj)) return false;
  if (/^(\d)\1{13}$/.test(cnpj)) return false;
  const dv1 = dvCnpj(cnpj.slice(0, 12));
  const dv2 = dvCnpj(cnpj.slice(0, 12) + dv1);
  return cnpj.endsWith(`${dv1}${dv2}`);
}

export function formatCnpj(value: unknown): string {
  const c = normalizeCnpj(value);
  if (c.length !== 14) return c;
  return `${c.slice(0, 2)}.${c.slice(2, 5)}.${c.slice(5, 8)}/${c.slice(8, 12)}-${c.slice(12)}`;
}

export type IdentificacaoDocumento =
  | { status: "ok"; documento: Documento }
  | { status: "invalido"; tipo: TipoDocumento | null };

/**
 * Descobre se o texto é CPF ou CNPJ pelo tamanho e valida.
 * `dica` indica o campo em que o valor veio (cpf/cnpj) quando o tamanho não decide.
 */
export function identificarDocumento(raw: unknown, dica?: TipoDocumento): IdentificacaoDocumento {
  const n = normalizeCnpj(raw);
  if (/^\d{11}$/.test(n)) {
    return isValidCpf(n) ? { status: "ok", documento: { tipo: "cpf", numero: n } } : { status: "invalido", tipo: "cpf" };
  }
  if (n.length === 14) {
    return isValidCnpj(n) ? { status: "ok", documento: { tipo: "cnpj", numero: n } } : { status: "invalido", tipo: "cnpj" };
  }
  return { status: "invalido", tipo: dica ?? null };
}

// ─── Entrada das rotas ──────────────────────────────────────────────────

const textoOpcional = z.preprocess((v) => cleanText(v), z.string().max(40).optional());

/**
 * Campos aceitos para o documento: `documento` (CPF ou CNPJ), `cpf` ou `cnpj`.
 * Use com `.extend(documentoCampos)` ou dentro de `z.object`.
 */
export const documentoCampos = {
  documento: textoOpcional,
  cpf: textoOpcional,
  cnpj: textoOpcional,
};

export interface EntradaDocumento {
  documento?: string;
  cpf?: string;
  cnpj?: string;
}

export function falhaDocumentoInvalido(tipo: TipoDocumento | null, data: Record<string, unknown> = {}): HandlerResult {
  if (tipo === "cnpj") return failure("CNPJ_INVALIDO", msg("documento.cnpj_invalido"), data);
  return failure("CPF_INVALIDO", msg(tipo === "cpf" ? "documento.cpf_invalido" : "documento.invalido"), data);
}

/**
 * Resolve o documento enviado pela Suri. Erro de digitação (CPF/CNPJ inválido)
 * não é gravado; documento ausente é erro de configuração do flow e é gravado.
 */
export function resolverDocumento(
  input: EntradaDocumento,
  data: Record<string, unknown> = {},
): { ok: true; documento: Documento } | { ok: false; result: HandlerResult } {
  const bruto = input.documento ?? input.cnpj ?? input.cpf;
  if (!bruto) {
    return {
      ok: false,
      result: failure("DADOS_INVALIDOS", msg("documento.ausente"), { ...data, campos: "documento" }, {
        step: "validacao",
        errorCode: "DOCUMENTO_AUSENTE",
        message: "Nenhum dos campos documento, cpf ou cnpj foi enviado (ou a variável da Suri estava vazia)",
      }),
    };
  }
  const dica: TipoDocumento | undefined = input.documento ? undefined : input.cnpj ? "cnpj" : "cpf";
  const r = identificarDocumento(bruto, dica);
  if (r.status === "invalido") return { ok: false, result: falhaDocumentoInvalido(r.tipo, data) };
  return { ok: true, documento: r.documento };
}

/** Parâmetros de query do GFSIS: { cpf } ou { cnpj }. */
export function queryDocumento(doc: Documento | string): { cpf: string } | { cnpj: string } {
  if (typeof doc === "string") return { cpf: onlyDigits(doc) };
  return doc.tipo === "cpf" ? { cpf: doc.numero } : { cnpj: doc.numero };
}
