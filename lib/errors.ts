/**
 * Contrato de resposta para a Suri e códigos estáveis de negócio.
 * Formato sempre: { ok, code, message, data }.
 */
import type { GfsisErroItem } from "./gfsis";
import { msg } from "./mensagens";
import type { MensagemChave } from "./mensagens-catalogo";

export type SuriCode =
  | "OK"
  | "JA_AGENDADO"
  | "CLIENTE_JA_CADASTRADO"
  | "DADOS_INVALIDOS"
  | "CPF_INVALIDO"
  | "CPF_OBRIGATORIO"
  | "CNPJ_INVALIDO"
  | "CLIENTE_NAO_ENCONTRADO"
  | "SEM_AGENDAMENTO"
  | "SEM_NOTA_FISCAL"
  | "NOTA_FISCAL_NAO_GERADA"
  | "SEM_BOLETOS"
  | "SEM_PEDIDO"
  | "PEDIDO_NAO_ENCONTRADO"
  | "PEDIDO_INVALIDO"
  | "GFSIS_ERRO_CONSULTA"
  | "NOME_OBRIGATORIO"
  | "EMAIL_OBRIGATORIO"
  | "EMAIL_INVALIDO"
  | "TELEFONE_INVALIDO"
  | "DATA_NASCIMENTO_OBRIGATORIA"
  | "DATA_NASCIMENTO_INVALIDA"
  | "CEP_INVALIDO"
  | "ENDERECO_INCOMPLETO"
  | "ENDERECO_INVALIDO"
  | "DATA_INVALIDA"
  | "HORARIO_INVALIDO"
  | "SEM_HORARIOS"
  | "HORARIO_INDISPONIVEL"
  | "PONTO_NAO_ENCONTRADO"
  | "GFSIS_ERRO_CADASTRO"
  | "GFSIS_ERRO_AGENDAMENTO"
  | "GFSIS_INDISPONIVEL"
  | "NAO_AUTORIZADO"
  | "CONFIGURACAO_INVALIDA"
  | "ERRO_INTERNO";

export interface SuriBody {
  ok: boolean;
  code: SuriCode;
  message: string;
  data: Record<string, unknown>;
  correlationId?: string;
}

/** Informação para gravar em error_logs (apenas falhas técnicas e validações do GFSIS). */
export interface LoggableError {
  step: string;
  gfsisEndpoint?: string;
  httpStatus?: number;
  errorCode?: string;
  message?: string;
  responseSnippet?: string;
}

export interface HandlerResult {
  ok: boolean;
  code: SuriCode;
  message: string;
  data?: Record<string, unknown>;
  /** Quando presente, o wrapper grava em error_logs. */
  errorLog?: LoggableError;
}

export function success(message: string, data: Record<string, unknown> = {}, code: SuriCode = "OK"): HandlerResult {
  return { ok: true, code, message, data };
}

export function failure(
  code: SuriCode,
  message: string,
  data: Record<string, unknown> = {},
  errorLog?: LoggableError,
): HandlerResult {
  return { ok: false, code, message, data, errorLog };
}

interface MapeamentoErro {
  ok: boolean;
  code: SuriCode;
  message: string;
}

const ERROS_CADASTRO: Record<string, { ok: boolean; code: SuriCode; chave: MensagemChave }> = {
  "001": { ok: false, code: "CPF_OBRIGATORIO", chave: "salvar.gfsis_001" },
  "003": { ok: true, code: "CLIENTE_JA_CADASTRADO", chave: "salvar.gfsis_003" },
  "007": { ok: false, code: "CPF_INVALIDO", chave: "salvar.gfsis_007" },
  "008": { ok: false, code: "DATA_NASCIMENTO_OBRIGATORIA", chave: "salvar.gfsis_008" },
  "009": { ok: false, code: "NOME_OBRIGATORIO", chave: "salvar.gfsis_009" },
  "010": { ok: false, code: "EMAIL_OBRIGATORIO", chave: "salvar.gfsis_010" },
  "011": { ok: false, code: "TELEFONE_INVALIDO", chave: "salvar.gfsis_011" },
  "012": { ok: false, code: "ENDERECO_INVALIDO", chave: "salvar.gfsis_012" },
  "013": { ok: false, code: "ENDERECO_INVALIDO", chave: "salvar.gfsis_013" },
};

/** Converte os códigos de erro do POST /Cliente em códigos estáveis para o flow. */
export function mapErroCadastroCliente(erros: GfsisErroItem[]): MapeamentoErro & { gfsisCodigo?: string } {
  for (const e of erros) {
    const m = e.codigo ? ERROS_CADASTRO[e.codigo] : undefined;
    if (m) return { ok: m.ok, code: m.code, message: msg(m.chave), gfsisCodigo: e.codigo };
  }
  return {
    ok: false,
    code: "GFSIS_ERRO_CADASTRO",
    message: msg("salvar.erro_gfsis"),
    gfsisCodigo: erros[0]?.codigo,
  };
}
