import { describe, expect, it } from "vitest";
import { maskCpf, maskEmail, maskNome, maskPayload, maskTelefone, sanitizeSnippet } from "@/lib/mask";

describe("mascaramento", () => {
  it("CPF no formato ***.456.789-**", () => {
    expect(maskCpf("12345678909")).toBe("***.456.789-**");
    expect(maskCpf("123.456.789-09")).toBe("***.456.789-**");
    expect(maskCpf("")).toBe("");
  });

  it("e-mail parcial", () => {
    expect(maskEmail("joao.silva@gmail.com")).toBe("jo***@gmail.com");
    expect(maskEmail("a@b.com")).toBe("a***@b.com");
    expect(maskEmail("invalido")).toBe("***");
  });

  it("telefone parcial, removendo DDI", () => {
    expect(maskTelefone("85999998888")).toBe("(85) *****-8888");
    expect(maskTelefone("+55 (85) 99999-8888")).toBe("(85) *****-8888");
    expect(maskTelefone("8533334444")).toBe("(85) ****-4444");
  });

  it("nome reduzido", () => {
    expect(maskNome("João da Silva")).toBe("João S.");
    expect(maskNome("Maria")).toBe("Maria");
  });

  it("payload: mascara dados pessoais e remove segredos, recursivamente", () => {
    const out = maskPayload({
      cpf: "12345678909",
      password: "segredo",
      token: "abc",
      cliente: { email: "joao.silva@gmail.com", telefone: "5585999998888", nome: "João da Silva", cep: "60000000" },
      lista: [{ cpf: "52998224725" }],
    }) as Record<string, any>;
    expect(out.cpf).toBe("***.456.789-**");
    expect(out.password).toBe("[REMOVIDO]");
    expect(out.token).toBe("[REMOVIDO]");
    expect(out.cliente.email).toBe("jo***@gmail.com");
    expect(out.cliente.telefone).toBe("(85) *****-8888");
    expect(out.cliente.nome).toBe("João S.");
    expect(out.cliente.cep).toBe("60000000");
    expect(out.lista[0].cpf).toBe("***.982.247-**");
    expect(JSON.stringify(out)).not.toContain("segredo");
  });

  it("snippet: remove tokens/CPF/e-mail e limita a 2 KB", () => {
    const s = sanitizeSnippet('{"token":"eyJabc","cpf":"123.456.789-09","email":"joao@x.com"} Bearer eyJxyz');
    expect(s).not.toContain("eyJabc");
    expect(s).not.toContain("eyJxyz");
    expect(s).toContain("***.456.789-**");
    expect(s).toContain("jo***@x.com");
    expect(Buffer.byteLength(sanitizeSnippet("x".repeat(5000)))).toBeLessThanOrEqual(2048);
  });
});
