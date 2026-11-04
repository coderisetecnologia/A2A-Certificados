/**
 * Formatação das consultas complementares (próximo agendamento, nota fiscal,
 * boletos e pedidos) em campos planos e textos prontos para o WhatsApp.
 */
import { failure, type HandlerResult } from "./errors";
import type { AgendamentoInfo, BoletoInfo, ConsultaInvalida, NotaFiscalInfo, PedidoInfo, UltimoPedidoInfo } from "./gfsis";
import { normalizeData } from "./normalize";
import { formatDataBr, formatDataCurta } from "./time";

/** Resposta inesperada do GFSIS numa consulta: mensagem amigável + gravação em error_logs. */
export function falhaConsulta(
  step: string,
  gfsisEndpoint: string,
  r: ConsultaInvalida,
  message = "Não consegui fazer essa consulta agora. Vou encaminhar você para um atendente.",
): HandlerResult {
  return failure("GFSIS_ERRO_CONSULTA", message, {}, {
    step,
    gfsisEndpoint,
    httpStatus: r.httpStatus,
    errorCode: "GFSIS_RESPOSTA_INESPERADA",
    message: r.mensagem,
    responseSnippet: r.text,
  });
}

/** Máximo de itens numerados devolvidos (respostas com um dígito, como em /horarios). */
export const MAX_ITENS = 9;

/** Data do GFSIS (dd/MM/yyyy, yyyy-MM-dd, com ou sem hora) → "dd/MM/yyyy"; mantém o texto se não reconhecer. */
export function dataLegivel(v: string | null | undefined): string {
  if (!v) return "";
  const iso = normalizeData(v);
  return iso ? formatDataBr(iso) : v;
}

export function formatBrl(v: number | null): string {
  if (v === null) return "";
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v).replace(/ /g, " ");
}

// ─── Próximo agendamento ───────────────────────────────────────────────────

export function dadosProximoAgendamento(ag: AgendamentoInfo & { data: string }): Record<string, unknown> {
  const horario = ag.horario ?? "";
  const quando = `${formatDataCurta(ag.data)}${horario ? `, às ${horario}` : ""}`;
  return {
    possuiAgendamento: true,
    idAgendamento: ag.id ?? "",
    data: ag.data,
    dataFormatada: formatDataCurta(ag.data),
    dataCompleta: formatDataBr(ag.data),
    horario,
    mensagemAgendamento: `📅 Seu próximo agendamento é ${quando}.`,
  };
}

export const SEM_AGENDAMENTO_DATA = {
  possuiAgendamento: false,
  idAgendamento: "",
  data: "",
  dataFormatada: "",
  dataCompleta: "",
  horario: "",
  mensagemAgendamento: "",
};

// ─── Nota fiscal ───────────────────────────────────────────────────────────

export function dadosNotasFiscais(notas: NotaFiscalInfo[]): Record<string, unknown> {
  const lista = notas.slice(0, MAX_ITENS);
  const flat: Record<string, unknown> = {};
  lista.forEach((n, i) => {
    flat[`nota${i + 1}_link`] = n.link;
    flat[`nota${i + 1}_numero`] = n.numero;
  });
  const linhas = lista.map((n, i) => {
    const desc = [n.tipo && `Nota ${n.tipo}`, n.numero && `nº ${n.numero}`, n.dataEmissao && `emitida em ${dataLegivel(n.dataEmissao)}`]
      .filter(Boolean)
      .join(" · ");
    return lista.length === 1 ? (desc ? `${desc}\n${n.link}` : n.link) : `${i + 1}) ${desc ? `${desc}\n` : ""}${n.link}`;
  });
  const titulo = lista.length === 1 ? "🧾 Aqui está a sua nota fiscal:" : `🧾 Encontrei ${lista.length} notas fiscais:`;
  return {
    possuiNota: true,
    quantidade: lista.length,
    texto: `${titulo}\n\n${linhas.join("\n\n")}`,
    ...flat,
    notas: lista,
  };
}

export const SEM_NOTA_DATA = { possuiNota: false, quantidade: 0, texto: "" };

// ─── Boletos ───────────────────────────────────────────────────────────────

export function dadosBoletos(boletos: BoletoInfo[]): Record<string, unknown> {
  const lista = boletos.slice(0, MAX_ITENS);
  const flat: Record<string, unknown> = {};
  lista.forEach((b, i) => {
    const n = i + 1;
    flat[`boleto${n}_link`] = b.link;
    flat[`boleto${n}_vencimento`] = b.vencimento ? formatDataBr(b.vencimento) : "";
    flat[`boleto${n}_valor`] = formatBrl(b.valor);
    flat[`boleto${n}_linhaDigitavel`] = b.linhaDigitavel;
  });
  const linhas = lista.map((b, i) => {
    const desc = [b.vencimento && `Vencimento ${formatDataBr(b.vencimento)}`, b.valor !== null && formatBrl(b.valor)]
      .filter(Boolean)
      .join(" · ");
    const prefixo = lista.length === 1 ? "" : `${i + 1}) `;
    return `${prefixo}${desc ? `${desc}\n` : ""}${b.link}`;
  });
  const titulo = lista.length === 1 ? "💳 Você tem 1 boleto em aberto:" : `💳 Você tem ${lista.length} boletos em aberto:`;
  return {
    possuiBoletos: true,
    quantidade: lista.length,
    texto: `${titulo}\n\n${linhas.join("\n\n")}`,
    ...flat,
    boletos: lista.map((b) => ({ ...b, vencimento: b.vencimento ? formatDataBr(b.vencimento) : "", valorFormatado: formatBrl(b.valor) })),
  };
}

export const SEM_BOLETOS_DATA = { possuiBoletos: false, quantidade: 0, texto: "" };

// ─── Pedidos ───────────────────────────────────────────────────────────────

/** Situação de um pedido consultado pelo número. */
export function dadosPedido(p: PedidoInfo): Record<string, unknown> {
  const linhas = [
    `📦 Pedido ${p.numero}`,
    p.produto && `Produto: ${p.produto}`,
    p.situacao && `Situação: ${p.situacao}`,
    p.dataPedido && `Data do pedido: ${dataLegivel(p.dataPedido)}`,
    p.dataAprovacao && `Aprovado em: ${dataLegivel(p.dataAprovacao)}`,
  ].filter(Boolean);
  return {
    origem: "numero",
    numeroPedido: p.numero,
    situacao: p.situacao,
    produto: p.produto,
    dataPedido: dataLegivel(p.dataPedido),
    dataAprovacao: dataLegivel(p.dataAprovacao),
    dataValidade: "",
    numeroSolicitacao: p.numeroSolicitacao,
    protocolo: "",
    unidade: p.nomeUnidade,
    urlVideoconferencia: "",
    mensagemPedido: linhas.join("\n"),
  };
}

/** Último pedido do cliente, consultado pelo CPF/CNPJ. */
export function dadosUltimoPedido(p: UltimoPedidoInfo): Record<string, unknown> {
  const linhas = [
    p.numero ? `📦 Seu último pedido: ${p.numero}` : "📦 Seu último pedido",
    p.produto && `Produto: ${p.produto}`,
    p.situacao && `Situação: ${p.situacao}`,
    p.dataAprovacao && `Aprovado em: ${dataLegivel(p.dataAprovacao)}`,
    p.dataValidade && `Validade do certificado: ${dataLegivel(p.dataValidade)}`,
    p.protocolo && `Protocolo: ${p.protocolo}`,
  ].filter(Boolean);
  return {
    origem: "ultimo_pedido",
    numeroPedido: p.numero,
    situacao: p.situacao,
    produto: p.produto,
    dataPedido: "",
    dataAprovacao: dataLegivel(p.dataAprovacao),
    dataValidade: dataLegivel(p.dataValidade),
    numeroSolicitacao: "",
    protocolo: p.protocolo,
    unidade: "",
    valor: formatBrl(p.valor),
    urlVideoconferencia: p.urlVideoconferencia,
    mensagemPedido: linhas.join("\n"),
  };
}
