/** Leitura e gravação das mensagens personalizadas (página Mensagens). */
import { NextResponse, type NextRequest } from "next/server";
import { requireAdminApi, getAdminEmail } from "@/lib/admin";
import { getSql } from "@/lib/db";
import { logEvent } from "@/lib/log";
import { carregarMensagens, salvarMensagens, validarPersonalizadas } from "@/lib/mensagens";
import { MENSAGENS } from "@/lib/mensagens-catalogo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const negado = await requireAdminApi();
  if (negado) return negado;
  return NextResponse.json(
    { ok: true, catalogo: MENSAGENS, mensagens: await carregarMensagens(), bancoConfigurado: !!getSql() },
    { headers: { "cache-control": "no-store" } },
  );
}

/** Corpo: { mensagens: { "<chave>": "<texto>" } } — substitui todas as personalizações. */
export async function PUT(req: NextRequest) {
  const email = await getAdminEmail();
  if (!email) {
    return NextResponse.json({ ok: false, code: "NAO_AUTORIZADO", message: "Não autorizado" }, { status: 401 });
  }

  const body = (await req.json().catch(() => null)) as { mensagens?: unknown } | null;
  const v = validarPersonalizadas(body?.mensagens);
  if (!v.ok) {
    const message = Object.entries(v.erros)
      .slice(0, 5)
      .map(([chave, erro]) => `${chave}: ${erro}`)
      .join("; ");
    return NextResponse.json({ ok: false, code: "DADOS_INVALIDOS", message, erros: v.erros }, { status: 400 });
  }
  if (!getSql()) {
    return NextResponse.json(
      { ok: false, code: "CONFIGURACAO_INVALIDA", message: "Banco de dados não configurado (DATABASE_URL)." },
      { status: 503 },
    );
  }
  try {
    const mensagens = await salvarMensagens(v.mensagens, email);
    return NextResponse.json({ ok: true, mensagens });
  } catch (err) {
    logEvent("error", "admin.salvar_mensagens_falhou", { motivo: (err as Error).message });
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
