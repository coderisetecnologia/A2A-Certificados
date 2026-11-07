/**
 * Fluxo complementar — notas fiscais do cliente (CPF ou CNPJ).
 * "Não existe nota" e "nota ainda não gerada" NÃO são erros: ok:true com
 * SEM_NOTA_FISCAL / NOTA_FISCAL_NAO_GERADA.
 */
import { z } from "zod";
import { dadosNotasFiscais, falhaConsulta, SEM_NOTA_DATA } from "@/lib/consultas";
import { documentoCampos, falhaDocumentoInvalido, resolverDocumento } from "@/lib/documento";
import { success } from "@/lib/errors";
import { consultarNotasFiscais } from "@/lib/gfsis";
import { msg } from "@/lib/mensagens";
import { suriHandler } from "@/lib/suri-handler";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object(documentoCampos);

export const POST = suriHandler("/api/suri/nota-fiscal", schema, async (input, ctx) => {
  const doc = resolverDocumento(input, SEM_NOTA_DATA);
  if (!doc.ok) return doc.result;

  const r = await consultarNotasFiscais(doc.documento, ctx.budget);
  switch (r.status) {
    case "ok": {
      ctx.log("nota_fiscal.encontrada", { quantidade: r.notas.length });
      const data = dadosNotasFiscais(r.notas);
      return success(String(data.texto), data);
    }
    case "nao_gerada":
      return success(
        msg("nota.nao_gerada"),
        SEM_NOTA_DATA,
        "NOTA_FISCAL_NAO_GERADA",
      );
    case "sem_nota":
      return success(msg("nota.nenhuma"), SEM_NOTA_DATA, "SEM_NOTA_FISCAL");
    case "documento_invalido":
      return falhaDocumentoInvalido(doc.documento.tipo, SEM_NOTA_DATA);
    case "invalido":
      return falhaConsulta("consultar_nota_fiscal", "GET /ConsultaNotaFiscal", r);
  }
});
