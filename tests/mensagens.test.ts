import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const query = vi.fn();
let dbConfigurado = true;
vi.mock("@/lib/db", () => ({ getSql: () => (dbConfigurado ? { query } : null) }));

const { __resetMensagensCache, carregarMensagens, filtrarPersonalizadas, msg, salvarMensagens, validarPersonalizadas } =
  await import("@/lib/mensagens");
const { interpolar, MENSAGENS, validarTexto } = await import("@/lib/mensagens-catalogo");
const { mensagemOpcoes } = await import("@/lib/horarios");
const { falhaDocumentoInvalido } = await import("@/lib/documento");
const { mapErroCadastroCliente } = await import("@/lib/errors");

const linha = (value: unknown) => [{ value, updated_at: "2026-11-07T12:00:00Z", updated_by: "admin@exemplo.com" }];

beforeEach(() => {
  dbConfigurado = true;
  query.mockReset();
  __resetMensagensCache();
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => vi.restoreAllMocks());

describe("catálogo", () => {
  it("todo padrão é válido e só usa as variáveis declaradas", () => {
    for (const chave of Object.keys(MENSAGENS) as Array<keyof typeof MENSAGENS>) {
      expect(validarTexto(chave, MENSAGENS[chave].padrao), chave).toBeNull();
    }
  });

  it("interpola variáveis e mantém as desconhecidas", () => {
    expect(interpolar("Olá, {nome}! {x}", { nome: "Maria" })).toBe("Olá, Maria! {x}");
  });

  it("valida vazio, tamanho e variáveis não permitidas", () => {
    expect(validarTexto("salvar.ok", "  ")).toMatch(/vazia/);
    expect(validarTexto("salvar.ok", "a".repeat(1001))).toMatch(/1000/);
    expect(validarTexto("salvar.ok", "Pronto, {nome}")).toMatch(/não aceita variáveis/);
    expect(validarTexto("consultar.encontrado_nome", "Oi {nome} {cpf}")).toMatch(/\{cpf\}.*Disponíveis: \{nome\}/);
  });
});

describe("leitura", () => {
  it("sem banco usa os textos padrão", async () => {
    dbConfigurado = false;
    await carregarMensagens();
    expect(msg("salvar.ok")).toBe("Cadastro atualizado com sucesso.");
    expect(mensagemOpcoes(3)).toBe("Encontrei 3 horários");
    expect(query).not.toHaveBeenCalled();
  });

  it("aplica personalizações salvas em todo lugar e guarda em cache", async () => {
    query.mockResolvedValue(
      linha({
        "horarios.encontrados": "Achei {quantidade} opções pra você",
        "documento.cnpj_invalido": "CNPJ inválido, confere?",
        "salvar.gfsis_003": "Você já é cliente!",
      }),
    );
    const r = await carregarMensagens();
    expect(r).toMatchObject({ origem: "banco", atualizadoPor: "admin@exemplo.com" });
    expect(mensagemOpcoes(4)).toBe("Achei 4 opções pra você");
    expect(mensagemOpcoes(1)).toBe("Encontrei 1 horário");
    expect(falhaDocumentoInvalido("cnpj").message).toBe("CNPJ inválido, confere?");
    expect(mapErroCadastroCliente([{ codigo: "003", mensagem: "" }])).toMatchObject({ ok: true, message: "Você já é cliente!" });
    await carregarMensagens();
    expect(query).toHaveBeenCalledTimes(1);
  });

  it("ignora chaves desconhecidas e textos inválidos no banco, sem afetar os demais", () => {
    expect(
      filtrarPersonalizadas({
        "nao.existe": "x",
        "salvar.ok": "",
        "consultar.encontrado_nome": "Oi {cpf}",
        "pedido.nenhum": "Nenhum pedido por aqui.",
        "boletos.nenhum": MENSAGENS["boletos.nenhum"].padrao,
      }),
    ).toEqual({ "pedido.nenhum": "Nenhum pedido por aqui." });
    expect(filtrarPersonalizadas(null)).toEqual({});
  });

  it("falha do banco não derruba: usa o padrão", async () => {
    query.mockRejectedValue(new Error("conexão recusada"));
    const r = await carregarMensagens();
    expect(r.origem).toBe("padrao");
    expect(msg("pedido.nenhum")).toBe("Não encontrei nenhum pedido no seu cadastro.");
  });
});

describe("gravação", () => {
  it("valida a entrada e descarta textos iguais ao padrão", () => {
    const v = validarPersonalizadas({ "salvar.ok": "Feito!", "pedido.nenhum": MENSAGENS["pedido.nenhum"].padrao });
    expect(v).toEqual({ ok: true, mensagens: { "salvar.ok": "Feito!" } });
    const e = validarPersonalizadas({ "salvar.ok": "", "x.y": "a" });
    expect(e.ok).toBe(false);
    if (!e.ok) expect(Object.keys(e.erros).sort()).toEqual(["salvar.ok", "x.y"]);
    expect(validarPersonalizadas(["a"]).ok).toBe(false);
  });

  it("salva no app_settings e passa a valer na hora", async () => {
    query.mockResolvedValueOnce([]).mockResolvedValueOnce([{ updated_at: "2026-11-07T13:00:00Z" }]);
    const r = await salvarMensagens({ "salvar.ok": "Feito!" }, "admin@exemplo.com");
    expect(r).toMatchObject({ origem: "banco", personalizadas: { "salvar.ok": "Feito!" } });
    const [sql, params] = query.mock.calls[1]!;
    expect(sql).toMatch(/INSERT INTO app_settings/);
    expect(params).toEqual(["mensagens", JSON.stringify({ "salvar.ok": "Feito!" }), "admin@exemplo.com"]);
    expect(msg("salvar.ok")).toBe("Feito!");
  });
});
