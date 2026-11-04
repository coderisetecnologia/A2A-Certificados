/**
 * Etapa 3 — consulta se o cliente já existe no GFSIS (por CPF).
 * 404 do GFSIS NÃO é erro: vira encontrado:false.
 */
import { z } from "zod";
import { camposFaltantes, fromGfsis, textoObrigatorio } from "@/lib/cliente";
import { isValidCpf, normalizeCpf } from "@/lib/cpf";
import { failure, success } from "@/lib/errors";
import { consultarCliente } from "@/lib/gfsis";
import { maskEmail, maskTelefone } from "@/lib/mask";
import { primeiroNome } from "@/lib/normalize";
import { suriHandler } from "@/lib/suri-handler";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({ cpf: textoObrigatorio("cpf") });

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

export const POST = suriHandler("/api/suri/cliente/consultar", schema, async ({ cpf }, ctx) => {
  const digits = normalizeCpf(cpf);
  if (!isValidCpf(digits)) {
    return failure("CPF_INVALIDO", "O CPF informado não é válido. Pode conferir e enviar novamente?", {
      encontrado: false,
    });
  }

  const r = await consultarCliente(digits, ctx.budget);

  if (r.status === "cpf_invalido") {
    return failure("CPF_INVALIDO", "O CPF informado não é válido. Pode conferir e enviar novamente?", {
      encontrado: false,
    });
  }

  if (r.status === "nao_encontrado") {
    ctx.log("cliente.nao_encontrado");
    return success(
      "Cliente não encontrado no cadastro.",
      {
        encontrado: false,
        nome: "",
        primeiroNome: "",
        emailMascarado: "",
        telefoneMascarado: "",
        ...camposPlanos(camposFaltantes({})),
      },
      "CLIENTE_NAO_ENCONTRADO",
    );
  }

  const cliente = fromGfsis(r.cliente);
  const pessoaFisica = !r.cliente.cnpj || !!r.cliente.cpf;
  const faltantes = camposFaltantes(cliente, pessoaFisica);
  const nome = primeiroNome(cliente.nome);
  ctx.log("cliente.encontrado", { cadastroCompleto: faltantes.length === 0 });

  return success(nome ? `Encontrei seu cadastro, ${nome}!` : "Encontrei seu cadastro!", {
    encontrado: true,
    nome: cliente.nome,
    primeiroNome: nome,
    emailMascarado: maskEmail(cliente.email),
    telefoneMascarado: maskTelefone(cliente.telefone),
    ...camposPlanos(faltantes),
  });
});
