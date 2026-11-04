import { formatDataBr, formatDataCurta } from "./time";

export function localAtendimento(videoconferencia: boolean): string {
  return videoconferencia ? "Online (link será enviado por e-mail)" : "Presencial";
}

export function mensagemConfirmacao(data: string, horario: string, videoconferencia: boolean): string {
  return [
    "✅ Agendamento confirmado!",
    `📅 Data: ${formatDataCurta(data)}`,
    `⏰ Horário: ${horario}`,
    `📍 Local: ${localAtendimento(videoconferencia)}`,
  ].join("\n");
}

/** Campos planos devolvidos à Suri após agendar (ou quando já agendado). */
export function dadosConfirmacao(params: {
  idAgendamento: string | null;
  data: string;
  horario: string;
  videoconferencia: boolean;
  emailMascarado: string;
}): Record<string, unknown> {
  return {
    idAgendamento: params.idAgendamento ?? "",
    data: params.data,
    dataFormatada: formatDataCurta(params.data),
    dataCompleta: formatDataBr(params.data),
    horario: params.horario,
    videoconferencia: params.videoconferencia,
    local: localAtendimento(params.videoconferencia),
    emailMascarado: params.emailMascarado,
    mensagemConfirmacao: mensagemConfirmacao(params.data, params.horario, params.videoconferencia),
  };
}

export function mesmoAgendamento(
  a: { data: string | null; horario: string | null } | null,
  data: string,
  horario: string,
): boolean {
  return !!a && a.data === data && a.horario === horario;
}
