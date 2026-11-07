/**
 * Etapa 3 — consulta se o cliente já existe no GFSIS, por CPF ou CNPJ.
 * Aceita `documento` (CPF ou CNPJ), `cpf` ou `cnpj` no corpo.
 * 404 do GFSIS NÃO é erro: vira encontrado:false.
 */
import { z } from "zod";
import { camposFaltantes, fromGfsis } from "@/lib/cliente";
import { documentoCampos, falhaDocumentoInvalido, resolverDocumento } from "@/lib/documento";
import { success } from "@/lib/errors";
import { consultarCliente } from "@/lib/gfsis";
import { maskEmail, maskTelefone } from "@/lib/mask";
import { primeiroNome } from "@/lib/normalize";
import { msg } from "@/lib/mensagens";
import { suriHandler } from "@/lib/suri-handler";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object(documentoCampos);

const ENDERECO = new Set(["cep", "logradouro", "bairro", "municipio", "uf"]);

function camposPlanos(faltantes: string[]) {
  return {
    cadastroCompleto: faltantes.length === 0,
    camposFaltantes: faltantes.join(","),
    faltaDataNascimento: faltantes.includes("dataNascimento"),
    faltaEmail: faltantes.includes("email"),
    faltaEndereco: faltantes.some((f) => ENDERECO.has(f)),
  };
}

export const POST = suriHandler("/api/suri/cliente/consultar", schema, async (input, ctx) => {
  const doc = resolverDocumento(input, { encontrado: false });
  if (!doc.ok) return doc.result;
  const { documento } = doc;
  const pessoaFisica = documento.tipo === "cpf";

  const r = await consultarCliente(documento, ctx.budget);

  if (r.status === "cpf_invalido") return falhaDocumentoInvalido(documento.tipo, { encontrado: false });

  if (r.status === "nao_encontrado") {
    ctx.log("cliente.nao_encontrado", { tipoDocumento: documento.tipo });
    return success(
      msg("consultar.nao_encontrado"),
      {
        encontrado: false,
        tipoDocumento: documento.tipo,
        pessoaFisica,
        nome: "",
        primeiroNome: "",
        emailMascarado: "",
        telefoneMascarado: "",
        ...camposPlanos(camposFaltantes({}, pessoaFisica)),
      },
      "CLIENTE_NAO_ENCONTRADO",
    );
  }

  const cliente = fromGfsis(r.cliente);
  const faltantes = camposFaltantes(cliente, pessoaFisica);
  // Para CNPJ, "primeiro nome" da razão social soa estranho: usa o nome completo.
  const nome = pessoaFisica ? primeiroNome(cliente.nome) : cliente.nome;
  ctx.log("cliente.encontrado", { tipoDocumento: documento.tipo, cadastroCompleto: faltantes.length === 0 });

  return success(nome ? msg("consultar.encontrado_nome", { nome }) : msg("consultar.encontrado"), {
    encontrado: true,
    tipoDocumento: documento.tipo,
    pessoaFisica,
    nome: cliente.nome,
    primeiroNome: nome,
    emailMascarado: maskEmail(cliente.email),
    telefoneMascarado: maskTelefone(cliente.telefone),
    ...camposPlanos(faltantes),
  });
});
