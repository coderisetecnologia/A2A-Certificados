import { describe, expect, it } from "vitest";
import { formatCnpj, identificarDocumento, isValidCnpj, queryDocumento, resolverDocumento } from "@/lib/documento";

describe("CNPJ", () => {
  it("valida CNPJ numérico com e sem máscara", () => {
    expect(isValidCnpj("11.222.333/0001-81")).toBe(true);
    expect(isValidCnpj("11222333000181")).toBe(true);
    expect(isValidCnpj("11222333000182")).toBe(false);
    expect(isValidCnpj("00000000000000")).toBe(false);
    expect(isValidCnpj("1122233300018")).toBe(false);
  });

  it("valida CNPJ alfanumérico (exemplo da Receita Federal)", () => {
    expect(isValidCnpj("12.ABC.345/01DE-35")).toBe(true);
    expect(isValidCnpj("12abc34501de35")).toBe(true);
    expect(isValidCnpj("12ABC34501DE36")).toBe(false);
    expect(formatCnpj("12abc34501de35")).toBe("12.ABC.345/01DE-35");
  });
});

describe("identificarDocumento", () => {
  it("decide pelo tamanho", () => {
    expect(identificarDocumento("529.982.247-25")).toEqual({ status: "ok", documento: { tipo: "cpf", numero: "52998224725" } });
    expect(identificarDocumento("11.222.333/0001-81")).toEqual({
      status: "ok",
      documento: { tipo: "cnpj", numero: "11222333000181" },
    });
    expect(identificarDocumento("111.111.111-11")).toEqual({ status: "invalido", tipo: "cpf" });
    expect(identificarDocumento("11222333000182")).toEqual({ status: "invalido", tipo: "cnpj" });
    expect(identificarDocumento("123")).toEqual({ status: "invalido", tipo: null });
    expect(identificarDocumento("123", "cnpj")).toEqual({ status: "invalido", tipo: "cnpj" });
  });
});

describe("resolverDocumento", () => {
  it("aceita documento, cpf ou cnpj", () => {
    expect(resolverDocumento({ documento: "11222333000181" })).toMatchObject({ ok: true, documento: { tipo: "cnpj" } });
    expect(resolverDocumento({ cpf: "52998224725" })).toMatchObject({ ok: true, documento: { tipo: "cpf" } });
    expect(resolverDocumento({ cnpj: "11222333000181" })).toMatchObject({ ok: true, documento: { tipo: "cnpj" } });
  });

  it("inválido → CPF_INVALIDO / CNPJ_INVALIDO sem gravar erro", () => {
    const cpf = resolverDocumento({ cpf: "12345" });
    expect(cpf).toMatchObject({ ok: false, result: { code: "CPF_INVALIDO" } });
    expect(!cpf.ok && cpf.result.errorLog).toBeUndefined();
    expect(resolverDocumento({ cnpj: "12345" })).toMatchObject({ ok: false, result: { code: "CNPJ_INVALIDO" } });
  });

  it("ausente → DADOS_INVALIDOS gravado (erro de configuração do flow)", () => {
    const r = resolverDocumento({});
    expect(r).toMatchObject({ ok: false, result: { code: "DADOS_INVALIDOS", errorLog: { errorCode: "DOCUMENTO_AUSENTE" } } });
  });

  it("monta a query do GFSIS", () => {
    expect(queryDocumento({ tipo: "cnpj", numero: "11222333000181" })).toEqual({ cnpj: "11222333000181" });
    expect(queryDocumento("529.982.247-25")).toEqual({ cpf: "52998224725" });
  });
});
