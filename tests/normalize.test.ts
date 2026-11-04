import { describe, expect, it } from "vitest";
import { cleanText, normalizeData, normalizeHorario, normalizeTelefone, primeiroNome } from "@/lib/normalize";

describe("normalização", () => {
  it("telefone: remove +55 e caracteres", () => {
    expect(normalizeTelefone("+55 (85) 99999-8888")).toBe("85999998888");
    expect(normalizeTelefone("5585999998888")).toBe("85999998888");
    expect(normalizeTelefone("558533334444")).toBe("8533334444");
    expect(normalizeTelefone("085999998888")).toBe("85999998888");
    expect(normalizeTelefone("85999998888")).toBe("85999998888");
  });

  it("data: aceita dd/MM/yyyy, dd-MM-yyyy e ISO", () => {
    expect(normalizeData("15/09/2026")).toBe("2026-09-15");
    expect(normalizeData("5/9/2026")).toBe("2026-09-05");
    expect(normalizeData("15-04-1985")).toBe("1985-04-15");
    expect(normalizeData("2026-09-15")).toBe("2026-09-15");
    expect(normalizeData("2026-09-15T00:00:00.000Z")).toBe("2026-09-15");
    expect(normalizeData("15/09/2026 00:00:00")).toBe("2026-09-15");
  });

  it("data: rejeita datas inexistentes", () => {
    expect(normalizeData("31/02/2026")).toBeNull();
    expect(normalizeData("2026-13-01")).toBeNull();
    expect(normalizeData("amanhã")).toBeNull();
  });

  it("horário", () => {
    expect(normalizeHorario("9:00")).toBe("09:00");
    expect(normalizeHorario("09:00:00")).toBe("09:00");
    expect(normalizeHorario("14h30")).toBe("14:30");
    expect(normalizeHorario("9h")).toBe("09:00");
    expect(normalizeHorario("25:00")).toBeNull();
  });

  it("cleanText trata variáveis não resolvidas da Suri como vazio", () => {
    expect(cleanText("@User.IdentificationDocument")).toBeUndefined();
    expect(cleanText("{{cpf}}")).toBeUndefined();
    expect(cleanText("null")).toBeUndefined();
    expect(cleanText("  ")).toBeUndefined();
    expect(cleanText(123)).toBe("123");
  });

  it("primeiro nome capitalizado", () => {
    expect(primeiroNome("JOÃO DA SILVA")).toBe("João");
  });
});
