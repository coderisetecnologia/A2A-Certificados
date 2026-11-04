/**
 * Etapas 5–6 — consulta horários disponíveis nos próximos dias de atendimento,
 * filtra pelo período e devolve só o necessário: message ("Encontrei N horários")
 * e data.opcoes, limitada a maxOpcoes.
 */
import { z } from "zod";
import { resolverPontoAtendimento } from "@/lib/env";
import { getRegrasNegocio } from "@/lib/settings";
import { failure, success, type LoggableError } from "@/lib/errors";
import { consultarHorariosDia, GfsisError, type HorariosDiaResult } from "@/lib/gfsis";
import {
  descartarPassados,
  filtrarPorPeriodo,
  mapWithConcurrency,
  PERIODO_LABEL,
  planejarDias,
  selecionarOpcoes,
  mensagemOpcoes,
  type Periodo,
  type SlotsDia,
} from "@/lib/horarios";
import { cleanText, normalizeData, slug } from "@/lib/normalize";
import { suriHandler } from "@/lib/suri-handler";
import { nowInTz } from "@/lib/time";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const numeroOpcional = (min: number, max: number) =>
  z.preprocess((v) => {
    const s = cleanText(v);
    return s === undefined ? undefined : Number(s);
  }, z.number().int().min(min).max(max).optional());

const schema = z.object({
  periodo: z.preprocess(
    (v) => slug(v),
    z.enum(["manha", "tarde", "noite"], { error: "periodo deve ser manha, tarde ou noite" }),
  ),
  dataInicial: z.preprocess((v) => cleanText(v), z.string().optional()),
  dias: numeroOpcional(1, 10),
  maxOpcoes: numeroOpcional(1, 9),
  identificadorPontoAtendimento: numeroOpcional(1, Number.MAX_SAFE_INTEGER),
});

const CONCORRENCIA = 5;

export const POST = suriHandler("/api/suri/horarios", schema, async (input, ctx) => {
  const periodo = input.periodo as Periodo;
  const dias = input.dias ?? 5;
  const maxOpcoes = input.maxOpcoes ?? 6;
  const ponto = resolverPontoAtendimento(input.identificadorPontoAtendimento);
  const regras = await getRegrasNegocio();
  const antecedencia = regras.antecedenciaMinimaMinutos;
  const agora = nowInTz(regras.tzNegocio);

  let dataInicial: string | null = null;
  if (input.dataInicial) {
    dataInicial = normalizeData(input.dataInicial);
    if (!dataInicial) return failure("DATA_INVALIDA", "Não entendi a data informada. Use o formato dd/mm/aaaa.");
  }

  const datas = planejarDias({ agora, dataInicial, dias, diasAtendimento: new Set(regras.diasAtendimento), periodo, antecedenciaMin: antecedencia });

  const resultados = await mapWithConcurrency(datas, CONCORRENCIA, (d) => consultarHorariosDia(d, ponto, ctx.budget));

  const slots: SlotsDia[] = [];
  const falhas: GfsisError[] = [];
  let erroValidacao: LoggableError | undefined;

  for (let i = 0; i < datas.length; i++) {
    const data = datas[i]!;
    const r = resultados[i]!;
    if (r.status === "rejected") {
      if (r.reason instanceof GfsisError) falhas.push(r.reason);
      else throw r.reason;
      continue;
    }
    const v: HorariosDiaResult = r.value;
    if (v.status === "ponto_nao_encontrado") {
      return failure(
        "PONTO_NAO_ENCONTRADO",
        "Não consegui consultar a agenda agora. Vou encaminhar você para um atendente.",
        {},
        {
          step: "consultar_horarios",
          gfsisEndpoint: "GET /ConsultaHorarioAgenda",
          httpStatus: 404,
          errorCode: "PONTO_NAO_ENCONTRADO",
          message: `Ponto de atendimento ${ponto} não encontrado no GFSIS`,
          responseSnippet: v.text,
        },
      );
    }
    if (v.status === "invalido") {
      erroValidacao ??= {
        step: "consultar_horarios",
        gfsisEndpoint: "GET /ConsultaHorarioAgenda",
        httpStatus: v.httpStatus,
        errorCode: `GFSIS_HTTP_${v.httpStatus}`,
        message: `Data ${data}: ${v.mensagem}`,
        responseSnippet: v.text,
      };
      continue;
    }
    const filtrados = descartarPassados(data, filtrarPorPeriodo(v.horarios, periodo), agora.date, agora.minutes, antecedencia);
    slots.push({ data, horarios: filtrados });
  }

  // Todas as consultas falharam tecnicamente → GFSIS indisponível.
  if (falhas.length > 0 && slots.length === 0) throw falhas[0];

  const opcoes = selecionarOpcoes(slots, maxOpcoes);
  const falhaParcial: LoggableError | undefined = falhas[0]
    ? {
        step: "consultar_horarios_parcial",
        gfsisEndpoint: falhas[0].endpoint,
        httpStatus: falhas[0].status,
        errorCode: `GFSIS_${falhas[0].kind.toUpperCase()}`,
        message: `${falhas.length}/${datas.length} dias falharam: ${falhas[0].message}`,
        responseSnippet: falhas[0].snippet,
      }
    : erroValidacao;

  ctx.log("horarios.consultados", { periodo, dias: datas.length, opcoes: opcoes.length, falhas: falhas.length });

  if (opcoes.length === 0) {
    if (falhas.length > 0) throw falhas[0]; // sem resultado e com falhas: não afirmar "sem horários"
    const outros = (["manha", "tarde", "noite"] as const).filter((p) => p !== periodo).map((p) => PERIODO_LABEL[p]);
    const r = failure(
      "SEM_HORARIOS",
      `Não encontrei horários disponíveis no período da ${PERIODO_LABEL[periodo]} nos próximos dias. Quer tentar outro período (${outros.join(" ou ")})?`,
      { opcoes: [] },
    );
    return erroValidacao ? { ...r, errorLog: erroValidacao } : r;
  }

  // Retorno enxuto: message curta + data.opcoes (no máximo maxOpcoes itens).
  const result = success(mensagemOpcoes(opcoes.length), { opcoes });
  return falhaParcial ? { ...result, errorLog: falhaParcial } : result;
});
