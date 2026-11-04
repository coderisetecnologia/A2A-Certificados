"use client";

import { useEffect, useState } from "react";
import { Badge, card, CodeBlock, CopyButton } from "../ui";

const STORAGE_KEY = "implantacao-suri-concluidos";

interface Mapa {
  campo: string;
  variavel: string;
  uso: string;
}

interface Ramo {
  code: string;
  acao: string;
}

interface Passo {
  id: string;
  titulo: string;
  resumo: string;
  itens?: string[];
  rota?: string;
  body?: unknown;
  mapa?: Mapa[];
  ramos?: Ramo[];
  nota?: string;
}

function TabelaMapa({ mapa }: { mapa: Mapa[] }) {
  return (
    <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-800">
      <table className="w-full text-sm">
        <thead className="bg-slate-50 text-left text-xs text-slate-500 dark:bg-slate-950 dark:text-slate-400">
          <tr>
            <th className="px-3 py-2">Campo do retorno</th>
            <th className="px-3 py-2">Variável no flow</th>
            <th className="px-3 py-2">Para que serve</th>
          </tr>
        </thead>
        <tbody>
          {mapa.map((m) => (
            <tr key={m.campo} className="border-t border-slate-200 dark:border-slate-800">
              <td className="px-3 py-2 font-mono text-xs">{m.campo}</td>
              <td className="px-3 py-2 font-mono text-xs">{m.variavel}</td>
              <td className="px-3 py-2">{m.uso}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function TabelaRamos({ ramos }: { ramos: Ramo[] }) {
  return (
    <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-800">
      <table className="w-full text-sm">
        <thead className="bg-slate-50 text-left text-xs text-slate-500 dark:bg-slate-950 dark:text-slate-400">
          <tr>
            <th className="px-3 py-2">Se code (ou condição) for</th>
            <th className="px-3 py-2">Então</th>
          </tr>
        </thead>
        <tbody>
          {ramos.map((r) => (
            <tr key={r.code} className="border-t border-slate-200 dark:border-slate-800">
              <td className="px-3 py-2 font-mono text-xs">{r.code}</td>
              <td className="px-3 py-2">{r.acao}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function Implantacao({
  baseUrl,
  chaveDica,
  pontoPadrao,
  local,
}: {
  baseUrl: string;
  chaveDica: string | null;
  pontoPadrao: number | null;
  local: boolean;
}) {
  const [feitos, setFeitos] = useState<Record<string, boolean>>({});

  useEffect(() => {
    try {
      setFeitos(JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}") as Record<string, boolean>);
    } catch {
      // ignora
    }
  }, []);

  const alternar = (id: string) =>
    setFeitos((f) => {
      const novo = { ...f, [id]: !f[id] };
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(novo));
      } catch {
        // modo privado
      }
      return novo;
    });

  const PASSOS: Passo[] = [
    {
      id: "preparar",
      titulo: "Preparar o ambiente",
      resumo: "Confirme que a API está pronta antes de mexer na Suri.",
      itens: [
        "Deploy feito na Vercel com todas as variáveis de ambiente (GFSIS_*, SURI_API_KEY, DATABASE_URL, AUTH_*, CRON_SECRET).",
        "Na aba Erros, “Testar conexão com o GFSIS” retorna Conexão OK.",
        pontoPadrao === null
          ? "⚠️ GFSIS_PONTO_ATENDIMENTO_ID ainda não está configurado: horários e agendamento vão falhar. Descubra o número na aba Testes (Consultar horários com identificadorPontoAtendimento) e configure na Vercel."
          : `GFSIS_PONTO_ATENDIMENTO_ID configurado (${pontoPadrao}).`,
        "Na aba Testes, rode Consultar cliente, Consultar horários e (com um CPF de teste) Criar agendamento. Tudo deve responder sem GFSIS_INDISPONIVEL.",
      ],
    },
    {
      id: "campos",
      titulo: "Criar os campos personalizados do contato na Suri",
      resumo:
        "Em Contatos → Campos (ou no seletor de variáveis do flow), crie os campos que o fluxo vai preencher. Nome, e-mail, telefone e CPF normalmente já existem como campos padrão.",
      itens: [
        "data_nascimento: texto (dd/mm/aaaa)",
        "cep: texto",
        "numero_endereco: texto",
        "complemento: texto (opcional)",
        "periodo: texto (manha, tarde ou noite)",
        "horario_escolhido: texto (label da opção escolhida, ex. 06/11 (Sexta) 08:40)",
        "numero_pedido: texto (consulta de situação do pedido)",
        "Variáveis de apoio do flow: gfsis_code, cliente_encontrado, cadastro_completo, falta_nascimento, falta_endereco, falta_email, horarios_mensagem, horarios_opcoes, mensagem_confirmacao, id_agendamento, correlation_id",
      ],
      nota:
        "Os nomes acima são sugestões. Se a sua conta usar outros nomes (ex.: @User.Variables.cep), ajuste nos corpos das requisições abaixo. Confira o nome exato no seletor de variáveis do editor de flows.",
    },
    {
      id: "comum",
      titulo: "Configuração comum de todas as ações “Requisição HTTP”",
      resumo: "Toda chamada para a API usa a mesma base, os mesmos headers e o mesmo formato de resposta.",
      itens: [
        `URL base: ${baseUrl}`,
        "Método: POST",
        `Header x-api-key: valor de SURI_API_KEY ${chaveDica ? `(começa com ${chaveDica.slice(0, 4)} e termina com ${chaveDica.slice(-4)})` : "(⚠️ ainda não configurada no servidor)"}`,
        "Header Content-Type: application/json",
        "Timeout da ação: 15 segundos ou mais (a API responde em até 10 s).",
        "Ramifique sempre pelo campo code (ou ok) da resposta, nunca pelo status HTTP: resultados de negócio voltam com HTTP 200.",
        "Quando ok for false, o campo message já vem pronto para enviar ao cliente.",
        "Guarde o correlationId na variável correlation_id. Com ele você acha o erro na aba Erros.",
        "Se a própria ação falhar (timeout, 401, sem resposta), trate como GFSIS_INDISPONIVEL: envie uma mensagem e transfira para um atendente.",
      ],
      nota:
        "A forma de referenciar o JSON da resposta (data.primeiroNome, $.data.primeiroNome ou response.data.primeiroNome) depende da versão do editor da Suri. Confira no campo de mapeamento da ação.",
    },
    {
      id: "consultar",
      titulo: "Pedir o CPF ou CNPJ e consultar o cliente (etapa 3)",
      resumo:
        "Peça o CPF ou CNPJ, salve no campo de documento do contato e chame a consulta. A API descobre sozinha se é CPF ou CNPJ (também aceita os campos cpf ou cnpj no lugar de documento). Cliente não encontrado NÃO é erro: vem com ok:true e encontrado:false.",
      rota: "/cliente/consultar",
      body: { documento: "@User.IdentificationDocument" },
      mapa: [
        { campo: "code", variavel: "gfsis_code", uso: "Ramificação principal" },
        { campo: "data.encontrado", variavel: "cliente_encontrado", uso: "Cliente novo × existente" },
        { campo: "data.tipoDocumento", variavel: "tipo_documento", uso: "cpf ou cnpj" },
        { campo: "data.primeiroNome", variavel: "primeiro_nome", uso: "“Olá, {primeiro_nome}!”" },
        { campo: "data.emailMascarado", variavel: "email_mascarado", uso: "“Confirma o e-mail {email_mascarado}?”" },
        { campo: "data.cadastroCompleto", variavel: "cadastro_completo", uso: "Pular direto para os horários" },
        { campo: "data.faltaDataNascimento", variavel: "falta_nascimento", uso: "Perguntar a data de nascimento" },
        { campo: "data.faltaEndereco", variavel: "falta_endereco", uso: "Perguntar CEP + número" },
        { campo: "data.faltaEmail", variavel: "falta_email", uso: "Perguntar o e-mail" },
        { campo: "correlationId", variavel: "correlation_id", uso: "Rastrear erros no painel" },
      ],
      ramos: [
        { code: "CPF_INVALIDO, CNPJ_INVALIDO", acao: "Enviar message e pedir o documento de novo (limite de 2 tentativas)." },
        { code: "cadastro_completo = true", acao: "Ir para “Perguntar o período”." },
        { code: "OK / CLIENTE_NAO_ENCONTRADO (incompleto)", acao: "Ir para “Coletar dados e salvar cliente”." },
        { code: "GFSIS_INDISPONIVEL / outro", acao: "Enviar message e transferir para um atendente." },
      ],
    },
    {
      id: "salvar",
      titulo: "Coletar os dados que faltam e salvar o cliente (etapa 4)",
      resumo:
        "Pergunte só o que estiver faltando (use falta_nascimento, falta_endereco e falta_email; para cliente novo, pergunte também o nome). Depois chame o salvar. Campos vazios ou variáveis sem valor são ignorados e não apagam nada no GFSIS.",
      rota: "/cliente/salvar",
      body: {
        cpf: "@User.IdentificationDocument",
        nome: "@User.Name",
        email: "@User.Email",
        telefone: "@User.Phone",
        dataNascimento: "@User.Variables.data_nascimento",
        cep: "@User.Variables.cep",
        numero: "@User.Variables.numero_endereco",
        complemento: "@User.Variables.complemento",
      },
      mapa: [
        { campo: "code", variavel: "gfsis_code", uso: "Ramificação" },
        { campo: "data.camposFaltantes", variavel: "campos_faltantes", uso: "Saber o que perguntar de novo" },
        { campo: "correlationId", variavel: "correlation_id", uso: "Rastrear erros no painel" },
      ],
      ramos: [
        { code: "OK, CLIENTE_JA_CADASTRADO", acao: "Ir para “Perguntar o período”." },
        { code: "DATA_NASCIMENTO_OBRIGATORIA, DATA_NASCIMENTO_INVALIDA", acao: "Enviar message, perguntar a data de nascimento e chamar o salvar de novo." },
        { code: "EMAIL_OBRIGATORIO, EMAIL_INVALIDO", acao: "Enviar message, perguntar o e-mail e chamar o salvar de novo." },
        { code: "CEP_INVALIDO, ENDERECO_INVALIDO", acao: "Enviar message, perguntar o CEP de novo." },
        { code: "ENDERECO_INCOMPLETO", acao: "CEP geral da cidade: perguntar rua e bairro e reenviar com logradouro e bairro no corpo." },
        { code: "TELEFONE_INVALIDO", acao: "Perguntar o telefone com DDD." },
        { code: "CPF_INVALIDO, CPF_OBRIGATORIO", acao: "Pedir o CPF de novo." },
        { code: "GFSIS_ERRO_CADASTRO, GFSIS_INDISPONIVEL", acao: "Enviar message e transferir para um atendente." },
      ],
      nota: "Limite as tentativas (ex.: 2 por campo) para não prender o cliente num loop.",
    },
    {
      id: "horarios",
      titulo: "Perguntar o período e consultar horários (etapa 5)",
      resumo:
        "Envie um menu Manhã / Tarde / Noite e salve a resposta em periodo. Depois chame a consulta. A API já descarta horários passados e só consulta os dias de atendimento definidos em Configurações.",
      rota: "/horarios",
      body: { periodo: "@User.Variables.periodo", dias: 5, maxOpcoes: 6 },
      mapa: [
        { campo: "code", variavel: "gfsis_code", uso: "Ramificação" },
        { campo: "message", variavel: "horarios_mensagem", uso: "Ex.: “Encontrei 6 horários”" },
        { campo: "data.opcoes", variavel: "horarios_opcoes", uso: "Até maxOpcoes itens: numero, data (aaaa-mm-dd), horario (HH:mm), label" },
      ],
      ramos: [
        { code: "OK", acao: "Enviar horarios_mensagem e as opções ({numero}) {label}, ou botões/lista) e ir para “Receber a escolha”." },
        { code: "SEM_HORARIOS", acao: "Enviar message (já sugere outro período) e voltar ao menu de período." },
        { code: "PONTO_NAO_ENCONTRADO, GFSIS_INDISPONIVEL", acao: "Enviar message e transferir para um atendente." },
      ],
      nota:
        "periodo aceita manha, manhã, Manhã, tarde e noite. Faixas: manhã antes das 12:00, tarde 12:00–17:59, noite a partir das 18:00. Campos opcionais: dataInicial (dd/mm/aaaa) e identificadorPontoAtendimento.",
    },
    {
      id: "escolha",
      titulo: "Receber a escolha do cliente (etapa 6)",
      resumo: "Não há chamada à API aqui: é lógica do flow.",
      itens: [
        "Com lista/botões da Suri (Ver opções): use o label de cada item como texto da opção e salve a resposta em horario_escolhido. A API separa data e horário no /agendar.",
        "Com resposta numérica: valide que o número existe em data.opcoes e salve o label do item (posição número − 1) em horario_escolhido.",
        "Opcional: confirme com o cliente usando o label do item escolhido antes de agendar.",
      ],
    },
    {
      id: "agendar",
      titulo: "Criar o agendamento (etapas 7–8)",
      resumo:
        "Só horarioEscolhido (ou data + horario separados) e cliente.cpf são obrigatórios. O que faltar é completado com o cadastro do GFSIS e o ViaCEP. Pode reenviar sem medo: se o mesmo agendamento já existir, a resposta é JA_AGENDADO e nada é duplicado.",
      rota: "/agendar",
      body: {
        horarioEscolhido: "@User.Variables.horario_escolhido",
        cliente: {
          cpf: "@User.IdentificationDocument",
          nome: "@User.Name",
          email: "@User.Email",
          telefone: "@User.Phone",
          cep: "@User.Variables.cep",
          numero: "@User.Variables.numero_endereco",
        },
        videoconferencia: true,
        observacao: "Agendamento via WhatsApp (Suri)",
      },
      mapa: [
        { campo: "code", variavel: "gfsis_code", uso: "Ramificação" },
        { campo: "data.mensagemConfirmacao", variavel: "mensagem_confirmacao", uso: "Enviar direto ao cliente" },
        { campo: "data.idAgendamento", variavel: "id_agendamento", uso: "Registro do agendamento no GFSIS" },
        { campo: "data.dataFormatada", variavel: "data_formatada", uso: "Ex.: 16/09 (Quarta)" },
        { campo: "data.camposFaltantes", variavel: "campos_faltantes", uso: "Quando faltar algum dado" },
      ],
      ramos: [
        { code: "OK, JA_AGENDADO", acao: "Ir para “Confirmar ao cliente”." },
        { code: "HORARIO_INDISPONIVEL", acao: "Enviar message e voltar para “Consultar horários” (data.reconsultar = true)." },
        { code: "EMAIL_OBRIGATORIO, NOME_OBRIGATORIO, ENDERECO_INCOMPLETO, ENDERECO_INVALIDO", acao: "Perguntar o dado (ver campos_faltantes), chamar o salvar cliente e tentar de novo." },
        { code: "CPF_INVALIDO", acao: "Pedir o CPF de novo." },
        { code: "DATA_INVALIDA, HORARIO_INVALIDO", acao: "Voltar para “Consultar horários”." },
        { code: "GFSIS_INDISPONIVEL, GFSIS_ERRO_AGENDAMENTO, PONTO_NAO_ENCONTRADO", acao: "Enviar message e transferir para um atendente." },
      ],
    },
    {
      id: "confirmar",
      titulo: "Confirmar ao cliente (etapas 9–10)",
      resumo: "Envie mensagem_confirmacao. O agendamento fica registrado no GFSIS com o id em id_agendamento.",
      itens: [
        "Exemplo da mensagem: ✅ Agendamento confirmado! 📅 Data: 16/09 (Quarta) ⏰ Horário: 09:00 📍 Local: Online (link será enviado por e-mail)",
        "Opcional: encerrar o atendimento ou oferecer o menu principal.",
      ],
    },
    {
      id: "menu-complementar",
      titulo: "Montar o menu de consultas (fluxos complementares)",
      resumo:
        "Além de agendar, o cliente pode consultar o próximo agendamento, a nota fiscal, os boletos em aberto e a situação de um pedido. Todas as consultas usam o mesmo CPF/CNPJ já coletado e são somente leitura.",
      itens: [
        "Crie um menu, por exemplo: 1) Agendar atendimento · 2) Meu próximo agendamento · 3) Nota fiscal · 4) Boletos em aberto · 5) Situação do pedido · 6) Falar com atendente.",
        "Antes de qualquer consulta, peça o CPF ou CNPJ (se ainda não tiver) e salve em @User.IdentificationDocument.",
        "Cada opção chama uma das rotas abaixo e envia o texto pronto (mensagemAgendamento, texto ou mensagemPedido).",
        "Ao final, ofereça voltar ao menu ou encerrar.",
      ],
      nota:
        "Os links de boleto e de nota fiscal vêm do próprio GFSIS. Envie-os apenas ao titular do documento: só faça essas consultas depois de identificar o cliente.",
    },
    {
      id: "proximo-agendamento",
      titulo: "Consultar o próximo agendamento",
      resumo: "Mostra o próximo agendamento futuro (não cancelado). Sem agendamento NÃO é erro: vem ok:true com SEM_AGENDAMENTO.",
      rota: "/agendamento/proximo",
      body: { documento: "@User.IdentificationDocument" },
      mapa: [
        { campo: "code", variavel: "gfsis_code", uso: "Ramificação" },
        { campo: "data.possuiAgendamento", variavel: "possui_agendamento", uso: "Tem ou não agendamento" },
        { campo: "data.mensagemAgendamento", variavel: "mensagem_agendamento", uso: "Enviar direto ao cliente" },
        { campo: "data.dataFormatada / data.horario", variavel: "data_formatada / horario_agendado", uso: "Montar mensagem própria" },
      ],
      ramos: [
        { code: "OK", acao: "Enviar mensagem_agendamento." },
        { code: "SEM_AGENDAMENTO", acao: "Enviar message e oferecer “Agendar atendimento”." },
        { code: "CPF_INVALIDO, CNPJ_INVALIDO", acao: "Pedir o documento de novo." },
        { code: "GFSIS_INDISPONIVEL", acao: "Enviar message e transferir para um atendente." },
      ],
    },
    {
      id: "nota-fiscal",
      titulo: "Consultar nota fiscal",
      resumo: "Devolve os links das notas fiscais do cliente, já numerados no campo texto.",
      rota: "/nota-fiscal",
      body: { documento: "@User.IdentificationDocument" },
      mapa: [
        { campo: "code", variavel: "gfsis_code", uso: "Ramificação" },
        { campo: "data.texto", variavel: "notas_texto", uso: "Enviar direto ao cliente (links incluídos)" },
        { campo: "data.quantidade", variavel: "notas_qtd", uso: "Quantas notas vieram" },
        { campo: "data.nota1_link … data.nota9_link", variavel: "nota1_link …", uso: "Link de cada nota" },
      ],
      ramos: [
        { code: "OK", acao: "Enviar notas_texto." },
        { code: "NOTA_FISCAL_NAO_GERADA", acao: "Enviar message (a nota ainda será emitida)." },
        { code: "SEM_NOTA_FISCAL", acao: "Enviar message e oferecer falar com um atendente." },
        { code: "CPF_INVALIDO, CNPJ_INVALIDO", acao: "Pedir o documento de novo." },
        { code: "GFSIS_ERRO_CONSULTA, GFSIS_INDISPONIVEL", acao: "Enviar message e transferir para um atendente." },
      ],
    },
    {
      id: "boletos",
      titulo: "Consultar boletos em aberto",
      resumo: "Devolve os links dos boletos emitidos e ainda em aberto. qtdBoletos é opcional (padrão 5, máx. 9).",
      rota: "/boletos",
      body: { documento: "@User.IdentificationDocument", qtdBoletos: 5 },
      mapa: [
        { campo: "code", variavel: "gfsis_code", uso: "Ramificação" },
        { campo: "data.texto", variavel: "boletos_texto", uso: "Enviar direto ao cliente (links incluídos)" },
        { campo: "data.quantidade", variavel: "boletos_qtd", uso: "Quantos boletos vieram" },
        { campo: "data.boleto1_link … data.boleto9_link", variavel: "boleto1_link …", uso: "Link de cada boleto" },
      ],
      ramos: [
        { code: "OK", acao: "Enviar boletos_texto." },
        { code: "SEM_BOLETOS", acao: "Enviar message (nenhum boleto em aberto)." },
        { code: "CPF_INVALIDO, CNPJ_INVALIDO", acao: "Pedir o documento de novo." },
        { code: "GFSIS_ERRO_CONSULTA, GFSIS_INDISPONIVEL", acao: "Enviar message e transferir para um atendente." },
      ],
    },
    {
      id: "pedido",
      titulo: "Consultar a situação de um pedido",
      resumo:
        "Pergunte o número do pedido (opcional). Com o número, a API mostra a situação desse pedido e confere se ele pertence ao documento enviado. Sem o número (variável vazia), mostra o último pedido do cliente.",
      rota: "/pedido/situacao",
      body: { documento: "@User.IdentificationDocument", numeroPedido: "@User.Variables.numero_pedido" },
      mapa: [
        { campo: "code", variavel: "gfsis_code", uso: "Ramificação" },
        { campo: "data.mensagemPedido", variavel: "mensagem_pedido", uso: "Enviar direto ao cliente" },
        { campo: "data.situacao", variavel: "situacao_pedido", uso: "Ex.: Aprovado, Emitido" },
        { campo: "data.numeroPedido", variavel: "numero_pedido", uso: "Número do pedido consultado" },
      ],
      ramos: [
        { code: "OK", acao: "Enviar mensagem_pedido." },
        { code: "PEDIDO_NAO_ENCONTRADO, PEDIDO_INVALIDO", acao: "Enviar message e pedir o número de novo (limite de 2 tentativas)." },
        { code: "SEM_PEDIDO", acao: "Enviar message e oferecer falar com um atendente." },
        { code: "CPF_INVALIDO, CNPJ_INVALIDO", acao: "Pedir o documento de novo." },
        { code: "GFSIS_ERRO_CONSULTA, GFSIS_INDISPONIVEL, CONFIGURACAO_INVALIDA", acao: "Enviar message e transferir para um atendente." },
      ],
      nota:
        "A consulta por número exige a unidade do GFSIS (identificadorUnidade). Configure GFSIS_UNIDADE_ID na Vercel; sem ela, a API usa GFSIS_PONTO_ATENDIMENTO_ID.",
    },
    {
      id: "humano",
      titulo: "Configurar a transferência para atendente",
      resumo: "Todos os ramos de erro técnico terminam aqui. Crie um único bloco reutilizável.",
      itens: [
        "Enviar a message recebida (ou uma mensagem padrão, se a ação falhou sem resposta).",
        "Adicionar uma nota interna com correlation_id para o atendente achar o erro no painel.",
        "Transferir para a fila/equipe de atendimento humano.",
      ],
    },
    {
      id: "publicar",
      titulo: "Publicar e validar ponta a ponta",
      resumo: "Teste com o seu próprio WhatsApp antes de liberar para os clientes.",
      itens: [
        "Publique o flow.",
        "Faça um atendimento completo com um CPF de teste: cliente novo → cadastro → horários → agendamento.",
        "Repita com um cliente já cadastrado (deve pular direto para os horários).",
        "Teste um CPF inválido e um período sem horários.",
        "Confira na aba Erros se nada inesperado foi registrado.",
        "Cancele no GFSIS os agendamentos de teste.",
      ],
    },
  ];

  const total = PASSOS.length;
  const concluidos = PASSOS.filter((p) => feitos[p.id]).length;

  const fluxo = `CPF ─▶ consultar ──┬─ CPF_INVALIDO ─▶ pedir CPF de novo
                   ├─ cadastroCompleto ──────────────────────┐
                   └─ incompleto / não encontrado            │
                         └─▶ coletar campos ─▶ salvar ───────┤
                                                             ▼
                         Período ─▶ horarios ─┬─ SEM_HORARIOS ─▶ outro período
                                              └─ texto ─▶ cliente escolhe Nº
                                                             ▼
                                        agendar ─┬─ OK / JA_AGENDADO ─▶ confirmar
                                                 ├─ HORARIO_INDISPONIVEL ─▶ horarios
                                                 └─ GFSIS_INDISPONIVEL ─▶ atendente

Menu de consultas (CPF/CNPJ já identificado):
  ├─ Próximo agendamento ─▶ agendamento/proximo ─┬─ OK ─▶ mensagemAgendamento
  │                                               └─ SEM_AGENDAMENTO ─▶ oferecer agendar
  ├─ Nota fiscal ─────────▶ nota-fiscal ─────────┬─ OK ─▶ texto (links)
  │                                               └─ NOTA_FISCAL_NAO_GERADA / SEM_NOTA_FISCAL
  ├─ Boletos em aberto ───▶ boletos ─────────────┬─ OK ─▶ texto (links)
  │                                               └─ SEM_BOLETOS
  └─ Situação do pedido ──▶ pedido/situacao ─────┬─ OK ─▶ mensagemPedido
                                                  └─ PEDIDO_NAO_ENCONTRADO ─▶ pedir nº de novo`;

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Implantação na Suri</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Passo a passo para montar o flow de atendimento e agendamento. Marque cada passo ao concluir; o progresso fica
          salvo neste navegador.
        </p>
      </div>

      <section className={`${card} space-y-3`}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="text-sm font-medium">
            Progresso: {concluidos} de {total} passos
          </div>
          <div className="h-2 w-48 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
            <div className="h-full bg-brand-600 transition-all" style={{ width: `${(concluidos / total) * 100}%` }} />
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span>URL base:</span>
          <code className="font-mono text-xs">{baseUrl}</code>
          <CopyButton text={baseUrl} />
        </div>
        {local && (
          <p className="text-xs text-amber-700 dark:text-amber-300">
            Você está abrindo o painel localmente. Na Suri, use a URL do deploy na Vercel (abra esta página pelo domínio de
            produção para ver a URL certa).
          </p>
        )}
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span>API key:</span>
          {chaveDica ? <Badge tone="green">{chaveDica}</Badge> : <Badge tone="red">SURI_API_KEY não configurada</Badge>}
          <span className="text-xs text-slate-500">O valor completo está nas variáveis de ambiente da Vercel.</span>
        </div>
      </section>

      <section className={card}>
        <h2 className="mb-2 font-semibold">Visão geral do fluxo</h2>
        <pre className="overflow-x-auto font-mono text-xs leading-relaxed">{fluxo}</pre>
      </section>

      {PASSOS.map((p, i) => (
        <section key={p.id} className={`${card} space-y-3 ${feitos[p.id] ? "opacity-70" : ""}`}>
          <div className="flex items-start gap-3">
            <input
              type="checkbox"
              aria-label={`Marcar passo ${i + 1} como concluído`}
              className="mt-1.5 h-4 w-4"
              checked={!!feitos[p.id]}
              onChange={() => alternar(p.id)}
            />
            <div className="flex-1 space-y-1">
              <h2 className="text-lg font-semibold">
                {i + 1}. {p.titulo}
              </h2>
              <p className="text-sm text-slate-600 dark:text-slate-300">{p.resumo}</p>
            </div>
          </div>

          {p.itens && (
            <ul className="ml-7 list-disc space-y-1 pl-4 text-sm">
              {p.itens.map((it) => (
                <li key={it}>{it}</li>
              ))}
            </ul>
          )}

          {p.rota && (
            <div className="ml-7 space-y-3">
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <Badge tone="brand">POST</Badge>
                <code className="break-all font-mono text-xs">{baseUrl + p.rota}</code>
                <CopyButton text={baseUrl + p.rota} label="Copiar URL" />
              </div>
              <CodeBlock title="Corpo da requisição (JSON)" code={JSON.stringify(p.body, null, 2)} />
              {p.mapa && (
                <div>
                  <div className="mb-1 text-sm font-medium">Mapear o retorno</div>
                  <TabelaMapa mapa={p.mapa} />
                </div>
              )}
              {p.ramos && (
                <div>
                  <div className="mb-1 text-sm font-medium">Ramificação</div>
                  <TabelaRamos ramos={p.ramos} />
                </div>
              )}
            </div>
          )}

          {p.nota && (
            <p className="ml-7 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-300">
              {p.nota}
            </p>
          )}
        </section>
      ))}
    </div>
  );
}
