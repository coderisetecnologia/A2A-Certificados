/**
 * "Testar conexão com o GFSIS": força autenticação e consulta a agenda do
 * próximo dia de atendimento. Não devolve dados do GFSIS, só sucesso/falha.
 */
import { NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/admin";
import { Budget } from "@/lib/budget";
import { ConfigError, suriTimeoutMs } from "@/lib/env";
import { getRegrasNegocio } from "@/lib/settings";
import { GfsisError, testarConexao } from "@/lib/gfsis";
import { logEvent } from "@/lib/log";
import { addDays, nowInTz, proximosDiasAtendimento } from "@/lib/time";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  const denied = await requireAdminApi();
  if (denied) return denied;

  const regras = await getRegrasNegocio();
  const hoje = nowInTz(regras.tzNegocio).date;
  const data = proximosDiasAtendimento(addDays(hoje, 1), 1, new Set(regras.diasAtendimento))[0] ?? addDays(hoje, 1);
  try {
    const r = await testarConexao(new Budget(suriTimeoutMs()), data);
    const ok = r.status === "ok";
    const mensagens: Record<string, string> = {
      ok: "Conexão OK: autenticação e consulta de agenda funcionando.",
      ponto_nao_encontrado: "Autenticação OK, mas o ponto de atendimento configurado não foi encontrado.",
      invalido: "Autenticação OK, mas a consulta de agenda foi recusada pelo GFSIS.",
    };
    return NextResponse.json({
      ok,
      message: mensagens[r.status] ?? "Resultado inesperado",
      authMs: r.authMs,
      consultaMs: r.consultaMs,
      dataConsultada: data,
    });
  } catch (err) {
    let message = "Falha inesperada ao testar a conexão.";
    if (err instanceof ConfigError) message = `Configuração incompleta: ${err.message}`;
    else if (err instanceof GfsisError) {
      message =
        err.kind === "auth"
          ? "Falha de autenticação: verifique GFSIS_USER/GFSIS_PASSWORD (usuário integração)."
          : err.kind === "timeout"
            ? "O GFSIS não respondeu a tempo."
            : `GFSIS indisponível (${err.kind}${err.status ? ` ${err.status}` : ""}).`;
    }
    logEvent("warn", "admin.teste_gfsis_falhou", { motivo: (err as Error).message });
    return NextResponse.json({ ok: false, message });
  }
}
