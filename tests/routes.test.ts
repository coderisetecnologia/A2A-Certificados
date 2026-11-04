import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { __resetTokenCache } from "@/lib/gfsis";
import { POST as agendar } from "@/app/api/suri/agendar/route";
import { POST as consultar } from "@/app/api/suri/cliente/consultar/route";
import { POST as salvar } from "@/app/api/suri/cliente/salvar/route";
import { POST as horarios } from "@/app/api/suri/horarios/route";
import { authOk, callRoute, captureErrorLogs, json, mockFetch, setTestEnv } from "./helpers";

const CPF = "52998224725";
const CLIENTE_GFSIS = {
  nome: "Maria Souza",
  cpf: CPF,
  email: "maria.souza@gmail.com",
  telefone: "Celular: 85999998888",
  logradouro: "Rua A",
  numero: "10",
  bairro: "Centro",
  municipio: "Fortaleza",
  uf: "CE",
  cep: "60000-000",
  dataNascimento: "15-04-1985",
};

beforeEach(() => {
  setTestEnv();
  __resetTokenCache();
  // Terça 15/09/2026 10:00 em Fortaleza (13:00 UTC). Só o Date é falso.
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-09-15T13:00:00Z"));
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("autenticação x-api-key", () => {
  it("sem chave ou com chave errada → 401", async () => {
    captureErrorLogs();
    expect((await callRoute(consultar, { cpf: CPF }, null)).status).toBe(401);
    const r = await callRoute(consultar, { cpf: CPF }, "errada");
    expect(r.status).toBe(401);
    expect(r.body).toMatchObject({ ok: false, code: "NAO_AUTORIZADO" });
  });
});

describe("/cliente/consultar", () => {
  it("encontrado: campos planos e mascarados", async () => {
    captureErrorLogs();
    mockFetch({ "POST /auth": authOk, "GET /ConsultaCliente": () => json(CLIENTE_GFSIS) });
    const r = await callRoute(consultar, { cpf: "529.982.247-25" });
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({
      ok: true,
      code: "OK",
      data: {
        encontrado: true,
        primeiroNome: "Maria",
        emailMascarado: "ma***@gmail.com",
        telefoneMascarado: "(85) *****-8888",
        cadastroCompleto: true,
        camposFaltantes: "",
      },
    });
    expect(r.body.correlationId).toBeTruthy();
  });

  it("cadastro incompleto lista campos faltantes", async () => {
    captureErrorLogs();
    mockFetch({
      "POST /auth": authOk,
      "GET /ConsultaCliente": () => json({ ...CLIENTE_GFSIS, dataNascimento: null, cep: "" }),
    });
    const r = await callRoute(consultar, { cpf: CPF });
    expect(r.body.data).toMatchObject({ cadastroCompleto: false, camposFaltantes: "dataNascimento,cep", faltaEndereco: true });
  });

  it("404 do GFSIS → encontrado:false (não é erro, não grava)", async () => {
    const logs = captureErrorLogs();
    mockFetch({ "POST /auth": authOk, "GET /ConsultaCliente": () => json({}, 404) });
    const r = await callRoute(consultar, { cpf: CPF });
    expect(r.body).toMatchObject({ ok: true, code: "CLIENTE_NAO_ENCONTRADO", data: { encontrado: false } });
    expect(logs).toHaveLength(0);
  });

  it("CPF inválido não chama o GFSIS e não grava erro", async () => {
    const logs = captureErrorLogs();
    const m = mockFetch({});
    const r = await callRoute(consultar, { cpf: "111.111.111-11" });
    expect(r.body).toMatchObject({ ok: false, code: "CPF_INVALIDO" });
    expect(m.calls).toHaveLength(0);
    expect(logs).toHaveLength(0);
  });

  it("GFSIS fora do ar → GFSIS_INDISPONIVEL (HTTP 200) e grava erro sem expor detalhes", async () => {
    const logs = captureErrorLogs();
    mockFetch({ "POST /auth": authOk, "GET /ConsultaCliente": () => json({ trace: "java.lang.NullPointer" }, 500) });
    const r = await callRoute(consultar, { cpf: CPF });
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ ok: false, code: "GFSIS_INDISPONIVEL" });
    expect(JSON.stringify(r.body)).not.toContain("NullPointer");
    expect(logs).toHaveLength(1);
    expect(logs[0]).toMatchObject({ errorCode: "GFSIS_HTTP", httpStatus: 500 });
  });
});

describe("/horarios", () => {
  it("filtra período, descarta horários passados de hoje e numera opções", async () => {
    captureErrorLogs();
    const m = mockFetch({
      "POST /auth": authOk,
      "GET /ConsultaHorarioAgenda": (c) => {
        const d = c.query.get("data");
        if (d === "2026-09-15") return json({ horariosDisponiveis: ["08:00", "10:00", "10:30", "11:00", "14:00"] });
        if (d === "2026-09-16") return json({ listaHorarios: ["09:00", "13:00"] });
        return json({ mensagem: "Nenhum horário disponível para essa data" });
      },
    });
    const r = await callRoute(horarios, { periodo: "Manhã", dias: "3" });
    expect(m.calls.filter((c) => c.path === "/ConsultaHorarioAgenda").map((c) => c.query.get("data"))).toEqual([
      "2026-09-15",
      "2026-09-16",
      "2026-09-17",
    ]);
    expect(m.calls.find((c) => c.path === "/ConsultaHorarioAgenda")!.query.get("identificadorPontoAtendimento")).toBe("10");
    // 10:00 local + 30 min de antecedência → só 11:00 de hoje
    // data traz SOMENTE as opções.
    expect(r.body).toMatchObject({ ok: true, code: "OK" });
    expect(r.body.data).toEqual({
      opcoes: [
        { numero: 1, data: "2026-09-15", horario: "11:00", label: "15/09 (Terça) 11:00" },
        { numero: 2, data: "2026-09-16", horario: "09:00", label: "16/09 (Quarta) 09:00" },
      ],
    });
    expect(r.body.message).toBe("Encontrei 2 horários");
  });

  it("respeita maxOpcoes", async () => {
    captureErrorLogs();
    mockFetch({
      "POST /auth": authOk,
      "GET /ConsultaHorarioAgenda": () => json({ horariosDisponiveis: ["07:00", "08:00", "09:00", "10:00", "11:00"] }),
    });
    const r = await callRoute(horarios, { periodo: "manha", dataInicial: "16/09/2026", dias: 3, maxOpcoes: "4" });
    expect(r.body.message).toBe("Encontrei 4 horários");
    expect(Object.keys(r.body.data)).toEqual(["opcoes"]);
    expect(r.body.data.opcoes).toHaveLength(4);
    expect(r.body.data.opcoes.map((o: { numero: number }) => o.numero)).toEqual([1, 2, 3, 4]);
  });

  it("sem horários no período → SEM_HORARIOS sem gravar erro", async () => {
    const logs = captureErrorLogs();
    mockFetch({ "POST /auth": authOk, "GET /ConsultaHorarioAgenda": () => json({ horariosDisponiveis: ["09:00"] }) });
    const r = await callRoute(horarios, { periodo: "noite" });
    expect(r.body).toMatchObject({ ok: false, code: "SEM_HORARIOS" });
    expect(r.body.message).toMatch(/outro período/);
    expect(logs).toHaveLength(0);
  });

  it("período inválido → DADOS_INVALIDOS", async () => {
    captureErrorLogs();
    const r = await callRoute(horarios, { periodo: "madrugada" });
    expect(r.body).toMatchObject({ ok: false, code: "DADOS_INVALIDOS" });
  });
});

describe("/agendar", () => {
  const body = {
    data: "16/09/2026",
    horario: "09:00",
    cliente: { cpf: CPF, nome: "Maria Souza", email: "maria.souza@gmail.com", telefone: "+55 85 99999-8888" },
  };

  it("cria agendamento completando dados pelo GFSIS e devolve confirmação pronta", async () => {
    captureErrorLogs();
    const m = mockFetch({
      "POST /auth": authOk,
      "GET /ConsultaAgendamentoCliente": () => json({}, 404),
      "GET /ConsultaCliente": () => json(CLIENTE_GFSIS),
      "POST /Agendamento": () => json({ idAgendamento: 999, data: "2026-09-16", horario: "09:00" }, 201),
    });
    const r = await callRoute(agendar, body);
    expect(r.body).toMatchObject({
      ok: true,
      code: "OK",
      data: {
        idAgendamento: "999",
        dataFormatada: "16/09 (Quarta)",
        horario: "09:00",
        videoconferencia: true,
      },
    });
    expect(r.body.data.mensagemConfirmacao).toContain("Online (link será enviado por e-mail)");
    const post = m.calls.find((c) => c.path === "/Agendamento")!;
    expect(post.body).toMatchObject({
      data: "2026-09-16",
      horario: "09:00",
      identificadorPontoAtendimento: 10,
      videoconferencia: true,
      cliente: { cpf: CPF, telefone: "85999998888", logradouro: "Rua A", municipio: "Fortaleza", uf: "CE", cep: "60000-000" },
    });
  });

  it("idempotência: mesmo agendamento já existente → JA_AGENDADO sem criar outro", async () => {
    captureErrorLogs();
    const m = mockFetch({
      "POST /auth": authOk,
      "GET /ConsultaAgendamentoCliente": () => json({ id: 26030, data: "16/09/2026", horario: "09:00" }),
    });
    const r = await callRoute(agendar, body);
    expect(r.body).toMatchObject({ ok: true, code: "JA_AGENDADO", data: { idAgendamento: "26030" } });
    expect(m.count("POST /Agendamento")).toBe(0);
  });

  it("409 → HORARIO_INDISPONIVEL sem gravar erro", async () => {
    const logs = captureErrorLogs();
    mockFetch({
      "POST /auth": authOk,
      "GET /ConsultaAgendamentoCliente": () => json({}, 404),
      "GET /ConsultaCliente": () => json(CLIENTE_GFSIS),
      "POST /Agendamento": () => json({ mensagem: "Horário não disponível" }, 409),
    });
    const r = await callRoute(agendar, body);
    expect(r.body).toMatchObject({ ok: false, code: "HORARIO_INDISPONIVEL", data: { reconsultar: true } });
    expect(logs).toHaveLength(0);
  });

  it("falha de rede no POST: não repete; verifica pelo GET e confirma se foi criado", async () => {
    const logs = captureErrorLogs();
    let consultas = 0;
    const m = mockFetch({
      "POST /auth": authOk,
      "GET /ConsultaAgendamentoCliente": () =>
        ++consultas === 1 ? json({}, 404) : json({ id: 777, data: "2026-09-16", horario: "09:00" }),
      "GET /ConsultaCliente": () => json(CLIENTE_GFSIS),
      "POST /Agendamento": () => {
        throw new TypeError("fetch failed");
      },
    });
    const r = await callRoute(agendar, body);
    expect(m.count("POST /Agendamento")).toBe(1);
    expect(r.body).toMatchObject({ ok: true, code: "OK", data: { idAgendamento: "777" } });
    expect(logs).toHaveLength(1); // falha técnica registrada mesmo recuperada
  });

  it("aceita horarioEscolhido único (label da opção) e separa data e horário", async () => {
    captureErrorLogs();
    const m = mockFetch({
      "POST /auth": authOk,
      "GET /ConsultaAgendamentoCliente": () => json({}, 404),
      "GET /ConsultaCliente": () => json(CLIENTE_GFSIS),
      "POST /Agendamento": () => json({ idAgendamento: 1000, data: "2026-09-16", horario: "09:00" }, 201),
    });
    const { data: _d, horario: _h, ...semCampos } = body;
    const r = await callRoute(agendar, { ...semCampos, horarioEscolhido: "16/09 (Quarta) 09:00" });
    expect(r.body).toMatchObject({ ok: true, code: "OK", data: { idAgendamento: "1000" } });
    expect(m.calls.find((c) => c.path === "/Agendamento")!.body).toMatchObject({ data: "2026-09-16", horario: "09:00" });
  });

  it("horarioEscolhido ilegível → DATA_INVALIDA sem chamar o GFSIS", async () => {
    captureErrorLogs();
    const m = mockFetch({});
    const r = await callRoute(agendar, { cliente: body.cliente, horarioEscolhido: "quero de manhã" });
    expect(r.body).toMatchObject({ ok: false, code: "DATA_INVALIDA" });
    expect(m.calls).toHaveLength(0);
  });

  it("horário que já passou hoje → HORARIO_INDISPONIVEL sem chamar o GFSIS", async () => {
    captureErrorLogs();
    const m = mockFetch({});
    const r = await callRoute(agendar, { ...body, data: "2026-09-15", horario: "09:30" });
    expect(r.body).toMatchObject({ ok: false, code: "HORARIO_INDISPONIVEL" });
    expect(m.calls).toHaveLength(0);
  });
});

describe("/cliente/salvar", () => {
  it("completa endereço via ViaCEP e envia data no formato yyyy-MM-dd", async () => {
    captureErrorLogs();
    const m = mockFetch({
      "POST /auth": authOk,
      "GET /ConsultaCliente": () => json({}, 404),
      "https://viacep.com.br/ws/60110001/json/": () =>
        json({ cep: "60110-001", logradouro: "Av. Santos Dumont", bairro: "Aldeota", localidade: "Fortaleza", uf: "CE", ibge: "2304400" }),
      "POST /Cliente": () => json({ id: "Ny0da121" }),
    });
    const r = await callRoute(salvar, {
      cpf: CPF,
      nome: "Maria Souza",
      email: "maria.souza@gmail.com",
      telefone: "5585999998888",
      dataNascimento: "15/04/1985",
      cep: "60110-001",
      numero: "100",
    });
    expect(r.body).toMatchObject({ ok: true, code: "OK", data: { cadastroCompleto: true, novoCadastro: true } });
    const post = m.calls.find((c) => c.path === "/Cliente")!;
    expect(post.body).toMatchObject({
      cpf: CPF,
      dataNascimento: "1985-04-15",
      telefone: "85999998888",
      logradouro: "Av. Santos Dumont",
      bairro: "Aldeota",
      municipio: "Fortaleza",
      uf: "CE",
      codigoIbge: "2304400",
      cep: "60110-001",
      numero: "100",
    });
  });

  it("erro 008 do GFSIS → DATA_NASCIMENTO_OBRIGATORIA e grava (dado mal coletado)", async () => {
    const logs = captureErrorLogs();
    mockFetch({
      "POST /auth": authOk,
      "GET /ConsultaCliente": () => json({}, 404),
      "POST /Cliente": () =>
        json({ erros: [{ codigo: "008", mensagem: "É necessário informar a data de nascimento" }] }, 400),
    });
    const r = await callRoute(salvar, { cpf: CPF, nome: "Maria", email: "maria@gmail.com" });
    expect(r.body).toMatchObject({ ok: false, code: "DATA_NASCIMENTO_OBRIGATORIA", data: { gfsisCodigo: "008" } });
    expect(logs).toHaveLength(1);
    expect(logs[0]).toMatchObject({ errorCode: "GFSIS_008", route: "/api/suri/cliente/salvar" });
  });
});

describe("GFSIS_PONTO_ATENDIMENTO_ID opcional", () => {
  beforeEach(() => {
    delete process.env.GFSIS_PONTO_ATENDIMENTO_ID;
  });

  it("consultar cliente funciona sem ponto configurado", async () => {
    captureErrorLogs();
    mockFetch({ "POST /auth": authOk, "GET /ConsultaCliente": () => json(CLIENTE_GFSIS) });
    const r = await callRoute(consultar, { cpf: CPF });
    expect(r.body).toMatchObject({ ok: true, code: "OK", data: { encontrado: true } });
  });

  it("horarios sem ponto (nem no env nem no body) → CONFIGURACAO_INVALIDA sem chamar o GFSIS", async () => {
    captureErrorLogs();
    const m = mockFetch({ "POST /auth": authOk });
    const r = await callRoute(horarios, { periodo: "manha" });
    expect(r.status).toBe(500);
    expect(r.body).toMatchObject({ ok: false, code: "CONFIGURACAO_INVALIDA" });
    expect(m.calls.some((c) => c.path === "/ConsultaHorarioAgenda")).toBe(false);
  });

  it("horarios usa identificadorPontoAtendimento do body quando não há padrão", async () => {
    captureErrorLogs();
    const m = mockFetch({
      "POST /auth": authOk,
      "GET /ConsultaHorarioAgenda": () => json({ horariosDisponiveis: ["11:00"] }),
    });
    await callRoute(horarios, { periodo: "manha", dias: 1, identificadorPontoAtendimento: "77" });
    expect(m.calls.find((c) => c.path === "/ConsultaHorarioAgenda")!.query.get("identificadorPontoAtendimento")).toBe("77");
  });
});
