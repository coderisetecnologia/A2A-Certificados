/**
 * Catálogo das mensagens devolvidas à Suri no campo `message` (e textos que
 * a compõem). O `padrao` é o texto original; o painel (página Mensagens)
 * pode sobrescrever qualquer uma — ver lib/mensagens.ts.
 *
 * Variáveis entre chaves (ex.: {nome}) são trocadas pelo valor na hora da
 * resposta. Só as listadas em `variaveis` são aceitas para cada mensagem.
 *
 * Arquivo sem dependências de servidor: pode ser importado pelo painel.
 */

export interface DefinicaoMensagem {
  grupo: string;
  descricao: string;
  padrao: string;
  variaveis?: readonly string[];
}

const G = {
  geral: "Geral (todas as rotas)",
  documento: "CPF / CNPJ",
  cliente: "Validação de dados do cliente",
  consultar: "/cliente/consultar",
  salvar: "/cliente/salvar",
  horarios: "/horarios",
  agendar: "/agendar",
  proximo: "/agendamento/proximo",
  nota: "/nota-fiscal",
  boletos: "/boletos",
  pedido: "/pedido/situacao",
} as const;

export const MENSAGENS = {
  // ─── Geral ──────────────────────────────────────────────────────────────
  "geral.nao_autorizado": { grupo: G.geral, descricao: "x-api-key ausente ou inválida (HTTP 401).", padrao: "API key inválida." },
  "geral.json_invalido": {
    grupo: G.geral,
    descricao: "Corpo da requisição não é um JSON válido.",
    padrao: "Requisição inválida: corpo JSON malformado.",
  },
  "geral.dados_invalidos": {
    grupo: G.geral,
    descricao: "Campos obrigatórios ausentes ou em formato errado.",
    padrao: "Alguns dados obrigatórios não foram enviados corretamente.",
  },
  "geral.gfsis_indisponivel": {
    grupo: G.geral,
    descricao: "GFSIS fora do ar, lento ou tempo da requisição esgotado.",
    padrao: "Nosso sistema de agendamento está instável no momento. Vou encaminhar você para um atendente.",
  },
  "geral.consulta_falhou": {
    grupo: G.geral,
    descricao: "Resposta inesperada do GFSIS em consultas (nota fiscal, boletos, pedidos).",
    padrao: "Não consegui fazer essa consulta agora. Vou encaminhar você para um atendente.",
  },
  "geral.configuracao_invalida": {
    grupo: G.geral,
    descricao: "Variável de ambiente ausente/errada no servidor (HTTP 500).",
    padrao: "Erro de configuração do servidor.",
  },
  "geral.erro_interno": {
    grupo: G.geral,
    descricao: "Erro inesperado no servidor (HTTP 500).",
    padrao: "Ocorreu um erro inesperado. Vou encaminhar você para um atendente.",
  },
  "geral.health": { grupo: G.geral, descricao: "GET /health.", padrao: "API Suri x GFSIS no ar" },

  // ─── Documento ──────────────────────────────────────────────────────────
  "documento.ausente": {
    grupo: G.documento,
    descricao: "Nenhum CPF/CNPJ foi enviado.",
    padrao: "Preciso do seu CPF ou CNPJ para continuar.",
  },
  "documento.cpf_invalido": {
    grupo: G.documento,
    descricao: "CPF com dígitos verificadores inválidos.",
    padrao: "O CPF informado não é válido. Pode conferir e enviar novamente?",
  },
  "documento.cnpj_invalido": {
    grupo: G.documento,
    descricao: "CNPJ com dígitos verificadores inválidos.",
    padrao: "O CNPJ informado não é válido. Pode conferir e enviar novamente?",
  },
  "documento.invalido": {
    grupo: G.documento,
    descricao: "Documento que não é nem CPF nem CNPJ.",
    padrao: "O CPF ou CNPJ informado não é válido. Pode conferir e enviar novamente?",
  },

  // ─── Validação do cliente (salvar e agendar) ────────────────────────────
  "cliente.email_invalido": {
    grupo: G.cliente,
    descricao: "E-mail em formato inválido.",
    padrao: "O e-mail informado parece inválido. Pode enviar novamente?",
  },
  "cliente.telefone_invalido": {
    grupo: G.cliente,
    descricao: "Telefone sem DDD ou com tamanho errado.",
    padrao: "O telefone informado parece inválido. Pode enviar novamente com DDD?",
  },
  "cliente.data_nascimento_invalida": {
    grupo: G.cliente,
    descricao: "Data de nascimento inválida, futura ou muito antiga.",
    padrao: "A data de nascimento parece inválida. Envie no formato dd/mm/aaaa.",
  },
  "cliente.cep_tamanho": {
    grupo: G.cliente,
    descricao: "CEP sem 8 dígitos.",
    padrao: "O CEP precisa ter 8 dígitos. Pode enviar novamente?",
  },
  "cliente.uf_invalida": {
    grupo: G.cliente,
    descricao: "UF diferente de 2 letras.",
    padrao: "A UF do endereço parece inválida. Pode me enviar seu CEP novamente?",
  },

  // ─── /cliente/consultar ─────────────────────────────────────────────────
  "consultar.encontrado_nome": {
    grupo: G.consultar,
    descricao: "Cliente encontrado (com nome).",
    padrao: "Encontrei seu cadastro, {nome}!",
    variaveis: ["nome"],
  },
  "consultar.encontrado": { grupo: G.consultar, descricao: "Cliente encontrado (sem nome no cadastro).", padrao: "Encontrei seu cadastro!" },
  "consultar.nao_encontrado": {
    grupo: G.consultar,
    descricao: "CPF/CNPJ sem cadastro no GFSIS.",
    padrao: "Cliente não encontrado no cadastro.",
  },

  // ─── /cliente/salvar ────────────────────────────────────────────────────
  "salvar.ok": { grupo: G.salvar, descricao: "Cadastro salvo no GFSIS.", padrao: "Cadastro atualizado com sucesso." },
  "salvar.cep_nao_encontrado": {
    grupo: G.salvar,
    descricao: "CEP não existe no ViaCEP.",
    padrao: "Não encontrei esse CEP. Pode conferir e enviar novamente?",
  },
  "salvar.cep_geral": {
    grupo: G.salvar,
    descricao: "CEP geral da cidade (sem rua/bairro).",
    padrao: "Esse CEP é geral da cidade. Pode me informar o nome da rua e o bairro?",
  },
  "salvar.gfsis_001": { grupo: G.salvar, descricao: "GFSIS código 001 — CPF obrigatório.", padrao: "Preciso do seu CPF para continuar." },
  "salvar.gfsis_003": {
    grupo: G.salvar,
    descricao: "GFSIS código 003 — cliente já cadastrado (ok: true).",
    padrao: "Seu cadastro já existe no nosso sistema. Vamos seguir com o agendamento.",
  },
  "salvar.gfsis_007": {
    grupo: G.salvar,
    descricao: "GFSIS código 007 — CPF inválido.",
    padrao: "O CPF informado não é válido. Pode conferir e enviar novamente?",
  },
  "salvar.gfsis_008": {
    grupo: G.salvar,
    descricao: "GFSIS código 008 — data de nascimento obrigatória.",
    padrao: "Preciso da sua data de nascimento (no formato dd/mm/aaaa).",
  },
  "salvar.gfsis_009": { grupo: G.salvar, descricao: "GFSIS código 009 — nome obrigatório.", padrao: "Preciso do seu nome completo." },
  "salvar.gfsis_010": {
    grupo: G.salvar,
    descricao: "GFSIS código 010 — e-mail obrigatório.",
    padrao: "Preciso do seu e-mail para enviar o link da reunião.",
  },
  "salvar.gfsis_011": {
    grupo: G.salvar,
    descricao: "GFSIS código 011 — telefone inválido.",
    padrao: "O telefone informado parece inválido. Pode enviar novamente com DDD?",
  },
  "salvar.gfsis_012": {
    grupo: G.salvar,
    descricao: "GFSIS código 012 — endereço inválido.",
    padrao: "Não consegui validar seu endereço. Pode me enviar seu CEP novamente?",
  },
  "salvar.gfsis_013": {
    grupo: G.salvar,
    descricao: "GFSIS código 013 — município não encontrado.",
    padrao: "Não encontrei o município do seu endereço. Pode me enviar seu CEP novamente?",
  },
  "salvar.erro_gfsis": {
    grupo: G.salvar,
    descricao: "Outro erro do GFSIS ao salvar o cadastro.",
    padrao: "Não consegui atualizar seu cadastro agora. Vou encaminhar você para um atendente.",
  },

  // ─── /horarios ──────────────────────────────────────────────────────────
  "horarios.encontrado_um": {
    grupo: G.horarios,
    descricao: "Exatamente 1 horário encontrado.",
    padrao: "Encontrei {quantidade} horário",
    variaveis: ["quantidade"],
  },
  "horarios.encontrados": {
    grupo: G.horarios,
    descricao: "2 ou mais horários encontrados.",
    padrao: "Encontrei {quantidade} horários",
    variaveis: ["quantidade"],
  },
  "horarios.sem_horarios": {
    grupo: G.horarios,
    descricao: "Nenhum horário livre no período pedido.",
    padrao:
      "Não encontrei horários disponíveis no período da {periodo} nos próximos dias. Quer tentar outro período ({outrosPeriodos})?",
    variaveis: ["periodo", "outrosPeriodos"],
  },
  "horarios.data_invalida": {
    grupo: G.horarios,
    descricao: "dataInicial em formato não reconhecido.",
    padrao: "Não entendi a data informada. Use o formato dd/mm/aaaa.",
  },
  "horarios.ponto_nao_encontrado": {
    grupo: G.horarios,
    descricao: "Ponto de atendimento não existe no GFSIS.",
    padrao: "Não consegui consultar a agenda agora. Vou encaminhar você para um atendente.",
  },

  // ─── /agendar ───────────────────────────────────────────────────────────
  "agendar.confirmado": { grupo: G.agendar, descricao: "Agendamento criado.", padrao: "Agendamento confirmado!" },
  "agendar.ja_agendado": {
    grupo: G.agendar,
    descricao: "Cliente já tem agendamento nessa data e horário.",
    padrao: "Você já tem um agendamento em {data} às {horario}.",
    variaveis: ["data", "horario"],
  },
  "agendar.data_invalida": {
    grupo: G.agendar,
    descricao: "Data escolhida não reconhecida.",
    padrao: "Não entendi a data escolhida. Vou buscar os horários novamente.",
  },
  "agendar.horario_invalido": {
    grupo: G.agendar,
    descricao: "Horário escolhido não reconhecido.",
    padrao: "Não entendi o horário escolhido. Vou buscar os horários novamente.",
  },
  "agendar.horario_passou": {
    grupo: G.agendar,
    descricao: "Horário escolhido já passou.",
    padrao: "Esse horário já passou. Vou buscar novas opções para você.",
  },
  "agendar.horario_preenchido": {
    grupo: G.agendar,
    descricao: "Horário ocupado por outra pessoa no momento de agendar.",
    padrao: "Esse horário acabou de ser preenchido. Vou buscar outras opções para você.",
  },
  "agendar.nome_obrigatorio": {
    grupo: G.agendar,
    descricao: "Falta o nome para agendar.",
    padrao: "Preciso do seu nome completo para concluir o agendamento.",
  },
  "agendar.email_obrigatorio": {
    grupo: G.agendar,
    descricao: "Falta o e-mail para agendar.",
    padrao: "Preciso do seu e-mail para enviar o link da reunião.",
  },
  "agendar.endereco_incompleto": {
    grupo: G.agendar,
    descricao: "Falta CEP/número do endereço para agendar.",
    padrao: "Preciso do seu CEP e número do endereço para concluir o agendamento.",
  },
  "agendar.municipio_invalido": {
    grupo: G.agendar,
    descricao: "GFSIS rejeitou o município do endereço.",
    padrao: "Não consegui validar o município do seu endereço. Pode me enviar seu CEP novamente?",
  },
  "agendar.erro": {
    grupo: G.agendar,
    descricao: "GFSIS recusou o agendamento (ponto não encontrado ou outro erro).",
    padrao: "Não consegui concluir o agendamento agora. Vou encaminhar você para um atendente.",
  },
  "agendar.nao_confirmado": {
    grupo: G.agendar,
    descricao: "GFSIS falhou ao agendar e a verificação não encontrou o agendamento.",
    padrao: "Não consegui confirmar seu agendamento agora. Um atendente vai verificar e retornar para você.",
  },

  // ─── /agendamento/proximo ───────────────────────────────────────────────
  "proximo.encontrado": {
    grupo: G.proximo,
    descricao: "Próximo agendamento encontrado (também vai em data.mensagemAgendamento).",
    padrao: "📅 Seu próximo agendamento é {quando}.",
    variaveis: ["quando", "data", "horario"],
  },
  "proximo.nenhum": {
    grupo: G.proximo,
    descricao: "Nenhum agendamento futuro.",
    padrao: "Não encontrei nenhum agendamento futuro no seu cadastro. Quer agendar um horário?",
  },

  // ─── /nota-fiscal ───────────────────────────────────────────────────────
  "nota.titulo_uma": {
    grupo: G.nota,
    descricao: "Título antes da lista quando há 1 nota (seguido dos links).",
    padrao: "🧾 Aqui está a sua nota fiscal:",
  },
  "nota.titulo_varias": {
    grupo: G.nota,
    descricao: "Título antes da lista quando há 2+ notas (seguido dos links).",
    padrao: "🧾 Encontrei {quantidade} notas fiscais:",
    variaveis: ["quantidade"],
  },
  "nota.nao_gerada": {
    grupo: G.nota,
    descricao: "Nota fiscal ainda não emitida.",
    padrao: "Sua nota fiscal ainda não foi gerada. Ela fica disponível após a emissão do certificado.",
  },
  "nota.nenhuma": {
    grupo: G.nota,
    descricao: "Nenhuma nota fiscal vinculada.",
    padrao: "Não encontrei nota fiscal vinculada ao seu cadastro.",
  },

  // ─── /boletos ───────────────────────────────────────────────────────────
  "boletos.titulo_um": {
    grupo: G.boletos,
    descricao: "Título antes da lista quando há 1 boleto (seguido do link).",
    padrao: "💳 Você tem 1 boleto em aberto:",
  },
  "boletos.titulo_varios": {
    grupo: G.boletos,
    descricao: "Título antes da lista quando há 2+ boletos (seguido dos links).",
    padrao: "💳 Você tem {quantidade} boletos em aberto:",
    variaveis: ["quantidade"],
  },
  "boletos.nenhum": { grupo: G.boletos, descricao: "Nenhum boleto em aberto.", padrao: "Você não tem boletos em aberto no momento. 🎉" },

  // ─── /pedido/situacao ───────────────────────────────────────────────────
  "pedido.titulo_numero": {
    grupo: G.pedido,
    descricao: "Primeira linha da situação do pedido consultado pelo número.",
    padrao: "📦 Pedido {numero}",
    variaveis: ["numero"],
  },
  "pedido.titulo_ultimo": {
    grupo: G.pedido,
    descricao: "Primeira linha do último pedido do cliente (com número).",
    padrao: "📦 Seu último pedido: {numero}",
    variaveis: ["numero"],
  },
  "pedido.titulo_ultimo_sem_numero": {
    grupo: G.pedido,
    descricao: "Primeira linha do último pedido do cliente (sem número).",
    padrao: "📦 Seu último pedido",
  },
  "pedido.sem_identificacao": {
    grupo: G.pedido,
    descricao: "Nem número do pedido nem CPF/CNPJ enviados.",
    padrao: "Preciso do número do pedido ou do seu CPF/CNPJ para consultar.",
  },
  "pedido.numero_invalido": {
    grupo: G.pedido,
    descricao: "Número do pedido em formato inválido.",
    padrao: "Não entendi o número do pedido. Envie apenas os números, por favor.",
  },
  "pedido.nao_encontrado": {
    grupo: G.pedido,
    descricao: "Pedido não existe ou não pertence ao CPF/CNPJ informado.",
    padrao: "Não encontrei esse pedido. Pode conferir o número e enviar novamente? Se preferir, falo com um atendente.",
  },
  "pedido.nenhum": { grupo: G.pedido, descricao: "Cliente sem nenhum pedido.", padrao: "Não encontrei nenhum pedido no seu cadastro." },
} as const satisfies Record<string, DefinicaoMensagem>;

export type MensagemChave = keyof typeof MENSAGENS;

export type MensagensPersonalizadas = Partial<Record<MensagemChave, string>>;

export const TAMANHO_MAXIMO_MENSAGEM = 1000;

export function isMensagemChave(chave: string): chave is MensagemChave {
  return Object.prototype.hasOwnProperty.call(MENSAGENS, chave);
}

export function variaveisPermitidas(chave: MensagemChave): readonly string[] {
  return (MENSAGENS[chave] as DefinicaoMensagem).variaveis ?? [];
}

const RE_VARIAVEL = /\{(\w+)\}/g;

/** Troca {variavel} pelo valor; variáveis sem valor ficam como estão. */
export function interpolar(texto: string, vars: Record<string, string | number> = {}): string {
  return texto.replace(RE_VARIAVEL, (todo, nome: string) => (nome in vars ? String(vars[nome]) : todo));
}

/** Problema no texto personalizado, ou null se ok. */
export function validarTexto(chave: MensagemChave, texto: string): string | null {
  if (!texto.trim()) return "A mensagem não pode ficar vazia.";
  if (texto.length > TAMANHO_MAXIMO_MENSAGEM) return `Máximo de ${TAMANHO_MAXIMO_MENSAGEM} caracteres.`;
  const permitidas = variaveisPermitidas(chave);
  const desconhecidas = [...texto.matchAll(RE_VARIAVEL)].map((m) => m[1]!).filter((v) => !permitidas.includes(v));
  if (desconhecidas.length > 0) {
    const lista = [...new Set(desconhecidas)].map((v) => `{${v}}`).join(", ");
    return permitidas.length > 0
      ? `Variável desconhecida: ${lista}. Disponíveis: ${permitidas.map((v) => `{${v}}`).join(", ")}.`
      : `Variável desconhecida: ${lista}. Esta mensagem não aceita variáveis.`;
  }
  return null;
}
