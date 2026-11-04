/**
 * Contrato de resposta para a Suri e códigos estáveis de negócio.
 * Formato sempre: { ok, code, message, data }.
 */
import type { GfsisErroItem } from "./gfsis";

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

export const MSG_GFSIS_INDISPONIVEL =
  "Nosso sistema de agendamento está instável no momento. Vou encaminhar você para um atendente.";

interface MapeamentoErro {
  ok: boolean;
  code: SuriCode;
  message: string;
}

const ERROS_CADASTRO: Record<string, MapeamentoErro> = {
  "001": { ok: false, code: "CPF_OBRIGATORIO", message: "Preciso do seu CPF para continuar." },
  "003": {
    ok: true,
    code: "CLIENTE_JA_CADASTRADO",
    message: "Seu cadastro já existe no nosso sistema. Vamos seguir com o agendamento.",
  },
  "007": { ok: false, code: "CPF_INVALIDO", message: "O CPF informado não é válido. Pode conferir e enviar novamente?" },
  "008": {
    ok: false,
    code: "DATA_NASCIMENTO_OBRIGATORIA",
    message: "Preciso da sua data de nascimento (no formato dd/mm/aaaa).",
  },
  "009": { ok: false, code: "NOME_OBRIGATORIO", message: "Preciso do seu nome completo." },
  "010": { ok: false, code: "EMAIL_OBRIGATORIO", message: "Preciso do seu e-mail para enviar o link da reunião." },
  "011": { ok: false, code: "TELEFONE_INVALIDO", message: "O telefone informado parece inválido. Pode enviar novamente com DDD?" },
  "012": {
    ok: false,
    code: "ENDERECO_INVALIDO",
    message: "Não consegui validar seu endereço. Pode me enviar seu CEP novamente?",
  },
  "013": {
    ok: false,
    code: "ENDERECO_INVALIDO",
    message: "Não encontrei o município do seu endereço. Pode me enviar seu CEP novamente?",
  },
};

/** Converte os códigos de erro do POST /Cliente em códigos estáveis para o flow. */
export function mapErroCadastroCliente(erros: GfsisErroItem[]): MapeamentoErro & { gfsisCodigo?: string } {
  for (const e of erros) {
    const m = e.codigo ? ERROS_CADASTRO[e.codigo] : undefined;
    if (m) return { ...m, gfsisCodigo: e.codigo };
  }
  return {
    ok: false,
    code: "GFSIS_ERRO_CADASTRO",
    message: "Não consegui atualizar seu cadastro agora. Vou encaminhar você para um atendente.",
    gfsisCodigo: erros[0]?.codigo,
  };
}
