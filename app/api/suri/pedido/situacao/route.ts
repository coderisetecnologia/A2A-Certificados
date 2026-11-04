/**
 * Fluxo complementar — situação de um pedido.
 *
 * - Com `numeroPedido`: GET /ConsultaPedidoVendaLTS (precisa da unidade:
 *   `identificadorUnidade` no corpo, GFSIS_UNIDADE_ID ou o ponto padrão).
 *   Se o CPF/CNPJ também vier, o pedido só é mostrado quando pertence a ele
 *   (evita expor pedido de terceiros a quem só sabe o número).
 * - Só com CPF/CNPJ: GET /ConsultaUltimoPedidoCliente (último pedido do cliente).
 */
import { z } from "zod";
import { booleano, inteiroPositivo } from "@/lib/cliente";
import { dadosPedido, dadosUltimoPedido, falhaConsulta } from "@/lib/consultas";
import { documentoCampos, falhaDocumentoInvalido, resolverDocumento } from "@/lib/documento";
import { resolverUnidade } from "@/lib/env";
import { failure, success } from "@/lib/errors";
import { consultarSituacaoPedido, consultarUltimoPedido } from "@/lib/gfsis";
import { cleanText } from "@/lib/normalize";
import { suriHandler } from "@/lib/suri-handler";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({
  ...documentoCampos,
  numeroPedido: z.preprocess((v) => cleanText(v), z.string().max(40).optional()),
  identificadorUnidade: inteiroPositivo,
  considerarPedidosInternos: booleano,
});

const MSG_NAO_ENCONTRADO =
  "Não encontrei esse pedido. Pode conferir o número e enviar novamente? Se preferir, falo com um atendente.";

export const POST = suriHandler("/api/suri/pedido/situacao", schema, async (input, ctx) => {
  const temDocumento = !!(input.documento ?? input.cpf ?? input.cnpj);

  if (!input.numeroPedido && !temDocumento) {
    return failure("DADOS_INVALIDOS", "Preciso do número do pedido ou do seu CPF/CNPJ para consultar.", {
      campos: "numeroPedido,documento",
    }, {
      step: "validacao",
      errorCode: "PEDIDO_SEM_IDENTIFICACAO",
      message: "Nem numeroPedido nem documento/cpf/cnpj foram enviados",
    });
  }

  const doc = temDocumento ? resolverDocumento(input) : null;
  if (doc && !doc.ok) return doc.result;
  const documento = doc?.ok ? doc.documento : null;

  // 1. Pelo número do pedido.
  if (input.numeroPedido) {
    const digitos = input.numeroPedido.replace(/\D/g, "");
    const numero = Number(digitos);
    if (!digitos || digitos.length > 12 || !Number.isSafeInteger(numero) || numero < 1) {
      return failure("PEDIDO_INVALIDO", "Não entendi o número do pedido. Envie apenas os números, por favor.");
    }
    const unidade = resolverUnidade(input.identificadorUnidade);
    const r = await consultarSituacaoPedido(
      { identificadorPedido: numero, identificadorUnidade: unidade, considerarPedidosInternos: input.considerarPedidosInternos },
      ctx.budget,
    );
    if (r.status === "nao_encontrado") {
      ctx.log("pedido.nao_encontrado");
      return failure("PEDIDO_NAO_ENCONTRADO", MSG_NAO_ENCONTRADO);
    }
    if (r.status === "invalido") return falhaConsulta("consultar_pedido", "GET /ConsultaPedidoVendaLTS", r);

    if (documento && r.pedido.documentoCliente && r.pedido.documentoCliente !== documento.numero) {
      ctx.log("pedido.documento_divergente");
      return failure("PEDIDO_NAO_ENCONTRADO", MSG_NAO_ENCONTRADO);
    }
    ctx.log("pedido.encontrado", { origem: "numero" });
    const data = dadosPedido(r.pedido);
    return success(String(data.mensagemPedido), data);
  }

  // 2. Último pedido pelo CPF/CNPJ.
  const r = await consultarUltimoPedido(documento!, ctx.budget);
  switch (r.status) {
    case "ok": {
      ctx.log("pedido.encontrado", { origem: "ultimo_pedido" });
      const data = dadosUltimoPedido(r.pedido);
      return success(String(data.mensagemPedido), data);
    }
    case "sem_pedido":
      return success("Não encontrei nenhum pedido no seu cadastro.", { origem: "ultimo_pedido", numeroPedido: "" }, "SEM_PEDIDO");
    case "documento_invalido":
      return falhaDocumentoInvalido(documento!.tipo);
    case "invalido":
      return falhaConsulta("consultar_ultimo_pedido", "GET /ConsultaUltimoPedidoCliente", r);
  }
});
