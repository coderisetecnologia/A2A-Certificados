import { describe, expect, it } from "vitest";
import { parseDiasAtendimento } from "@/lib/env";
import {
  descartarPassados,
  filtrarPorPeriodo,
  montarRespostaOpcoes,
  periodoDoHorario,
  planejarDias,
  selecionarOpcoes,
} from "@/lib/horarios";
import { formatDataCurta, nowInTz, proximosDiasAtendimento, weekdayOf } from "@/lib/time";

const TZ = "America/Fortaleza"; // UTC-3, sem horário de verão
const SEG_SEX = new Set([1, 2, 3, 4, 5]);

describe("fuso horário do negócio", () => {
  it("às 22h locais (01h UTC do dia seguinte) 'hoje' continua sendo o dia local", () => {
    const utc = new Date("2026-09-16T01:00:00Z"); // terça 15/09 22:00 em Fortaleza
    const agora = nowInTz(TZ, utc);
    expect(utc.toISOString().slice(0, 10)).toBe("2026-09-16"); // o que a Vercel (UTC) acharia
    expect(agora.date).toBe("2026-09-15");
    expect(agora.time).toBe("22:00");
    expect(agora.weekday).toBe(2); // terça
  });

  it("dia da semana e rótulo de data independem do fuso do servidor", () => {
    expect(weekdayOf("2026-09-15")).toBe(2);
    expect(formatDataCurta("2026-09-14")).toBe("14/09 (Segunda)");
    expect(formatDataCurta("2026-09-15")).toBe("15/09 (Terça)");
  });

  it("próximos dias de atendimento pulam fim de semana", () => {
    expect(proximosDiasAtendimento("2026-09-18", 3, SEG_SEX)).toEqual(["2026-09-18", "2026-09-21", "2026-09-22"]);
  });

  it("DIAS_ATENDIMENTO: parse com fallback seg–sex", () => {
    expect([...parseDiasAtendimento("1,2,3,4,5,6")]).toEqual([1, 2, 3, 4, 5, 6]);
    expect([...parseDiasAtendimento("")]).toEqual([1, 2, 3, 4, 5]);
    expect([...parseDiasAtendimento("9,x")]).toEqual([1, 2, 3, 4, 5]);
  });
});

describe("planejarDias", () => {
  const base = { dias: 5, diasAtendimento: SEG_SEX, antecedenciaMin: 30 };

  it("22h locais, período manhã: começa amanhã (não pula 2 dias por causa do UTC)", () => {
    const agora = nowInTz(TZ, new Date("2026-09-16T01:00:00Z"));
    expect(planejarDias({ ...base, agora, periodo: "manha" })).toEqual([
      "2026-09-16",
      "2026-09-17",
      "2026-09-18",
      "2026-09-21",
      "2026-09-22",
    ]);
  });

  it("22h locais, período noite: hoje ainda é consultado", () => {
    const agora = nowInTz(TZ, new Date("2026-09-16T01:00:00Z"));
    expect(planejarDias({ ...base, agora, periodo: "noite" })[0]).toBe("2026-09-15");
  });

  it("sexta 22h, manhã: próxima segunda", () => {
    const agora = nowInTz(TZ, new Date("2026-09-19T01:00:00Z")); // sexta 18/09 22:00 local
    expect(agora.date).toBe("2026-09-18");
    expect(planejarDias({ ...base, dias: 2, agora, periodo: "manha" })).toEqual(["2026-09-21", "2026-09-22"]);
  });

  it("dataInicial no passado é trazida para hoje; futura é respeitada", () => {
    const agora = nowInTz(TZ, new Date("2026-09-15T12:00:00Z")); // 09:00 local
    expect(planejarDias({ ...base, dias: 1, agora, periodo: "tarde", dataInicial: "2026-01-01" })).toEqual(["2026-09-15"]);
    expect(planejarDias({ ...base, dias: 1, agora, periodo: "tarde", dataInicial: "2026-09-21" })).toEqual(["2026-09-21"]);
  });
});

describe("filtro por período", () => {
  const horarios = ["08:00", "11:59", "12:00", "17:59", "18:00", "21:30"];

  it("manhã < 12:00, tarde 12:00–17:59, noite ≥ 18:00", () => {
    expect(filtrarPorPeriodo(horarios, "manha")).toEqual(["08:00", "11:59"]);
    expect(filtrarPorPeriodo(horarios, "tarde")).toEqual(["12:00", "17:59"]);
    expect(filtrarPorPeriodo(horarios, "noite")).toEqual(["18:00", "21:30"]);
    expect(periodoDoHorario("12:00")).toBe("tarde");
  });

  it("descarta horários que já passaram hoje (com antecedência)", () => {
    const h = ["09:00", "10:00", "10:30", "11:00"];
    expect(descartarPassados("2026-09-15", h, "2026-09-15", 10 * 60, 30)).toEqual(["11:00"]);
    expect(descartarPassados("2026-09-15", h, "2026-09-15", 10 * 60, 0)).toEqual(["10:30", "11:00"]);
    expect(descartarPassados("2026-09-16", h, "2026-09-15", 23 * 60, 30)).toEqual(h);
    expect(descartarPassados("2026-09-14", h, "2026-09-15", 0, 0)).toEqual([]);
  });
});

describe("opções numeradas", () => {
  it("distribui entre dias e espaça dentro do dia, em ordem cronológica", () => {
    const dia1 = Array.from({ length: 24 }, (_, i) => {
      const min = 8 * 60 + i * 10;
      return `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;
    });
    const opcoes = selecionarOpcoes(
      [
        { data: "2026-09-16", horarios: ["09:00", "10:00"] },
        { data: "2026-09-15", horarios: dia1 },
        { data: "2026-09-17", horarios: [] },
      ],
      6,
    );
    expect(opcoes.map((o) => `${o.numero} ${o.data} ${o.horario}`)).toEqual([
      "1 2026-09-15 08:00",
      "2 2026-09-15 09:00",
      "3 2026-09-15 10:00",
      "4 2026-09-15 11:00",
      "5 2026-09-16 09:00",
      "6 2026-09-16 10:00",
    ]);
    expect(opcoes[0]!.label).toBe("15/09 (Terça) 08:00");
  });

  it("respeita o máximo e o total disponível", () => {
    expect(selecionarOpcoes([{ data: "2026-09-15", horarios: ["09:00"] }], 6)).toHaveLength(1);
    expect(selecionarOpcoes([], 6)).toEqual([]);
  });

  it("monta campos planos e texto pronto para o retorno livre da Suri", () => {
    const opcoes = selecionarOpcoes([{ data: "2026-09-15", horarios: ["09:00", "10:30", "14:00"] }], 6);
    const data = montarRespostaOpcoes(opcoes);
    expect(data.quantidade).toBe(3);
    expect(data.texto).toBe(
      "1) 15/09 (Terça) 09:00\n2) 15/09 (Terça) 10:30\n3) 15/09 (Terça) 14:00\n\nResponda com o número da opção.",
    );
    expect(data.opcao2_data).toBe("2026-09-15");
    expect(data.opcao2_horario).toBe("10:30");
    expect(data.opcao3_label).toBe("15/09 (Terça) 14:00");
    expect(data.opcao4_data).toBeUndefined();
    expect(Array.isArray(data.opcoes)).toBe(true);
  });
});
