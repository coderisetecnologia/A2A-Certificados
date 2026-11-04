/**
 * Etapas 7–8 — cria o agendamento no GFSIS.
 *
 * 1. Valida data/horário no fuso do negócio e o CPF. Aceita `horarioEscolhido`
 *    único (label da opção, ex. "06/11 (Sexta) 08:40") e separa data e horário.
 * 2. Idempotência sem banco: se o próximo agendamento do cliente já é o mesmo
 *    (data+horário), devolve JA_AGENDADO em vez de criar outro.
 * 3. Completa dados do cliente com o cadastro do GFSIS e ViaCEP.
 * 4. POST /Agendamento sem retry. Em timeout/5xx, confere pelo GET de próximo
 *    agendamento se foi criado antes de responder.
 */
import { z } from "zod";
import { dadosConfirmacao, mesmoAgendamento } from "@/lib/agendamento";
import {
  booleano,
  camposFaltantes,
  clienteCamposSchema,
  inteiroPositivo,
  completarEndereco,
  fromGfsis,
  mergeCliente,
  normalizarEntrada,
  textoObrigatorio,
  validarFormato,
  type DadosCliente,
} from "@/lib/cliente";
import { resolverPontoAtendimento } from "@/lib/env";
import { getRegrasNegocio } from "@/lib/settings";
import { failure, MSG_GFSIS_INDISPONIVEL, success, type HandlerResult } from "@/lib/errors";
import {
  consultarCliente,
  consultarProximoAgendamento,
  criarAgendamento,
  GfsisError,
  type AgendamentoPayload,
} from "@/lib/gfsis";
import { maskEmail } from "@/lib/mask";
import { cleanText, formatCep, normalizeData, normalizeHorario } from "@/lib/normalize";
import { separarDataHorario } from "@/lib/horarios";
import { suriHandler, type SuriContext } from "@/lib/suri-handler";
import { formatDataCurta, nowInTz, toMinutes } from "@/lib/time";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const textoOpcional = z.preprocess((v) => cleanText(v), z.string().max(300).optional());

const schema = z.object({
  /** Valor único da opção escolhida (ex.: o label "06/11 (Sexta) 08:40"). Tem prioridade sobre data/horario. */
  horarioEscolhido: textoOpcional,
  data: textoOpcional,
  horario: textoOpcional,
  cliente: clienteCamposSchema.extend({ cpf: textoObrigatorio("cliente.cpf") }),
  videoconferencia: booleano,
  observacao: z.preprocess((v) => cleanText(v), z.string().max(500).optional()),
  contato: z.preprocess((v) => cleanText(v), z.string().max(200).optional()),
  identificadorPontoAtendimento: inteiroPositivo,
});

const VERIFICACAO_RESERVA_MS = 2_000;

function payloadAgendamento(
  c: DadosCliente,
  base: { data: string; horario: string; ponto: number; videoconferencia: boolean; observacao?: string; contato?: string },
): AgendamentoPayload {
  const cliente: AgendamentoPayload["cliente"] = { nome: c.nome, cpf: c.cpf, email: c.email };
  const opt = (k: Exclude<keyof AgendamentoPayload["cliente"], "nome" | "cpf" | "email">, v: string) => {
    if (v) cliente[k] = v;
  };
  opt("telefone", c.telefone);
  opt("logradouro", c.logradouro);
  opt("numero", c.numero || "S/N");
  opt("complemento", c.complemento);
  opt("bairro", c.bairro);
  opt("municipio", c.municipio);
  opt("uf", c.uf);
  opt("cep", c.cep ? formatCep(c.cep) : "");
  opt("codigoIbge", c.codigoIbge);
  return {
    data: base.data,
    horario: base.horario,
    identificadorPontoAtendimento: base.ponto,
    observacao: base.observacao ?? "Agendamento via WhatsApp (Suri)",
    videoconferencia: base.videoconferencia,
    contato: base.contato ?? c.nome,
    cliente,
  };
}

/** Após timeout/5xx do POST, verifica se o agendamento foi criado mesmo assim. */
async function verificarAposFalha(
  err: GfsisError,
  ctx: SuriContext,
  cpf: string,
  data: string,
  horario: string,
  confirmar: () => HandlerResult,
): Promise<HandlerResult> {
  const errorLog = {
    step: "criar_agendamento",
    gfsisEndpoint: err.endpoint,
    httpStatus: err.status,
    errorCode: `GFSIS_${err.kind.toUpperCase()}`,
    responseSnippet: err.snippet,
  };
  try {
    const proximo = await consultarProximoAgendamento(cpf, ctx.budget, { timeoutMs: 3_000, retry: false });
    if (mesmoAgendamento(proximo, data, horario)) {
      ctx.log("agendamento.recuperado_apos_falha", { kind: err.kind });
      const ok = confirmar();
      return { ...ok, data: { ...ok.data, idAgendamento: proximo?.id ?? "" }, errorLog: { ...errorLog, message: `${err.message} — agendamento confirmado pela verificação` } };
    }
    return failure(
      "GFSIS_INDISPONIVEL",
      "Não consegui confirmar seu agendamento agora. Um atendente vai verificar e retornar para você.",
      {},
      { ...errorLog, message: `${err.message} — verificação: agendamento NÃO encontrado` },
    );
  } catch (e) {
    return failure("GFSIS_INDISPONIVEL", MSG_GFSIS_INDISPONIVEL, {}, {
      ...errorLog,
      message: `${err.message} — verificação também falhou: ${(e as Error).message}`,
    });
  }
}

export const POST = suriHandler("/api/suri/agendar", schema, async (input, ctx) => {
  const { tzNegocio } = await getRegrasNegocio();
  const agora = nowInTz(tzNegocio);

  const separado = input.horarioEscolhido ? separarDataHorario(input.horarioEscolhido, agora.date) : null;
  const data = separado ? separado.data : normalizeData(input.data);
  if (!data) return failure("DATA_INVALIDA", "Não entendi a data escolhida. Vou buscar os horários novamente.");
  const horario = separado ? separado.horario : normalizeHorario(input.horario);
  if (!horario) return failure("HORARIO_INVALIDO", "Não entendi o horário escolhido. Vou buscar os horários novamente.");

  if (data < agora.date || (data === agora.date && toMinutes(horario) <= agora.minutes)) {
    return failure("HORARIO_INDISPONIVEL", "Esse horário já passou. Vou buscar novas opções para você.", {
      reconsultar: true,
    });
  }

  const novo = normalizarEntrada(input.cliente.cpf, input.cliente);
  const invalido = validarFormato(novo, agora.date);
  if (invalido) return invalido;
  const cpf = novo.cpf!;
  const videoconferencia = input.videoconferencia ?? true;
  const ponto = resolverPontoAtendimento(input.identificadorPontoAtendimento);

  // 2. Idempotência: já existe agendamento igual?
  try {
    const proximo = await consultarProximoAgendamento(cpf, ctx.budget, { timeoutMs: 3_000, retry: false });
    if (mesmoAgendamento(proximo, data, horario)) {
      ctx.log("agendamento.ja_existente");
      return success(
        `Você já tem um agendamento em ${formatDataCurta(data)} às ${horario}.`,
        dadosConfirmacao({ idAgendamento: proximo?.id ?? null, data, horario, videoconferencia, emailMascarado: maskEmail(novo.email) }),
        "JA_AGENDADO",
      );
    }
  } catch (err) {
    if (!(err instanceof GfsisError)) throw err;
    ctx.log("agendamento.checagem_idempotencia_falhou", { kind: err.kind });
  }

  // 3. Completar dados do cliente.
  let cliente = mergeCliente(undefined, novo);
  if (camposFaltantes(cliente, true).some((c) => c !== "dataNascimento") || !cliente.telefone) {
    const existente = await consultarCliente(cpf, ctx.budget);
    if (existente.status === "encontrado") cliente = mergeCliente(fromGfsis(existente.cliente), novo);
  }
  ({ cliente } = await completarEndereco(cliente, ctx.budget));

  const faltantes = camposFaltantes(cliente, false); // data de nascimento não é exigida no agendamento
  if (faltantes.length > 0) {
    const code = faltantes.includes("nome") ? "NOME_OBRIGATORIO" : faltantes.includes("email") ? "EMAIL_OBRIGATORIO" : "ENDERECO_INCOMPLETO";
    const msg =
      code === "NOME_OBRIGATORIO"
        ? "Preciso do seu nome completo para concluir o agendamento."
        : code === "EMAIL_OBRIGATORIO"
          ? "Preciso do seu e-mail para enviar o link da reunião."
          : "Preciso do seu CEP e número do endereço para concluir o agendamento.";
    return failure(code, msg, { camposFaltantes: faltantes.join(",") }, {
      step: "agendar_dados_incompletos",
      errorCode: code,
      message: `Campos faltantes para agendar: ${faltantes.join(",")}`,
    });
  }

  // 4. Criar agendamento (sem retry), reservando tempo para verificação.
  const payload = payloadAgendamento(cliente, { data, horario, ponto, videoconferencia, observacao: input.observacao, contato: input.contato });
  const emailMascarado = maskEmail(cliente.email);
  const confirmar = (id: string | null = null) =>
    success(
      "Agendamento confirmado!",
      dadosConfirmacao({ idAgendamento: id, data, horario, videoconferencia, emailMascarado }),
    );

  let r;
  try {
    const timeout = Math.max(1_000, ctx.budget.remaining() - VERIFICACAO_RESERVA_MS);
    r = await criarAgendamento(payload, ctx.budget, timeout);
  } catch (err) {
    if (err instanceof GfsisError && err.kind !== "auth" && err.kind !== "budget") {
      return verificarAposFalha(err, ctx, cpf, data, horario, () => confirmar());
    }
    throw err;
  }

  switch (r.status) {
    case "criado":
      ctx.log("agendamento.criado", { id: r.agendamento.id });
      return confirmar(r.agendamento.id);
    case "indisponivel":
      return failure(
        "HORARIO_INDISPONIVEL",
        "Esse horário acabou de ser preenchido. Vou buscar outras opções para você.",
        { reconsultar: true },
      );
    case "ponto_nao_encontrado":
      return failure("PONTO_NAO_ENCONTRADO", "Não consegui concluir o agendamento agora. Vou encaminhar você para um atendente.", {}, {
        step: "criar_agendamento",
        gfsisEndpoint: "POST /Agendamento",
        httpStatus: 404,
        errorCode: "PONTO_NAO_ENCONTRADO",
        message: r.mensagem || `Ponto de atendimento ${ponto} não encontrado`,
        responseSnippet: r.text,
      });
    case "invalido": {
      const municipio = /munic/i.test(r.mensagem);
      return failure(
        municipio ? "ENDERECO_INVALIDO" : "GFSIS_ERRO_AGENDAMENTO",
        municipio
          ? "Não consegui validar o município do seu endereço. Pode me enviar seu CEP novamente?"
          : "Não consegui concluir o agendamento agora. Vou encaminhar você para um atendente.",
        {},
        {
          step: "criar_agendamento",
          gfsisEndpoint: "POST /Agendamento",
          httpStatus: r.httpStatus,
          errorCode: municipio ? "ENDERECO_INVALIDO" : `GFSIS_HTTP_${r.httpStatus}`,
          message: r.mensagem || `HTTP ${r.httpStatus}`,
          responseSnippet: r.text,
        },
      );
    }
  }
});
