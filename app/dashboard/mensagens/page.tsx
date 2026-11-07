import { redirect } from "next/navigation";
import { getAdminEmail } from "@/lib/admin";
import { getSql } from "@/lib/db";
import { carregarMensagens } from "@/lib/mensagens";
import { MensagensForm } from "./MensagensForm";

export const dynamic = "force-dynamic";

export default async function MensagensPage() {
  if (!(await getAdminEmail())) redirect("/login");
  return <MensagensForm inicial={await carregarMensagens()} bancoConfigurado={!!getSql()} />;
}
