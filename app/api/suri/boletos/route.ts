/**
 * Fluxo complementar — boletos emitidos e em aberto do cliente (CPF ou CNPJ).
 * Sem boletos em aberto NÃO é erro: ok:true com code SEM_BOLETOS.
 */
import { z } from "zod";
import { inteiroPositivo } from "@/lib/cliente";
import { dadosBoletos, falhaConsulta, MAX_ITENS, SEM_BOLETOS_DATA } from "@/lib/consultas";
import { documentoCampos, falhaDocumentoInvalido, resolverDocumento } from "@/lib/documento";
import { success } from "@/lib/errors";
import { consultarBoletosAbertos } from "@/lib/gfsis";
import { msg } from "@/lib/mensagens";
import { suriHandler } from "@/lib/suri-handler";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const QTD_PADRAO = 5;

const schema = z.object({ ...documentoCampos, qtdBoletos: inteiroPositivo });

export const POST = suriHandler("/api/suri/boletos", schema, async (input, ctx) => {
  const doc = resolverDocumento(input, SEM_BOLETOS_DATA);
  if (!doc.ok) return doc.result;
  const qtd = Math.min(input.qtdBoletos ?? QTD_PADRAO, MAX_ITENS);

  const r = await consultarBoletosAbertos(doc.documento, qtd, ctx.budget);
  switch (r.status) {
    case "ok": {
      ctx.log("boletos.encontrados", { quantidade: r.boletos.length });
      const data = dadosBoletos(r.boletos.slice(0, qtd));
      return success(String(data.texto), data);
    }
    case "sem_boletos":
      return success(msg("boletos.nenhum"), SEM_BOLETOS_DATA, "SEM_BOLETOS");
    case "documento_invalido":
      return falhaDocumentoInvalido(doc.documento.tipo, SEM_BOLETOS_DATA);
    case "invalido":
      return falhaConsulta("consultar_boletos", "GET /ConsultaBoletosEmitidos", r);
  }
});
