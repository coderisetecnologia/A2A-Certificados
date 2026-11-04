import { redirect } from "next/navigation";
import { getAdminEmail } from "@/lib/admin";
import { getSql } from "@/lib/db";
import { FUSOS_BRASIL, getRegrasNegocio, regrasPadrao } from "@/lib/settings";
import { ConfiguracoesForm } from "./ConfiguracoesForm";

export const dynamic = "force-dynamic";

export default async function ConfiguracoesPage() {
  if (!(await getAdminEmail())) redirect("/login");
  const regras = await getRegrasNegocio();
  return (
    <ConfiguracoesForm
      inicial={regras}
      padrao={regrasPadrao()}
      fusos={[...FUSOS_BRASIL]}
      bancoConfigurado={!!getSql()}
    />
  );
}
