/**
 * Utilitários de data/hora no fuso do negócio.
 *
 * A Vercel roda em UTC: "hoje", dia da semana e "horário já passou" SEMPRE
 * são calculados com Intl no fuso TZ_NEGOCIO. Datas de calendário são
 * manipuladas como strings yyyy-MM-dd (sem fuso), evitando deslocamentos.
 */

export const DIAS_SEMANA = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"] as const;

export interface LocalNow {
  /** yyyy-MM-dd no fuso informado */
  date: string;
  /** HH:mm no fuso informado */
  time: string;
  /** minutos desde 00:00 no fuso informado */
  minutes: number;
  /** 0=domingo ... 6=sábado */
  weekday: number;
}

export function nowInTz(timeZone: string, now: Date = new Date()): LocalNow {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === type)?.value ?? "00";
  const date = `${get("year")}-${get("month")}-${get("day")}`;
  const hour = get("hour") === "24" ? "00" : get("hour");
  const time = `${hour}:${get("minute")}`;
  return { date, time, minutes: toMinutes(time), weekday: weekdayOf(date) };
}

/** Dia da semana de uma data de calendário yyyy-MM-dd (independe de fuso). */
export function weekdayOf(date: string): number {
  return new Date(`${date}T12:00:00Z`).getUTCDay();
}

export function addDays(date: string, days: number): string {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(":").map((n) => Number.parseInt(n, 10));
  return (h ?? 0) * 60 + (m ?? 0);
}

/**
 * Próximos `quantidade` dias de atendimento a partir de `inicio` (inclusive),
 * respeitando os dias da semana configurados.
 */
export function proximosDiasAtendimento(
  inicio: string,
  quantidade: number,
  diasAtendimento: Set<number>,
  limiteBusca = 60,
): string[] {
  const result: string[] = [];
  let current = inicio;
  for (let i = 0; i < limiteBusca && result.length < quantidade; i++) {
    if (diasAtendimento.has(weekdayOf(current))) result.push(current);
    current = addDays(current, 1);
  }
  return result;
}

/** 2026-09-15 → "15/09 (Terça)" */
export function formatDataCurta(date: string): string {
  const [, mm, dd] = date.split("-");
  return `${dd}/${mm} (${DIAS_SEMANA[weekdayOf(date)]})`;
}

/** 2026-09-15 → "15/09/2026" */
export function formatDataBr(date: string): string {
  const [yyyy, mm, dd] = date.split("-");
  return `${dd}/${mm}/${yyyy}`;
}
