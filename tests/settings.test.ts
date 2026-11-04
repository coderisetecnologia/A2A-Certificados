import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const query = vi.fn();
let dbConfigurado = true;
vi.mock("@/lib/db", () => ({ getSql: () => (dbConfigurado ? { query } : null) }));

const { __resetRegrasCache, getRegrasNegocio, regrasSchema, resolverRegras, salvarRegrasNegocio } = await import(
  "@/lib/settings"
);

const PADRAO = { tzNegocio: "America/Fortaleza", diasAtendimento: [1, 2, 3, 4, 5], antecedenciaMinimaMinutos: 30 };

beforeEach(() => {
  process.env.TZ_NEGOCIO = "America/Fortaleza";
  process.env.DIAS_ATENDIMENTO = "1,2,3,4,5";
  process.env.ANTECEDENCIA_MINIMA_MINUTOS = "30";
  dbConfigurado = true;
  query.mockReset();
  __resetRegrasCache();
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => vi.restoreAllMocks());

describe("validação das regras", () => {
  it("aceita regras válidas, remove dias duplicados e ordena", () => {
    const r = regrasSchema.parse({ tzNegocio: "America/Sao_Paulo", diasAtendimento: [5, 1, 1, 6], antecedenciaMinimaMinutos: 0 });
    expect(r.diasAtendimento).toEqual([1, 5, 6]);
  });

  it("rejeita fuso inválido, nenhum dia e antecedência fora da faixa", () => {
    expect(regrasSchema.safeParse({ ...PADRAO, tzNegocio: "Marte/Olimpo" }).success).toBe(false);
    expect(regrasSchema.safeParse({ ...PADRAO, diasAtendimento: [] }).success).toBe(false);
    expect(regrasSchema.safeParse({ ...PADRAO, diasAtendimento: [7] }).success).toBe(false);
    expect(regrasSchema.safeParse({ ...PADRAO, antecedenciaMinimaMinutos: -1 }).success).toBe(false);
    expect(regrasSchema.safeParse({ ...PADRAO, antecedenciaMinimaMinutos: 1441 }).success).toBe(false);
  });

  it("valor salvo inválido cai no padrão só no campo afetado", () => {
    expect(resolverRegras({ tzNegocio: "invalido", diasAtendimento: [1, 2, 3, 4, 5, 6], antecedenciaMinimaMinutos: 60 }, PADRAO)).toEqual({
      tzNegocio: "America/Fortaleza",
      diasAtendimento: [1, 2, 3, 4, 5, 6],
      antecedenciaMinimaMinutos: 60,
    });
    expect(resolverRegras(null, PADRAO)).toEqual(PADRAO);
  });
});

describe("leitura das regras", () => {
  it("sem banco configurado usa as variáveis de ambiente", async () => {
    dbConfigurado = false;
    process.env.DIAS_ATENDIMENTO = "1,2,3,4,5,6";
    const r = await getRegrasNegocio();
    expect(r).toMatchObject({ origem: "padrao", diasAtendimento: [1, 2, 3, 4, 5, 6] });
    expect(query).not.toHaveBeenCalled();
  });

  it("usa o valor salvo no painel e guarda em cache", async () => {
    query.mockResolvedValue([
      {
        value: { tzNegocio: "America/Manaus", diasAtendimento: [1, 3, 5], antecedenciaMinimaMinutos: 60 },
        updated_at: "2026-11-03T12:00:00Z",
        updated_by: "coderisetecnologia@gmail.com",
      },
    ]);
    const r = await getRegrasNegocio();
    expect(r).toMatchObject({
      origem: "banco",
      tzNegocio: "America/Manaus",
      diasAtendimento: [1, 3, 5],
      antecedenciaMinimaMinutos: 60,
      atualizadoPor: "coderisetecnologia@gmail.com",
    });
    await getRegrasNegocio();
    expect(query).toHaveBeenCalledTimes(1);
  });

  it("nada salvo ainda → padrão", async () => {
    query.mockResolvedValue([]);
    expect(await getRegrasNegocio()).toMatchObject({ origem: "padrao", ...PADRAO });
  });

  it("falha do banco nunca derruba: usa o padrão", async () => {
    query.mockRejectedValue(new Error("connection refused"));
    expect(await getRegrasNegocio()).toMatchObject({ origem: "padrao", ...PADRAO });
  });

  it("ao salvar, atualiza o cache imediatamente", async () => {
    query.mockResolvedValueOnce([]); // leitura do valor anterior
    query.mockResolvedValueOnce([{ updated_at: "2026-11-03T12:00:00Z" }]); // upsert
    const novas = { tzNegocio: "America/Sao_Paulo", diasAtendimento: [1, 2, 3, 4, 5, 6], antecedenciaMinimaMinutos: 15 };
    await salvarRegrasNegocio(novas, "coderisetecnologia@gmail.com");
    const upsert = query.mock.calls[1]!;
    expect(upsert[0]).toContain("ON CONFLICT (key) DO UPDATE");
    expect(JSON.parse(upsert[1][1])).toEqual(novas);
    expect(await getRegrasNegocio()).toMatchObject({ origem: "banco", ...novas });
    expect(query).toHaveBeenCalledTimes(2);
  });
});
