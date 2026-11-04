# Guia de configuração dos fluxos da Suri

Este guia explica como configurar as ações **"Requisição HTTP"** dos fluxos da Suri para cada etapa do atendimento e agendamento com o GFSIS.

> 🔎 **Sobre as variáveis:** a Suri usa a sintaxe `@` (ex.: `@User.IdentificationDocument` para o CPF do contato). Nos exemplos abaixo, variáveis marcadas com **⚠️ conferir** podem ter outro nome no painel da sua conta, principalmente campos personalizados como CEP, número e data de nascimento. Confira o nome exato em **Contatos → Campos** ou no seletor de variáveis do flow antes de publicar.

## Configuração comum a todas as requisições

| Item | Valor |
|---|---|
| Método | `POST` (exceto o health) |
| URL base | `https://SEU-DOMINIO.vercel.app/api/suri` |
| Header | `x-api-key: <valor de SURI_API_KEY>` |
| Header | `Content-Type: application/json` |

Toda resposta tem o formato:

```json
{ "ok": true, "code": "OK", "message": "texto amigável", "data": { ... }, "correlationId": "..." }
```

- **Ramifique sempre por `code`** (ou `ok`), nunca pelo status HTTP. Resultados de negócio voltam com HTTP 200.
- `message` já vem pronta para enviar ao cliente quando `ok` é `false`.
- Se a Suri registrar falha da requisição (timeout ou 401), trate como `GFSIS_INDISPONIVEL` e transfira para atendimento humano.
- Guarde o `correlationId` numa variável. Com ele é possível achar o erro no painel (botão "Copiar correlation_id").

### Como mapear o retorno livre

Ao configurar o retorno da requisição, mapeie os campos de `data` para variáveis do flow. Os campos foram pensados para serem **planos**, sem precisar iterar arrays: `data.primeiroNome`, `data.texto`, `data.opcao1_data` etc.

> ⚠️ **conferir:** a forma exata de referenciar o JSON da resposta (ex.: `data.primeiroNome`, `$.data.primeiroNome` ou `response.data.primeiroNome`) depende da versão do editor de flows da Suri. Confira no campo de mapeamento da ação.

---

## Etapas 1–2: coleta de dados (no próprio flow)

O mockup coleta nome, CPF, e-mail e telefone. O GFSIS, porém, **exige também**:

- **data de nascimento**, para pessoa física (código 008);
- **endereço**: CEP, logradouro, bairro, município e UF (códigos 012 e 013).

**Sugestão de coleta:**

1. Peça o **CPF** primeiro e chame a etapa 3. Se o cliente já existir e o cadastro estiver completo, não pergunte mais nada.
2. Para cliente novo ou cadastro incompleto, peça apenas o que estiver em `camposFaltantes`:
   - **CEP + número** do endereço. A API completa rua, bairro, cidade, UF e IBGE via ViaCEP.
   - **Data de nascimento** no formato `dd/mm/aaaa`.
   - **E-mail**, para onde vai o link da reunião online.

---

## Etapa 3: consultar cliente

**`POST /api/suri/cliente/consultar`**

Body:

```json
{
  "cpf": "@User.IdentificationDocument"
}
```

Resposta (cliente encontrado):

```json
{
  "ok": true,
  "code": "OK",
  "message": "Encontrei seu cadastro, Maria!",
  "data": {
    "encontrado": true,
    "nome": "Maria Souza",
    "primeiroNome": "Maria",
    "emailMascarado": "ma***@gmail.com",
    "telefoneMascarado": "(85) *****-8888",
    "cadastroCompleto": false,
    "camposFaltantes": "dataNascimento,cep",
    "faltaDataNascimento": true,
    "faltaEmail": false,
    "faltaEndereco": true
  }
}
```

Resposta (não encontrado). Isto **não é erro**: `ok:true`, `encontrado:false`, e `camposFaltantes` lista tudo o que é necessário:

```json
{
  "ok": true,
  "code": "CLIENTE_NAO_ENCONTRADO",
  "message": "Cliente não encontrado no cadastro.",
  "data": {
    "encontrado": false, "nome": "", "primeiroNome": "",
    "emailMascarado": "", "telefoneMascarado": "",
    "cadastroCompleto": false,
    "camposFaltantes": "nome,email,dataNascimento,cep,logradouro,bairro,municipio,uf",
    "faltaDataNascimento": true, "faltaEmail": true, "faltaEndereco": true
  }
}
```

**Mapeamento sugerido:**

| Campo do retorno | Variável do flow | Uso |
|---|---|---|
| `code` | `gfsis_code` | Ramificação principal |
| `data.encontrado` | `cliente_encontrado` | Novo × existente |
| `data.primeiroNome` | `primeiro_nome` | "Olá, {primeiro_nome}!" |
| `data.emailMascarado` | `email_mascarado` | "Confirma o e-mail {email_mascarado}?" |
| `data.cadastroCompleto` | `cadastro_completo` | Pular direto para a etapa 5 |
| `data.faltaDataNascimento` | `falta_nascimento` | Perguntar a data de nascimento |
| `data.faltaEndereco` | `falta_endereco` | Perguntar CEP + número |
| `data.faltaEmail` | `falta_email` | Perguntar o e-mail |

**Ramificação:**

- `CPF_INVALIDO`: envie `message` e peça o CPF de novo.
- `cadastro_completo = true`: vá para a etapa 5.
- Caso contrário: colete os campos faltantes e vá para a etapa 4.
- `GFSIS_INDISPONIVEL`: transfira para um atendente.

---

## Etapa 4: cadastrar/atualizar cliente

**`POST /api/suri/cliente/salvar`**

Envie só o que tiver. Campos vazios ou variáveis não preenchidas (ex.: `"@User.Foo"` sem valor) são ignorados e **não apagam** dados já existentes no GFSIS. A API mescla com o cadastro atual.

Body:

```json
{
  "cpf": "@User.IdentificationDocument",
  "nome": "@User.Name",
  "email": "@User.Email",
  "telefone": "@User.Phone",
  "dataNascimento": "@User.Variables.data_nascimento",
  "cep": "@User.Variables.cep",
  "numero": "@User.Variables.numero_endereco",
  "complemento": "@User.Variables.complemento"
}
```

⚠️ **conferir** os nomes de `@User.Name`, `@User.Email`, `@User.Phone` e dos campos personalizados (`data_nascimento`, `cep`, `numero_endereco`, `complemento`) no painel.

- O telefone pode vir com `+55`, parênteses ou traços: a API normaliza.
- A data aceita `dd/mm/aaaa` (ou `aaaa-mm-dd`).
- Opcionalmente, também aceita `logradouro`, `bairro`, `municipio`, `uf` e `codigoIbge`, se o flow coletar esses dados.

Resposta (sucesso):

```json
{
  "ok": true,
  "code": "OK",
  "message": "Cadastro atualizado com sucesso.",
  "data": { "primeiroNome": "Maria", "cadastroCompleto": true, "camposFaltantes": "", "novoCadastro": true }
}
```

Resposta (dado faltando):

```json
{
  "ok": false,
  "code": "DATA_NASCIMENTO_OBRIGATORIA",
  "message": "Preciso da sua data de nascimento (no formato dd/mm/aaaa).",
  "data": { "gfsisCodigo": "008", "primeiroNome": "Maria", "cadastroCompleto": false, "camposFaltantes": "dataNascimento" }
}
```

**Ramificação** (envie `message` e volte a perguntar o dado):

| code | Pergunte de novo |
|---|---|
| `DATA_NASCIMENTO_OBRIGATORIA`, `DATA_NASCIMENTO_INVALIDA` | Data de nascimento |
| `EMAIL_OBRIGATORIO`, `EMAIL_INVALIDO` | E-mail |
| `CEP_INVALIDO`, `ENDERECO_INVALIDO` | CEP |
| `ENDERECO_INCOMPLETO` | Rua e bairro (CEP geral da cidade). Envie de novo com `logradouro` e `bairro`. |
| `TELEFONE_INVALIDO` | Telefone com DDD |
| `CPF_INVALIDO`, `CPF_OBRIGATORIO` | CPF |
| `OK`, `CLIENTE_JA_CADASTRADO` | Siga para a etapa 5 |
| `GFSIS_ERRO_CADASTRO`, `GFSIS_INDISPONIVEL` | Transfira para um atendente |

> 💡 Limite as tentativas (ex.: 2 por campo) para não prender o cliente num loop.

---

## Etapas 5–6: consultar horários

Pergunte o período: **Manhã / Tarde / Noite**.

**`POST /api/suri/horarios`**

Body:

```json
{
  "periodo": "@User.Variables.periodo",
  "dias": 5,
  "maxOpcoes": 6
}
```

- `periodo` aceita `manha`, `manhã`, `Manhã`, `tarde`, `noite` (sem diferenciar maiúsculas e acentos).
- `dias` é opcional: número de **dias de atendimento** a consultar (padrão 5, máx. 10). Só contam os dias de atendimento definidos em **Painel → Configurações** (padrão: segunda a sexta).
- `maxOpcoes` é opcional: padrão 6, máx. 9, para que a resposta seja sempre de um dígito.
- `dataInicial` é opcional (`dd/mm/aaaa`): começa a busca a partir dessa data.

Faixas de cada período:

| Período | Horários |
|---|---|
| Manhã | antes das 12:00 |
| Tarde | 12:00 a 17:59 |
| Noite | a partir das 18:00 |

Horários de hoje que já passaram, ou que começam nos próximos 30 min, são descartados. As opções são distribuídas entre os dias disponíveis.

Resposta:

```json
{
  "ok": true,
  "code": "OK",
  "message": "Encontrei 3 horários",
  "data": {
    "quantidade": 3,
    "texto": "1) 16/09 (Quarta) 09:00\n2) 16/09 (Quarta) 10:30\n3) 17/09 (Quinta) 09:00\n\nResponda com o número da opção.",
    "opcao1_data": "2026-09-16", "opcao1_horario": "09:00", "opcao1_label": "16/09 (Quarta) 09:00",
    "opcao2_data": "2026-09-16", "opcao2_horario": "10:30", "opcao2_label": "16/09 (Quarta) 10:30",
    "opcao3_data": "2026-09-17", "opcao3_horario": "09:00", "opcao3_label": "17/09 (Quinta) 09:00",
    "opcoes": [ { "numero": 1, "data": "2026-09-16", "horario": "09:00", "label": "16/09 (Quarta) 09:00" } ],
    "periodo": "manha",
    "diasConsultados": "2026-09-16,2026-09-17,2026-09-18,2026-09-21,2026-09-22"
  }
}
```

**Mapeamento sugerido:**

| Campo | Variável |
|---|---|
| `data.texto` | `horarios_texto`: envie como mensagem |
| `data.quantidade` | `horarios_qtd` |
| `data.opcao1_data` … `data.opcao9_data` | `opcao1_data` … `opcao9_data` |
| `data.opcao1_horario` … `data.opcao9_horario` | `opcao1_horario` … `opcao9_horario` |
| `data.opcao1_label` … | `opcao1_label` … (para confirmar a escolha) |

**Escolha do cliente (etapa 6):**

1. Envie `horarios_texto` e aguarde a resposta numérica.
2. Valide que o número está entre 1 e `horarios_qtd`. Se não estiver, peça de novo.
3. Com uma condição por número (1 → `opcao1_*`, 2 → `opcao2_*` …), copie para as variáveis `data_escolhida` e `horario_escolhido`.

**Ramificação:**

- `SEM_HORARIOS`: envie `message` (já sugere outro período) e volte à pergunta de período.
- `GFSIS_INDISPONIVEL`, `PONTO_NAO_ENCONTRADO`: transfira para um atendente.

---

## Etapas 7–8: criar agendamento

**`POST /api/suri/agendar`**

Body:

```json
{
  "data": "@User.Variables.data_escolhida",
  "horario": "@User.Variables.horario_escolhido",
  "cliente": {
    "cpf": "@User.IdentificationDocument",
    "nome": "@User.Name",
    "email": "@User.Email",
    "telefone": "@User.Phone",
    "cep": "@User.Variables.cep",
    "numero": "@User.Variables.numero_endereco"
  },
  "videoconferencia": true,
  "observacao": "Agendamento via WhatsApp (Suri)"
}
```

- Só `data`, `horario` e `cliente.cpf` são obrigatórios. O que faltar (nome, e-mail, endereço) é completado com o cadastro do GFSIS e o ViaCEP.
- `videoconferencia` tem padrão `true` (mockup: "Local: Online (link será enviado por e-mail)").
- `identificadorPontoAtendimento` é opcional e sobrescreve o ponto padrão.
- Pode reenviar sem medo: se o cliente já tiver **o mesmo** agendamento, a resposta é `JA_AGENDADO` e nada é duplicado.

Resposta (sucesso):

```json
{
  "ok": true,
  "code": "OK",
  "message": "Agendamento confirmado!",
  "data": {
    "idAgendamento": "999",
    "data": "2026-09-16",
    "dataFormatada": "16/09 (Quarta)",
    "dataCompleta": "16/09/2026",
    "horario": "09:00",
    "videoconferencia": true,
    "local": "Online (link será enviado por e-mail)",
    "emailMascarado": "ma***@gmail.com",
    "mensagemConfirmacao": "✅ Agendamento confirmado!\n📅 Data: 16/09 (Quarta)\n⏰ Horário: 09:00\n📍 Local: Online (link será enviado por e-mail)"
  }
}
```

**Mapeamento sugerido:** `data.mensagemConfirmacao` → `mensagem_confirmacao` (envie direto ao cliente), `data.idAgendamento` → `id_agendamento`, `data.dataFormatada` → `data_formatada`.

**Ramificação:**

| code | Ação |
|---|---|
| `OK`, `JA_AGENDADO` | Envie `mensagem_confirmacao` (etapas 9–10) |
| `HORARIO_INDISPONIVEL` | Envie `message` e volte à etapa 5 (`data.reconsultar = true`) |
| `EMAIL_OBRIGATORIO`, `NOME_OBRIGATORIO`, `ENDERECO_INCOMPLETO`, `ENDERECO_INVALIDO` | Pergunte o dado (veja `data.camposFaltantes`), chame a etapa 4 e tente de novo |
| `CPF_INVALIDO` | Peça o CPF de novo |
| `DATA_INVALIDA`, `HORARIO_INVALIDO` | Volte à etapa 5 |
| `GFSIS_INDISPONIVEL`, `GFSIS_ERRO_AGENDAMENTO`, `PONTO_NAO_ENCONTRADO` | Envie `message` e transfira para um atendente |

---

## Etapas 9–10: confirmação

Envie `mensagem_confirmacao`. O registro do agendamento fica no GFSIS (o id está em `id_agendamento`).

---

## Healthcheck

`GET /api/suri/health` não exige API key e não chama o GFSIS. Serve para monitoramento.

## Resumo do fluxo

```
CPF ─▶ [3] consultar ──┬─ CPF_INVALIDO ─▶ pedir CPF de novo
                       ├─ cadastroCompleto ─────────────────────────┐
                       └─ incompleto / não encontrado               │
                             └─▶ coletar campos ─▶ [4] salvar ──────┤
                                                                    ▼
                                Período ─▶ [5] horarios ─┬─ SEM_HORARIOS ─▶ outro período
                                                         └─ texto ─▶ cliente escolhe Nº
                                                                    ▼
                                            [7] agendar ─┬─ OK / JA_AGENDADO ─▶ [9] confirmar
                                                         ├─ HORARIO_INDISPONIVEL ─▶ [5]
                                                         └─ GFSIS_INDISPONIVEL ─▶ humano
```
