/**
 * Regras puras de horários: filtro por período, descarte de horários
 * passados no dia de hoje e montagem das opções numeradas para a Suri.
 */
import { addDays, formatDataCurta, proximosDiasAtendimento, toMinutes, type LocalNow } from "./time";

export type Periodo = "manha" | "tarde" | "noite";

export const PERIODO_LABEL: Record<Periodo, string> = {
  manha: "manhã",
  tarde: "tarde",
  noite: "noite",
};

/** manhã < 12:00 | tarde 12:00–17:59 | noite ≥ 18:00 */
export function periodoDoHorario(horario: string): Periodo {
  const min = toMinutes(horario);
  if (min < 12 * 60) return "manha";
  if (min < 18 * 60) return "tarde";
  return "noite";
}

/** Minuto (exclusivo) em que cada período termina. */
export const FIM_PERIODO: Record<Periodo, number> = { manha: 12 * 60, tarde: 18 * 60, noite: 24 * 60 };

/**
 * Define quais dias consultar no GFSIS. Usa SEMPRE o "agora" no fuso do
 * negócio: às 22h em Fortaleza (01h UTC do dia seguinte) "hoje" continua
 * sendo o dia local. Se o período já acabou hoje, começa amanhã (economiza
 * uma chamada). Datas iniciais no passado são trazidas para hoje.
 */
export function planejarDias(params: {
  agora: LocalNow;
  dataInicial?: string | null;
  dias: number;
  diasAtendimento: Set<number>;
  periodo: Periodo;
  antecedenciaMin: number;
}): string[] {
  const { agora, dataInicial, dias, diasAtendimento, periodo, antecedenciaMin } = params;
  let inicio = dataInicial && dataInicial > agora.date ? dataInicial : agora.date;
  if (inicio === agora.date && FIM_PERIODO[periodo] <= agora.minutes + antecedenciaMin + 1) {
    inicio = addDays(inicio, 1);
  }
  return proximosDiasAtendimento(inicio, dias, diasAtendimento);
}

export function filtrarPorPeriodo(horarios: string[], periodo: Periodo): string[] {
  return horarios.filter((h) => periodoDoHorario(h) === periodo);
}

/**
 * Remove horários que já passaram (ou estão dentro da antecedência mínima)
 * quando a data é hoje no fuso do negócio. Datas futuras não são alteradas;
 * datas passadas retornam vazio.
 */
export function descartarPassados(
  data: string,
  horarios: string[],
  hoje: string,
  agoraMinutos: number,
  antecedenciaMin = 0,
): string[] {
  if (data < hoje) return [];
  if (data > hoje) return horarios;
  const limite = agoraMinutos + antecedenciaMin;
  return horarios.filter((h) => toMinutes(h) > limite);
}

export interface SlotsDia {
  data: string;
  horarios: string[];
}

export interface Opcao {
  numero: number;
  data: string;
  horario: string;
  label: string;
}

/**
 * Seleciona até `max` horários distribuídos entre os dias (rodízio de cotas),
 * e dentro de cada dia espaçados uniformemente — evita oferecer só
 * 08:00, 08:10, 08:20 do primeiro dia. Resultado em ordem cronológica.
 */
export function selecionarOpcoes(dias: SlotsDia[], max: number): Opcao[] {
  const comHorario = dias.filter((d) => d.horarios.length > 0).sort((a, b) => a.data.localeCompare(b.data));
  if (comHorario.length === 0 || max <= 0) return [];

  const cotas = comHorario.map(() => 0);
  let restante = max;
  let progrediu = true;
  while (restante > 0 && progrediu) {
    progrediu = false;
    for (let i = 0; i < comHorario.length && restante > 0; i++) {
      if (cotas[i]! < comHorario[i]!.horarios.length) {
        cotas[i]!++;
        restante--;
        progrediu = true;
      }
    }
  }

  const escolhidos: Array<{ data: string; horario: string }> = [];
  comHorario.forEach((dia, i) => {
    const lista = [...dia.horarios].sort();
    const cota = cotas[i]!;
    const indices = new Set<number>();
    for (let k = 0; k < cota; k++) indices.add(Math.floor((k * lista.length) / cota));
    [...indices].sort((a, b) => a - b).forEach((idx) => escolhidos.push({ data: dia.data, horario: lista[idx]! }));
  });

  return escolhidos.map((e, i) => ({
    numero: i + 1,
    data: e.data,
    horario: e.horario,
    label: `${formatDataCurta(e.data)} ${e.horario}`,
  }));
}

/** Mensagem curta do retorno de /horarios: "Encontrei 6 horários". */
export function mensagemOpcoes(quantidade: number): string {
  return `Encontrei ${quantidade} ${quantidade === 1 ? "horário" : "horários"}`;
}

/**
 * Separa data e horário de um valor único escolhido no flow — normalmente o
 * próprio `label` da opção ("06/11 (Sexta) 08:40"). Também aceita
 * "06/11/2026 08:40", "2026-11-06 08:40", "2026-11-06T08:40" e prefixo
 * numérico ("1) 06/11 (Sexta) 08:40"). Sem ano, usa a próxima ocorrência da
 * data a partir de `hoje` (ex.: "05/01" em dezembro → janeiro do ano seguinte).
 */
export function separarDataHorario(valor: unknown, hoje: string): { data: string | null; horario: string | null } {
  const s = String(valor ?? "").trim();
  let data: string | null = null;
  let resto = s;

  const iso = s.match(/(\d{4})-(\d{1,2})-(\d{1,2})/);
  const br = iso ? null : s.match(/(?<!\d)(\d{1,2})\/(\d{1,2})(?:\/(\d{2}|\d{4}))?(?!\d)/);
  if (iso) {
    data = valida(Number(iso[1]), Number(iso[2]), Number(iso[3]));
    resto = s.replace(iso[0], " ");
  } else if (br) {
    const d = Number(br[1]);
    const m = Number(br[2]);
    if (br[3]) {
      data = valida(br[3].length === 2 ? 2000 + Number(br[3]) : Number(br[3]), m, d);
    } else {
      const ano = Number(hoje.slice(0, 4));
      data = valida(ano, m, d);
      if (data && data < hoje) data = valida(ano + 1, m, d);
    }
    resto = s.replace(br[0], " ");
  }

  const hm = resto.match(/(?<!\d)(\d{1,2})\s*[:h]\s*(\d{2})(?!\d)/i);
  let horario: string | null = null;
  if (hm && Number(hm[1]) <= 23 && Number(hm[2]) <= 59) {
    horario = `${hm[1]!.padStart(2, "0")}:${hm[2]}`;
  }
  return { data, horario };
}

function valida(y: number, m: number, d: number): string | null {
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null;
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

/** Executa tarefas com concorrência limitada, preservando a ordem dos resultados. */
export async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<PromiseSettledResult<R>[]> {
  const results: PromiseSettledResult<R>[] = new Array(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const i = next++;
      try {
        results[i] = { status: "fulfilled", value: await fn(items[i]!, i) };
      } catch (reason) {
        results[i] = { status: "rejected", reason };
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}
