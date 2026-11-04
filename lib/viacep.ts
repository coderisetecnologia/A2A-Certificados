import type { Budget } from "./budget";
import { normalizeCep } from "./normalize";

export interface EnderecoViaCep {
  cep: string;
  logradouro: string;
  bairro: string;
  municipio: string;
  uf: string;
  codigoIbge: string;
}

export type ViaCepResult =
  | { status: "ok"; endereco: EnderecoViaCep }
  | { status: "nao_encontrado" }
  | { status: "falha"; motivo: string };

const VIACEP_TIMEOUT_MS = 3_000;

/** Consulta https://viacep.com.br/ws/{cep}/json/ respeitando o orçamento de tempo. */
export async function buscarCep(cepInput: string, budget: Budget): Promise<ViaCepResult> {
  const cep = normalizeCep(cepInput);
  if (cep.length !== 8) return { status: "nao_encontrado" };
  const timeout = budget.timeoutFor(VIACEP_TIMEOUT_MS);
  if (timeout < 300) return { status: "falha", motivo: "sem orçamento de tempo" };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    const res = await fetch(`https://viacep.com.br/ws/${cep}/json/`, {
      signal: controller.signal,
      headers: { Accept: "application/json" },
      cache: "no-store",
    });
    if (res.status === 400) return { status: "nao_encontrado" };
    if (!res.ok) return { status: "falha", motivo: `HTTP ${res.status}` };
    const data = (await res.json()) as Record<string, unknown>;
    if (data.erro === true || data.erro === "true") return { status: "nao_encontrado" };
    return {
      status: "ok",
      endereco: {
        cep,
        logradouro: String(data.logradouro ?? "").trim(),
        bairro: String(data.bairro ?? "").trim(),
        municipio: String(data.localidade ?? "").trim(),
        uf: String(data.uf ?? "").trim().toUpperCase(),
        codigoIbge: String(data.ibge ?? "").trim(),
      },
    };
  } catch (err) {
    return { status: "falha", motivo: controller.signal.aborted ? "timeout" : (err as Error).message };
  } finally {
    clearTimeout(timer);
  }
}
