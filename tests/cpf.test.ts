import { describe, expect, it } from "vitest";
import { formatCpf, isValidCpf, normalizeCpf } from "@/lib/cpf";

describe("CPF", () => {
  it("aceita CPFs válidos com e sem máscara", () => {
    expect(isValidCpf("529.982.247-25")).toBe(true);
    expect(isValidCpf("52998224725")).toBe(true);
    expect(isValidCpf("111.444.777-35")).toBe(true);
  });

  it("rejeita dígitos verificadores errados", () => {
    expect(isValidCpf("529.982.247-24")).toBe(false);
    expect(isValidCpf("12345678900")).toBe(false);
  });

  it("rejeita sequências repetidas e tamanhos errados", () => {
    expect(isValidCpf("000.000.000-00")).toBe(false);
    expect(isValidCpf("11111111111")).toBe(false);
    expect(isValidCpf("5299822472")).toBe(false);
    expect(isValidCpf("")).toBe(false);
    expect(isValidCpf(null)).toBe(false);
  });

  it("normaliza e formata", () => {
    expect(normalizeCpf(" 529.982.247-25 ")).toBe("52998224725");
    expect(formatCpf("52998224725")).toBe("529.982.247-25");
  });
});
