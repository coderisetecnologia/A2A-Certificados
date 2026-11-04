/**
 * Etapa 4 — cadastra/atualiza o cliente no GFSIS.
 * Mescla com o cadastro existente (para não apagar dados), completa o
 * endereço via ViaCEP e traduz os códigos de erro do GFSIS em códigos estáveis.
 */
import { z } from "zod";
import {
  camposFaltantes,
  clienteCamposSchema,
  completarEndereco,
  fromGfsis,
  mergeCliente,
  montarPayloadCliente,
  normalizarEntrada,
  textoObrigatorio,
  validarFormato,
} from "@/lib/cliente";
import { failure, mapErroCadastroCliente, success } from "@/lib/errors";
import { consultarCliente, salvarCliente } from "@/lib/gfsis";
import { primeiroNome } from "@/lib/normalize";
import { getRegrasNegocio } from "@/lib/settings";
import { nowInTz } from "@/lib/time";
import { suriHandler } from "@/lib/suri-handler";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = clienteCamposSchema.extend({ cpf: textoObrigatorio("cpf") });

export const POST = suriHandler("/api/suri/cliente/salvar", schema, async (input, ctx) => {
  const { cpf, ...campos } = input;
  const novo = normalizarEntrada(cpf, campos);
  const { tzNegocio } = await getRegrasNegocio();
  const invalido = validarFormato(novo, nowInTz(tzNegocio).date);
  if (invalido) return invalido;

  // Mescla com o cadastro atual para não sobrescrever com vazio.
  const existente = await consultarCliente(novo.cpf!, ctx.budget);
  const base = existente.status === "encontrado" ? fromGfsis(existente.cliente) : undefined;
  let cliente = mergeCliente(base, novo);

  const { cliente: completo, viacep } = await completarEndereco(cliente, ctx.budget);
  cliente = completo;
  if (viacep === "nao_encontrado" && novo.cep) {
    return failure("CEP_INVALIDO", "Não encontrei esse CEP. Pode conferir e enviar novamente?");
  }
  if (viacep === "falha") ctx.log("viacep.falha");
  if (novo.cep && viacep !== "falha" && (!cliente.logradouro || !cliente.bairro)) {
    return failure(
      "ENDERECO_INCOMPLETO",
      "Esse CEP é geral da cidade. Pode me informar o nome da rua e o bairro?",
      { camposFaltantes: camposFaltantes(cliente).join(",") },
    );
  }

  const r = await salvarCliente(montarPayloadCliente(cliente), ctx.budget);
  const faltantes = camposFaltantes(cliente);

  if (r.status === "ok") {
    ctx.log("cliente.salvo", { novo: !base, viacep });
    return success("Cadastro atualizado com sucesso.", {
      primeiroNome: primeiroNome(cliente.nome),
      cadastroCompleto: faltantes.length === 0,
      camposFaltantes: faltantes.join(","),
      novoCadastro: !base,
    });
  }

  const m = mapErroCadastroCliente(r.erros);
  return {
    ok: m.ok,
    code: m.code,
    message: m.message,
    data: {
      gfsisCodigo: m.gfsisCodigo ?? "",
      primeiroNome: primeiroNome(cliente.nome),
      cadastroCompleto: m.ok && faltantes.length === 0,
      camposFaltantes: faltantes.join(","),
    },
    // Validações do GFSIS indicam dado mal coletado no flow → registrar.
    errorLog: {
      step: "salvar_cliente",
      gfsisEndpoint: "POST /Cliente",
      httpStatus: r.httpStatus,
      errorCode: m.gfsisCodigo ? `GFSIS_${m.gfsisCodigo}` : m.code,
      message: r.erros.map((e) => `${e.codigo ?? "?"}: ${e.mensagem}`).join(" | ") || `HTTP ${r.httpStatus}`,
      responseSnippet: r.text,
    },
  };
});
