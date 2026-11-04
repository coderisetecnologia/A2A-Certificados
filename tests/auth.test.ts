import { describe, expect, it } from "vitest";
import { isAllowedEmail, isAllowedGoogleProfile } from "@/lib/auth";
import { safeEqual } from "@/lib/security";

const ALLOWED = "coderisetecnologia@gmail.com";

describe("controle de acesso por e-mail", () => {
  it("aceita somente o e-mail permitido (case-insensitive)", () => {
    expect(isAllowedEmail("coderisetecnologia@gmail.com", ALLOWED)).toBe(true);
    expect(isAllowedEmail("CodeRiseTecnologia@Gmail.com ", ALLOWED)).toBe(true);
    expect(isAllowedEmail("outra@gmail.com", ALLOWED)).toBe(false);
    expect(isAllowedEmail("coderisetecnologia@gmail.com.evil.com", ALLOWED)).toBe(false);
    expect(isAllowedEmail("xcoderisetecnologia@gmail.com", ALLOWED)).toBe(false);
    expect(isAllowedEmail("", ALLOWED)).toBe(false);
    expect(isAllowedEmail(undefined, ALLOWED)).toBe(false);
    expect(isAllowedEmail("qualquer@x.com", "")).toBe(false);
  });

  it("signIn exige email_verified === true (booleano)", () => {
    expect(isAllowedGoogleProfile({ email: ALLOWED, email_verified: true }, ALLOWED)).toBe(true);
    expect(isAllowedGoogleProfile({ email: ALLOWED, email_verified: false }, ALLOWED)).toBe(false);
    expect(isAllowedGoogleProfile({ email: ALLOWED, email_verified: "true" }, ALLOWED)).toBe(false);
    expect(isAllowedGoogleProfile({ email: ALLOWED }, ALLOWED)).toBe(false);
    expect(isAllowedGoogleProfile({ email: "outra@gmail.com", email_verified: true }, ALLOWED)).toBe(false);
    expect(isAllowedGoogleProfile(null, ALLOWED)).toBe(false);
  });

  it("usa ALLOWED_EMAIL com padrão coderisetecnologia@gmail.com", () => {
    delete process.env.ALLOWED_EMAIL;
    expect(isAllowedEmail(ALLOWED)).toBe(true);
    expect(isAllowedEmail("outra@gmail.com")).toBe(false);
  });
});

describe("comparação de chave em tempo constante", () => {
  it("compara corretamente e falha fechado sem chave", () => {
    expect(safeEqual("abc", "abc")).toBe(true);
    expect(safeEqual("abc", "abd")).toBe(false);
    expect(safeEqual("abc", "abcd")).toBe(false);
    expect(safeEqual(null, "abc")).toBe(false);
    expect(safeEqual("abc", null)).toBe(false);
    expect(safeEqual("", "")).toBe(false);
  });
});
