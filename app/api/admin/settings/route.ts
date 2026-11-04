/** Leitura e gravação das regras de negócio (página Configurações). */
import { NextResponse, type NextRequest } from "next/server";
import { getAdminEmail } from "@/lib/admin";
import { getSql } from "@/lib/db";
import { logEvent } from "@/lib/log";
import { getRegrasNegocio, regrasPadrao, regrasSchema, salvarRegrasNegocio } from "@/lib/settings";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const naoAutorizado = () =>
  NextResponse.json({ ok: false, code: "NAO_AUTORIZADO", message: "Não autorizado" }, { status: 401 });

export async function GET() {
  if (!(await getAdminEmail())) return naoAutorizado();
  return NextResponse.json(
    { ok: true, regras: await getRegrasNegocio(), padrao: regrasPadrao(), bancoConfigurado: !!getSql() },
    { headers: { "cache-control": "no-store" } },
  );
}

export async function PUT(req: NextRequest) {
  const email = await getAdminEmail();
  if (!email) return naoAutorizado();

  const parsed = regrasSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    const message = parsed.error.issues.map((i) => i.message).join("; ");
    return NextResponse.json({ ok: false, code: "DADOS_INVALIDOS", message }, { status: 400 });
  }
  if (!getSql()) {
    return NextResponse.json(
      { ok: false, code: "CONFIGURACAO_INVALIDA", message: "Banco de dados não configurado (DATABASE_URL)." },
      { status: 503 },
    );
  }
  try {
    const regras = await salvarRegrasNegocio(parsed.data, email);
    return NextResponse.json({ ok: true, regras });
  } catch (err) {
    logEvent("error", "admin.salvar_configuracoes_falhou", { motivo: (err as Error).message });
    const semTabela = /app_settings/.test((err as Error).message);
    return NextResponse.json(
      {
        ok: false,
        code: "ERRO_INTERNO",
        message: semTabela ? "Tabela app_settings não existe. Rode npm run db:migrate." : "Falha ao salvar no banco.",
      },
      { status: 500 },
    );
  }
}
