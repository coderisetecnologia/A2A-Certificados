/**
 * Fluxo complementar — próximo agendamento do cliente (CPF ou CNPJ).
 * Sem agendamento futuro NÃO é erro: ok:true com code SEM_AGENDAMENTO.
 */
import { z } from "zod";
import { dadosProximoAgendamento, SEM_AGENDAMENTO_DATA } from "@/lib/consultas";
import { documentoCampos, resolverDocumento } from "@/lib/documento";
import { success } from "@/lib/errors";
import { consultarProximoAgendamento } from "@/lib/gfsis";
import { suriHandler } from "@/lib/suri-handler";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object(documentoCampos);

export const POST = suriHandler("/api/suri/agendamento/proximo", schema, async (input, ctx) => {
  const doc = resolverDocumento(input, SEM_AGENDAMENTO_DATA);
  if (!doc.ok) return doc.result;

  const ag = await consultarProximoAgendamento(doc.documento, ctx.budget);
  if (!ag?.data) {
    ctx.log("agendamento.proximo_nenhum", { tipoDocumento: doc.documento.tipo });
    return success(
      "Não encontrei nenhum agendamento futuro no seu cadastro. Quer agendar um horário?",
      SEM_AGENDAMENTO_DATA,
      "SEM_AGENDAMENTO",
    );
  }

  ctx.log("agendamento.proximo_encontrado", { tipoDocumento: doc.documento.tipo });
  const data = dadosProximoAgendamento({ ...ag, data: ag.data });
  return success(String(data.mensagemAgendamento), data);
});
