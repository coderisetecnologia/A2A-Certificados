import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { __resetTokenCache } from "@/lib/gfsis";
import { POST as proximo } from "@/app/api/suri/agendamento/proximo/route";
import { POST as boletos } from "@/app/api/suri/boletos/route";
import { POST as consultar } from "@/app/api/suri/cliente/consultar/route";
import { POST as notaFiscal } from "@/app/api/suri/nota-fiscal/route";
import { POST as pedido } from "@/app/api/suri/pedido/situacao/route";
import { authOk, callRoute, captureErrorLogs, json, mockFetch, setTestEnv } from "./helpers";

const CPF = "52998224725";
const CNPJ = "11222333000181";

beforeEach(() => {
  setTestEnv();
  delete process.env.GFSIS_UNIDADE_ID;
  __resetTokenCache();
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-09-15T13:00:00Z"));
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("/cliente/consultar por CNPJ", () => {
  it("envia ?cnpj= e não exige data de nascimento", async () => {
    captureErrorLogs();
    const m = mockFetch({
      "POST /auth": authOk,
      "GET /ConsultaCliente": () =>
        json({
          nome: "Empresa Exemplo LTDA",
          cnpj: CNPJ,
          email: "contato@empresa.com",
          telefone: "85999998888",
          logradouro: "Rua A",
          bairro: "Centro",
          municipio: "Fortaleza",
          uf: "CE",
          cep: "60000-000",
        }),
    });
    const r = await callRoute(consultar, { documento: "11.222.333/0001-81" });
    const call = m.calls.find((c) => c.path === "/ConsultaCliente")!;
    expect(call.query.get("cnpj")).toBe(CNPJ);
    expect(call.query.has("cpf")).toBe(false);
    expect(r.body).toMatchObject({
      ok: true,
      code: "OK",
      data: { encontrado: true, tipoDocumento: "cnpj", pessoaFisica: false, cadastroCompleto: true, primeiroNome: "Empresa Exemplo LTDA" },
    });
  });

  it("CNPJ inválido → CNPJ_INVALIDO sem chamar o GFSIS", async () => {
    const logs = captureErrorLogs();
    const m = mockFetch({});
    const r = await callRoute(consultar, { cnpj: "11.222.333/0001-82" });
    expect(r.body).toMatchObject({ ok: false, code: "CNPJ_INVALIDO" });
    expect(m.calls).toHaveLength(0);
    expect(logs).toHaveLength(0);
  });

  it("continua aceitando { cpf }", async () => {
    captureErrorLogs();
    const m = mockFetch({ "POST /auth": authOk, "GET /ConsultaCliente": () => json({}, 404) });
    const r = await callRoute(consultar, { cpf: CPF });
    expect(m.calls.find((c) => c.path === "/ConsultaCliente")!.query.get("cpf")).toBe(CPF);
    expect(r.body).toMatchObject({ ok: true, code: "CLIENTE_NAO_ENCONTRADO", data: { tipoDocumento: "cpf" } });
  });
});

describe("/agendamento/proximo", () => {
  it("encontrado: campos planos e mensagem pronta", async () => {
    captureErrorLogs();
    mockFetch({
      "POST /auth": authOk,
      "GET /ConsultaAgendamentoCliente": () => json({ id: 26030, data: "16/09/2026", horario: "09:00" }),
    });
    const r = await callRoute(proximo, { documento: CPF });
    expect(r.body).toMatchObject({
      ok: true,
      code: "OK",
      data: {
        possuiAgendamento: true,
        idAgendamento: "26030",
        data: "2026-09-16",
        dataFormatada: "16/09 (Quarta)",
        horario: "09:00",
        mensagemAgendamento: "📅 Seu próximo agendamento é 16/09 (Quarta), às 09:00.",
      },
    });
  });

  it("sem agendamento (404) → SEM_AGENDAMENTO, ok:true, sem gravar", async () => {
    const logs = captureErrorLogs();
    const m = mockFetch({
      "POST /auth": authOk,
      "GET /ConsultaAgendamentoCliente": () => json({ status: "error", message: "Cliente não possui nenhum agendamento" }, 500),
    });
    const r = await callRoute(proximo, { cnpj: CNPJ });
    expect(m.calls.find((c) => c.path === "/ConsultaAgendamentoCliente")!.query.get("cnpj")).toBe(CNPJ);
    expect(r.body).toMatchObject({ ok: true, code: "SEM_AGENDAMENTO", data: { possuiAgendamento: false } });
    expect(logs).toHaveLength(0);
  });
});

describe("/nota-fiscal", () => {
  it("lista os links e remove ';' do final", async () => {
    captureErrorLogs();
    mockFetch({
      "POST /auth": authOk,
      "GET /ConsultaNotaFiscal": () =>
        json([{ linkNotaFiscal: "https://nf.exemplo.com/servico/1;" }, { linkNotaFiscal: "https://nf.exemplo.com/produto/2" }]),
    });
    const r = await callRoute(notaFiscal, { documento: CPF });
    expect(r.body).toMatchObject({
      ok: true,
      code: "OK",
      data: {
        quantidade: 2,
        nota1_link: "https://nf.exemplo.com/servico/1",
        nota2_link: "https://nf.exemplo.com/produto/2",
      },
    });
    expect(r.body.data.texto).toContain("1) https://nf.exemplo.com/servico/1");
  });

  it("código 003 → NOTA_FISCAL_NAO_GERADA; 002 → SEM_NOTA_FISCAL (sem gravar)", async () => {
    const logs = captureErrorLogs();
    let codigo = "003";
    mockFetch({
      "POST /auth": authOk,
      "GET /ConsultaNotaFiscal": () => json({ success: true, code: codigo, message: "Nota fiscal não gerada" }),
    });
    expect((await callRoute(notaFiscal, { documento: CPF })).body).toMatchObject({ ok: true, code: "NOTA_FISCAL_NAO_GERADA" });
    codigo = "002";
    expect((await callRoute(notaFiscal, { documento: CPF })).body).toMatchObject({ ok: true, code: "SEM_NOTA_FISCAL" });
    expect(logs).toHaveLength(0);
  });

  it("resposta inesperada → GFSIS_ERRO_CONSULTA e grava", async () => {
    const logs = captureErrorLogs();
    mockFetch({ "POST /auth": authOk, "GET /ConsultaNotaFiscal": () => json({ algo: "estranho" }) });
    const r = await callRoute(notaFiscal, { documento: CPF });
    expect(r.body).toMatchObject({ ok: false, code: "GFSIS_ERRO_CONSULTA" });
    expect(logs).toHaveLength(1);
    expect(logs[0]).toMatchObject({ gfsisEndpoint: "GET /ConsultaNotaFiscal" });
  });
});

describe("/boletos", () => {
  it("envia qtdBoletos e devolve links numerados", async () => {
    captureErrorLogs();
    const m = mockFetch({
      "POST /auth": authOk,
      "GET /ConsultaBoletosEmitidos": () =>
        json([
          { linkBoleto: "https://boleto.exemplo.com/1.pdf", dataVencimento: "20/09/2026", valor: 150.5 },
          { linkBoleto: "https://boleto.exemplo.com/2.pdf" },
        ]),
    });
    const r = await callRoute(boletos, { documento: CNPJ, qtdBoletos: "3" });
    const call = m.calls.find((c) => c.path === "/ConsultaBoletosEmitidos")!;
    expect(call.query.get("cnpj")).toBe(CNPJ);
    expect(call.query.get("qtdBoletos")).toBe("3");
    expect(r.body).toMatchObject({
      ok: true,
      code: "OK",
      data: {
        quantidade: 2,
        boleto1_link: "https://boleto.exemplo.com/1.pdf",
        boleto1_vencimento: "20/09/2026",
        boleto1_valor: "R$ 150,50",
        boleto2_link: "https://boleto.exemplo.com/2.pdf",
        boleto2_vencimento: "",
      },
    });
    expect(r.body.data.texto).toContain("1) Vencimento 20/09/2026 · R$ 150,50\nhttps://boleto.exemplo.com/1.pdf");
  });

  it("código 002 → SEM_BOLETOS (ok:true, sem gravar)", async () => {
    const logs = captureErrorLogs();
    const m = mockFetch({
      "POST /auth": authOk,
      "GET /ConsultaBoletosEmitidos": () => json({ success: true, code: "002", message: "Não existe boletos em aberto" }),
    });
    const r = await callRoute(boletos, { documento: CPF });
    expect(m.calls.find((c) => c.path === "/ConsultaBoletosEmitidos")!.query.get("qtdBoletos")).toBe("5");
    expect(r.body).toMatchObject({ ok: true, code: "SEM_BOLETOS", data: { possuiBoletos: false, quantidade: 0 } });
    expect(logs).toHaveLength(0);
  });
});

describe("/pedido/situacao", () => {
  const PEDIDO = {
    identificadorPedido: 12345,
    dataPedido: "15/08/2026",
    situacaoPedido: "Aprovado",
    produtoPedido: "Certificado Digital A1 - Pessoa Física",
    dataAprovacaoPedido: "16/08/2026 14:30:00",
    numeroSolicitacao: "SOL-2026-001",
    nomeUnidade: "Unidade Centro",
    nomeCliente: "João da Silva",
    documentoCliente: CPF,
    emailCliente: "joao@email.com",
  };

  it("pelo número: usa a unidade padrão e monta a mensagem", async () => {
    captureErrorLogs();
    const m = mockFetch({ "POST /auth": authOk, "GET /ConsultaPedidoVendaLTS": () => json(PEDIDO) });
    const r = await callRoute(pedido, { numeroPedido: "#12345", documento: CPF });
    const call = m.calls.find((c) => c.path === "/ConsultaPedidoVendaLTS")!;
    expect(call.query.get("identificadorPedido")).toBe("12345");
    expect(call.query.get("identificadorUnidade")).toBe("10");
    expect(r.body).toMatchObject({
      ok: true,
      code: "OK",
      data: { origem: "numero", numeroPedido: "12345", situacao: "Aprovado", dataAprovacao: "16/08/2026" },
    });
    expect(r.body.data.mensagemPedido).toContain("Situação: Aprovado");
    expect(JSON.stringify(r.body)).not.toContain("joao@email.com");
  });

  it("GFSIS_UNIDADE_ID tem prioridade sobre o ponto padrão", async () => {
    captureErrorLogs();
    process.env.GFSIS_UNIDADE_ID = "7";
    const m = mockFetch({ "POST /auth": authOk, "GET /ConsultaPedidoVendaLTS": () => json(PEDIDO) });
    await callRoute(pedido, { numeroPedido: "12345" });
    expect(m.calls.find((c) => c.path === "/ConsultaPedidoVendaLTS")!.query.get("identificadorUnidade")).toBe("7");
  });

  it("pedido de outro documento → PEDIDO_NAO_ENCONTRADO (não expõe dados)", async () => {
    captureErrorLogs();
    mockFetch({ "POST /auth": authOk, "GET /ConsultaPedidoVendaLTS": () => json(PEDIDO) });
    const r = await callRoute(pedido, { numeroPedido: "12345", documento: CNPJ });
    expect(r.body).toMatchObject({ ok: false, code: "PEDIDO_NAO_ENCONTRADO", data: {} });
    expect(JSON.stringify(r.body)).not.toContain("Aprovado");
  });

  it("código 002 → PEDIDO_NAO_ENCONTRADO sem gravar", async () => {
    const logs = captureErrorLogs();
    mockFetch({
      "POST /auth": authOk,
      "GET /ConsultaPedidoVendaLTS": () => json({ success: true, code: "002", message: "Pedido não encontrado." }),
    });
    const r = await callRoute(pedido, { numeroPedido: "999" });
    expect(r.body).toMatchObject({ ok: false, code: "PEDIDO_NAO_ENCONTRADO" });
    expect(logs).toHaveLength(0);
  });

  it("número inválido → PEDIDO_INVALIDO sem chamar o GFSIS", async () => {
    captureErrorLogs();
    const m = mockFetch({});
    const r = await callRoute(pedido, { numeroPedido: "abc" });
    expect(r.body).toMatchObject({ ok: false, code: "PEDIDO_INVALIDO" });
    expect(m.calls).toHaveLength(0);
  });

  it("só com documento → último pedido do cliente", async () => {
    captureErrorLogs();
    const m = mockFetch({
      "POST /auth": authOk,
      "GET /ConsultaUltimoPedidoCliente": () =>
        json({
          produto: "e-CNPJ A1",
          dataAprovacao: "10/09/2026",
          situacao: "Emitido",
          dataValidade: "10/09/2027",
          valorPedido: 199.9,
          identificador: 555,
          protocolo: "PRT-1",
          urlVideoconferencia: "",
        }),
    });
    const r = await callRoute(pedido, { documento: CNPJ, numeroPedido: "@User.Variables.numero_pedido" });
    expect(m.calls.find((c) => c.path === "/ConsultaUltimoPedidoCliente")!.query.get("cnpj")).toBe(CNPJ);
    expect(r.body).toMatchObject({
      ok: true,
      code: "OK",
      data: { origem: "ultimo_pedido", numeroPedido: "555", situacao: "Emitido", dataValidade: "10/09/2027", valor: "R$ 199,90" },
    });
  });

  it("cliente sem pedido → SEM_PEDIDO (ok:true)", async () => {
    const logs = captureErrorLogs();
    mockFetch({
      "POST /auth": authOk,
      "GET /ConsultaUltimoPedidoCliente": () => json({ status: "error", message: "Cliente não possui nenhum pedido" }, 500),
    });
    const r = await callRoute(pedido, { cpf: CPF });
    expect(r.body).toMatchObject({ ok: true, code: "SEM_PEDIDO" });
    expect(logs).toHaveLength(0);
  });

  it("sem número e sem documento → DADOS_INVALIDOS gravado", async () => {
    const logs = captureErrorLogs();
    mockFetch({});
    const r = await callRoute(pedido, {});
    expect(r.body).toMatchObject({ ok: false, code: "DADOS_INVALIDOS" });
    expect(logs).toHaveLength(1);
  });
});
