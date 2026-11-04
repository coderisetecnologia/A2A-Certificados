import { redirect } from "next/navigation";
import { getAdminEmail } from "@/lib/admin";
import { ConfigError, pontoAtendimentoPadrao, suriApiKey } from "@/lib/env";
import { Testes } from "./Testes";

export const dynamic = "force-dynamic";

export default async function TestesPage() {
  if (!(await getAdminEmail())) redirect("/login");
  let ponto: number | null = null;
  let pontoErro: string | null = null;
  try {
    ponto = pontoAtendimentoPadrao();
  } catch (e) {
    if (e instanceof ConfigError) pontoErro = e.message;
    else throw e;
  }
  return <Testes pontoPadrao={ponto} pontoErro={pontoErro} chaveConfigurada={!!suriApiKey()} />;
}
