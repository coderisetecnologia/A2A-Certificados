import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Budget } from "@/lib/budget";
import {
  __resetTokenCache,
  consultarCliente,
  criarAgendamento,
  GfsisError,
  parseAgendamento,
  parseAuthResponse,
  parseCliente,
  parseGfsisErrors,
  parseHorarios,
} from "@/lib/gfsis";
import { mapErroCadastroCliente } from "@/lib/errors";
import { authOk, json, mockFetch, setTestEnv } from "./helpers";

describe("parsers das respostas do GFSIS", () => {
  it("auth: formato { token, expiresIn }", () => {
    const now = 1_000_000;
    expect(parseAuthResponse({ token: "abc", expiresIn: 3600 }, now)).toEqual({ token: "abc", expiresAt: now + 3_600_000 });
  });

  it("auth: formato { accessToken, expirationDate } usa exp do JWT, limitado a 1h", () => {
    const now = Date.UTC(2026, 0, 1);
    const exp = Math.floor(now / 1000) + 1800;
    const jwt = `x.${Buffer.from(JSON.stringify({ exp })).toString("base64url")}.y`;
    expect(parseAuthResponse({ accessToken: jwt, expirationDate: "2026-01-01 00:30" }, now)).toEqual({
      token: jwt,
      expiresAt: exp * 1000,
    });
    const longo = `x.${Buffer.from(JSON.stringify({ exp: exp + 99999 })).toString("base64url")}.y`;
    expect(parseAuthResponse({ accessToken: longo }, now)?.expiresAt).toBe(now + 3_600_000);
    expect(parseAuthResponse({}, now)).toBeNull();
  });

  it("horários: horariosDisponiveis, listaHorarios ou mensagem", () => {
    expect(parseHorarios({ horariosDisponiveis: ["09:00", "08:00", "8:30"] }).horarios).toEqual(["08:00", "08:30", "09:00"]);
    expect(parseHorarios({ listaHorarios: ["15:40", "15:50"] }).horarios).toEqual(["15:40", "15:50"]);
    expect(parseHorarios({ mensagem: "Nenhum horário disponível para essa data" })).toEqual({
      horarios: [],
      mensagem: "Nenhum horário disponível para essa data",
    });
    expect(parseHorarios("Nenhum horário disponível").horarios).toEqual([]);
  });

  it("agendamento: idAgendamento/ISO ou id/dd-MM-yyyy", () => {
    expect(parseAgendamento({ idAgendamento: 999, data: "2025-08-10", horario: "08:30" })).toEqual({
      id: "999",
      data: "2025-08-10",
      horario: "08:30",
    });
    expect(parseAgendamento({ id: 26060, data: "20/11/2023", horario: "17:30" })).toEqual({
      id: "26060",
      data: "2023-11-20",
      horario: "17:30",
    });
    expect(parseAgendamento({})).toBeNull();
  });

  it("erros: { codigo, mensagem } e { erros: [...] }", () => {
    expect(parseGfsisErrors({ erro: true, codigo: "8", mensagem: "Data obrigatória" })).toEqual([
      { codigo: "008", mensagem: "Data obrigatória" },
    ]);
    expect(
      parseGfsisErrors({ horario: "2026-01-19", erros: [{ codigo: "003", mensagem: "Já existe" }, { codigo: "010", mensagem: "E-mail" }] }),
    ).toHaveLength(2);
    expect(parseGfsisErrors(null, "Internal error")).toEqual([{ mensagem: "Internal error" }]);
  });

  it("mapeia códigos do POST /Cliente para códigos estáveis", () => {
    expect(mapErroCadastroCliente([{ codigo: "008", mensagem: "" }]).code).toBe("DATA_NASCIMENTO_OBRIGATORIA");
    expect(mapErroCadastroCliente([{ codigo: "010", mensagem: "" }]).code).toBe("EMAIL_OBRIGATORIO");
    expect(mapErroCadastroCliente([{ codigo: "012", mensagem: "" }]).code).toBe("ENDERECO_INVALIDO");
    expect(mapErroCadastroCliente([{ codigo: "013", mensagem: "" }]).code).toBe("ENDERECO_INVALIDO");
    expect(mapErroCadastroCliente([{ codigo: "007", mensagem: "" }]).code).toBe("CPF_INVALIDO");
    expect(mapErroCadastroCliente([{ codigo: "999", mensagem: "" }]).code).toBe("GFSIS_ERRO_CADASTRO");
  });

  it("cliente: normaliza telefone 'Celular: ...', data dd-MM-yyyy e CEP", () => {
    const c = parseCliente({
      nome: "João",
      cpf: "123.456.789-01",
      telefone: "Celular: 37111111111",
      dataNascimento: "15-04-1985",
      cep: "30123-456",
      uf: "mg",
    });
    expect(c).toMatchObject({ cpf: "12345678901", telefone: "37111111111", dataNascimento: "1985-04-15", cep: "30123456", uf: "MG" });
  });
});

describe("cliente HTTP do GFSIS", () => {
  beforeEach(() => {
    setTestEnv();
    __resetTokenCache();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("deduplica autenticações concorrentes e reutiliza o token em cache", async () => {
    let resolveAuth: (r: Response) => void = () => {};
    const m = mockFetch({
      "POST /auth": () => new Promise<Response>((r) => (resolveAuth = r)),
      "GET /ConsultaCliente": () => json({}, 404),
    });
    const budget = new Budget(10_000);
    const p = Promise.all([consultarCliente("52998224725", budget), consultarCliente("52998224725", budget)]);
    await new Promise((r) => setTimeout(r, 10));
    resolveAuth(json({ token: "tok", expiresIn: 3600 }));
    await p;
    await consultarCliente("52998224725", budget);
    expect(m.count("POST /auth")).toBe(1);
    expect(m.count("GET /ConsultaCliente")).toBe(3);
    const auth = m.calls.find((c) => c.path === "/auth")!;
    expect(auth.body).toEqual({ username: "INTEGRACAO", password: "senha-secreta" });
    expect(auth.headers.get("authorization")).toMatch(/^Basic /);
    expect(m.calls[1]!.headers.get("authorization")).toBe("Bearer tok");
  });

  it("em 401 reautentica uma vez e repete a chamada", async () => {
    let n = 0;
    const m = mockFetch({
      "POST /auth": () => json({ token: `tok-${++n}`, expiresIn: 3600 }),
      "GET /ConsultaCliente": (c) =>
        c.headers.get("authorization") === "Bearer tok-1" ? json({}, 401) : json({ nome: "Maria", cpf: "52998224725" }),
    });
    const r = await consultarCliente("52998224725", new Budget(10_000));
    expect(r.status).toBe("encontrado");
    expect(m.count("POST /auth")).toBe(2);
  });

  it("401 persistente vira GfsisError(auth)", async () => {
    mockFetch({ "POST /auth": authOk, "GET /ConsultaCliente": () => json({}, 401) });
    await expect(consultarCliente("52998224725", new Budget(10_000))).rejects.toMatchObject({ kind: "auth" });
  });

  it("retry 1x em 5xx para GET", async () => {
    let n = 0;
    const m = mockFetch({
      "POST /auth": authOk,
      "GET /ConsultaCliente": () => (++n === 1 ? json({}, 503) : json({}, 404)),
    });
    const r = await consultarCliente("52998224725", new Budget(10_000));
    expect(r.status).toBe("nao_encontrado");
    expect(m.count("GET /ConsultaCliente")).toBe(2);
  });

  it("não faz retry se não houver orçamento", async () => {
    const m = mockFetch({ "POST /auth": authOk, "GET /ConsultaCliente": () => json({}, 503) });
    await expect(consultarCliente("52998224725", new Budget(1_000))).rejects.toBeInstanceOf(GfsisError);
    expect(m.count("GET /ConsultaCliente")).toBe(1);
  });

  it("POST /Agendamento nunca é repetido automaticamente", async () => {
    const m = mockFetch({ "POST /auth": authOk, "POST /Agendamento": () => json({}, 502) });
    await expect(
      criarAgendamento(
        {
          data: "2026-09-16",
          horario: "09:00",
          identificadorPontoAtendimento: 10,
          videoconferencia: true,
          cliente: { nome: "A", cpf: "52998224725", email: "a@b.com" },
        },
        new Budget(10_000),
      ),
    ).rejects.toMatchObject({ kind: "http", status: 502 });
    expect(m.count("POST /Agendamento")).toBe(1);
  });

  it("timeout por chamada via AbortController", async () => {
    mockFetch({
      "POST /auth": authOk,
      "GET /ConsultaCliente": (c) =>
        new Promise((_, reject) => {
          // simula servidor que não responde: só rejeita quando abortado
          c.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
        }),
    });
    const t0 = Date.now();
    // Orçamento curto → timeout curto, sem retry (sem orçamento)
    const err = await consultarCliente("52998224725", new Budget(800)).catch((e) => e);
    expect(err).toBeInstanceOf(GfsisError);
    expect(err.kind).toBe("timeout");
    expect(Date.now() - t0).toBeLessThan(2_000);
  }, 10_000);
});
