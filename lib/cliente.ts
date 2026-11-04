/**
 * Regras de dados do cliente compartilhadas entre /cliente/* e /agendar.
 */
import { z } from "zod";
import type { Budget } from "./budget";
import { isValidCpf, normalizeCpf } from "./cpf";
import { failure, type HandlerResult } from "./errors";
import type { ClienteGfsis, ClientePayload } from "./gfsis";
import { cleanText, formatCep, isValidEmail, normalizeCep, normalizeData, normalizeTelefone } from "./normalize";
import { buscarCep } from "./viacep";

/** Texto opcional tolerante (aceita número, "", null, variável não resolvida da Suri). */
export const texto = z.preprocess((v) => cleanText(v), z.string().max(300).optional());
export const textoObrigatorio = (campo: string) =>
  z.preprocess((v) => cleanText(v), z.string({ error: `${campo} é obrigatório` }).max(300));

export const clienteCamposSchema = z.object({
  nome: texto,
  email: texto,
  telefone: texto,
  dataNascimento: texto,
  cep: texto,
  logradouro: texto,
  numero: texto,
  complemento: texto,
  bairro: texto,
  municipio: texto,
  uf: texto,
  codigoIbge: texto,
});

export type ClienteCampos = z.infer<typeof clienteCamposSchema>;

export interface DadosCliente {
  nome: string;
  cpf: string;
  email: string;
  telefone: string;
  dataNascimento: string;
  cep: string;
  logradouro: string;
  numero: string;
  complemento: string;
  bairro: string;
  municipio: string;
  uf: string;
  codigoIbge: string;
}

const VAZIO: DadosCliente = {
  nome: "",
  cpf: "",
  email: "",
  telefone: "",
  dataNascimento: "",
  cep: "",
  logradouro: "",
  numero: "",
  complemento: "",
  bairro: "",
  municipio: "",
  uf: "",
  codigoIbge: "",
};

const CAMPOS_ENDERECO = ["logradouro", "numero", "complemento", "bairro", "municipio", "uf", "codigoIbge"] as const;

/** Normaliza o que veio da Suri. Datas inválidas ficam como estão para a validação acusar. */
export function normalizarEntrada(cpf: string, c: ClienteCampos): Partial<DadosCliente> {
  const out: Partial<DadosCliente> = { cpf: normalizeCpf(cpf) };
  if (c.nome) out.nome = c.nome.replace(/\s+/g, " ").trim();
  if (c.email) out.email = c.email.trim().toLowerCase();
  if (c.telefone) out.telefone = normalizeTelefone(c.telefone);
  if (c.dataNascimento) out.dataNascimento = normalizeData(c.dataNascimento) ?? c.dataNascimento;
  if (c.cep) out.cep = normalizeCep(c.cep);
  if (c.logradouro) out.logradouro = c.logradouro;
  if (c.numero) out.numero = c.numero;
  if (c.complemento) out.complemento = c.complemento;
  if (c.bairro) out.bairro = c.bairro;
  if (c.municipio) out.municipio = c.municipio;
  if (c.uf) out.uf = c.uf.trim().toUpperCase();
  if (c.codigoIbge) out.codigoIbge = c.codigoIbge.replace(/\D/g, "");
  return out;
}

export function fromGfsis(c: ClienteGfsis): DadosCliente {
  return {
    nome: c.nome,
    cpf: c.cpf,
    email: c.email,
    telefone: c.telefone,
    dataNascimento: c.dataNascimento,
    cep: c.cep,
    logradouro: c.logradouro,
    numero: c.numero,
    complemento: c.complemento,
    bairro: c.bairro,
    municipio: c.municipio,
    uf: c.uf,
    codigoIbge: c.codigoIbge,
  };
}

/**
 * Mescla dados existentes (GFSIS) com os novos (Suri). Valores informados
 * vencem. Se o CEP mudou, o endereço antigo é descartado (exceto o que veio novo).
 */
export function mergeCliente(base: Partial<DadosCliente> | undefined, novo: Partial<DadosCliente>): DadosCliente {
  const result: DadosCliente = { ...VAZIO, ...stripEmpty(base ?? {}) };
  const cepMudou = !!novo.cep && !!result.cep && novo.cep !== result.cep;
  if (cepMudou) for (const k of CAMPOS_ENDERECO) result[k] = "";
  Object.assign(result, stripEmpty(novo));
  return result;
}

function stripEmpty(o: Partial<DadosCliente>): Partial<DadosCliente> {
  return Object.fromEntries(Object.entries(o).filter(([, v]) => typeof v === "string" && v.trim() !== ""));
}

/** Campos que o GFSIS exige e ainda não temos (ordem estável). */
export function camposFaltantes(c: Partial<DadosCliente>, pessoaFisica = true): string[] {
  const obrigatorios: Array<keyof DadosCliente> = ["nome", "email"];
  if (pessoaFisica) obrigatorios.push("dataNascimento");
  obrigatorios.push("cep", "logradouro", "bairro", "municipio", "uf");
  return obrigatorios.filter((k) => !c[k] || !String(c[k]).trim());
}

export type ViaCepUso = "nao_necessario" | "ok" | "nao_encontrado" | "falha";

/** Completa endereço via ViaCEP quando há CEP e falta algum campo de endereço. */
export async function completarEndereco(c: DadosCliente, budget: Budget): Promise<{ cliente: DadosCliente; viacep: ViaCepUso }> {
  const precisa = !c.logradouro || !c.bairro || !c.municipio || !c.uf || !c.codigoIbge;
  if (!precisa || c.cep.length !== 8) return { cliente: c, viacep: "nao_necessario" };
  const r = await buscarCep(c.cep, budget);
  if (r.status !== "ok") return { cliente: c, viacep: r.status };
  const e = r.endereco;
  return {
    cliente: {
      ...c,
      logradouro: c.logradouro || e.logradouro,
      bairro: c.bairro || e.bairro,
      municipio: c.municipio || e.municipio,
      uf: c.uf || e.uf,
      // IBGE só é aproveitado se o município for o mesmo do CEP.
      codigoIbge: c.codigoIbge || (!c.municipio || sameCity(c.municipio, e.municipio) ? e.codigoIbge : ""),
    },
    viacep: "ok",
  };
}

function sameCity(a: string, b: string): boolean {
  const n = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").trim().toLowerCase();
  return n(a) === n(b);
}

/** Payload do POST /Cliente omitindo campos vazios (não apagar dados existentes). */
export function montarPayloadCliente(c: DadosCliente): ClientePayload {
  const payload: ClientePayload = { cpf: c.cpf };
  const set = (k: Exclude<keyof ClientePayload, "cpf">, v: string) => {
    if (v) payload[k] = v;
  };
  set("nome", c.nome);
  set("email", c.email);
  set("telefone", c.telefone);
  set("dataNascimento", c.dataNascimento);
  set("cep", c.cep ? formatCep(c.cep) : "");
  set("logradouro", c.logradouro);
  set("numero", c.numero);
  set("complemento", c.complemento);
  set("bairro", c.bairro);
  set("municipio", c.municipio);
  set("uf", c.uf);
  set("codigoIbge", c.codigoIbge);
  return payload;
}

/**
 * Validações de formato feitas ANTES de chamar o GFSIS. São erros de digitação
 * do cliente (resultado de negócio): não são gravados em error_logs.
 */
export function validarFormato(c: Partial<DadosCliente>, hoje: string): HandlerResult | null {
  if (!c.cpf || !isValidCpf(c.cpf)) {
    return failure("CPF_INVALIDO", "O CPF informado não é válido. Pode conferir e enviar novamente?");
  }
  if (c.email && !isValidEmail(c.email)) {
    return failure("EMAIL_INVALIDO", "O e-mail informado parece inválido. Pode enviar novamente?");
  }
  if (c.telefone && (c.telefone.length < 10 || c.telefone.length > 11)) {
    return failure("TELEFONE_INVALIDO", "O telefone informado parece inválido. Pode enviar novamente com DDD?");
  }
  if (c.dataNascimento) {
    const iso = normalizeData(c.dataNascimento);
    const anoMin = Number(hoje.slice(0, 4)) - 120;
    if (!iso || iso >= hoje || Number(iso.slice(0, 4)) < anoMin) {
      return failure("DATA_NASCIMENTO_INVALIDA", "A data de nascimento parece inválida. Envie no formato dd/mm/aaaa.");
    }
  }
  if (c.cep && c.cep.length !== 8) {
    return failure("CEP_INVALIDO", "O CEP precisa ter 8 dígitos. Pode enviar novamente?");
  }
  if (c.uf && !/^[A-Z]{2}$/.test(c.uf)) {
    return failure("ENDERECO_INVALIDO", "A UF do endereço parece inválida. Pode me enviar seu CEP novamente?");
  }
  return null;
}
