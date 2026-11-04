import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getAdminEmail } from "@/lib/admin";
import { ConfigError, pontoAtendimentoPadrao, suriApiKey } from "@/lib/env";
import { Implantacao } from "./Implantacao";

export const dynamic = "force-dynamic";

export default async function ImplantacaoPage() {
  if (!(await getAdminEmail())) redirect("/login");

  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "SEU-DOMINIO.vercel.app";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");

  const key = suriApiKey();
  let ponto: number | null = null;
  try {
    ponto = pontoAtendimentoPadrao();
  } catch (e) {
    if (!(e instanceof ConfigError)) throw e;
  }

  return (
    <Implantacao
      baseUrl={`${proto}://${host}/api/suri`}
      chaveDica={key ? `${key.slice(0, 4)}••••${key.slice(-4)}` : null}
      pontoPadrao={ponto}
      local={host.startsWith("localhost") || host.startsWith("127.")}
    />
  );
}
