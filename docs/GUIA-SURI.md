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

Ao configurar o retorno da requisição, mapeie os campos de `data` para variáveis do flow. A maioria dos campos é **plana** (`data.primeiroNome`, `data.texto` etc.). A exceção é `/horarios`, que devolve só a lista `data.opcoes`.

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
  "documento": "@User.IdentificationDocument"
}
```

- `documento` aceita **CPF ou CNPJ**, com ou sem máscara (inclusive o CNPJ alfanumérico). A API identifica o tipo pelo tamanho.
- Também aceita os campos `cpf` ou `cnpj` no lugar de `documento`. Corpos antigos com `{"cpf": ...}` continuam funcionando.
- Para CNPJ, a data de nascimento não é exigida, e `primeiroNome` traz a razão social completa.
- A resposta inclui `data.tipoDocumento` (`cpf` ou `cnpj`) e `data.pessoaFisica`.
- CNPJ inválido responde `CNPJ_INVALIDO`.

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
    "opcoes": [
      { "numero": 1, "data": "2026-09-16", "horario": "09:00", "label": "16/09 (Quarta) 09:00" },
      { "numero": 2, "data": "2026-09-16", "horario": "10:30", "label": "16/09 (Quarta) 10:30" },
      { "numero": 3, "data": "2026-09-17", "horario": "09:00", "label": "17/09 (Quinta) 09:00" }
    ]
  }
}
```

O retorno traz só o necessário: `message` com a quantidade ("Encontrei N horários") e `data.opcoes`, com no máximo `maxOpcoes` itens.

**Mapeamento sugerido:**

| Campo | Variável |
|---|---|
| `message` | `horarios_mensagem`: ex. "Encontrei 3 horários" |
| `data.opcoes` | `horarios_opcoes`: cada item tem `numero`, `data` (aaaa-mm-dd), `horario` (HH:mm) e `label` (ex. "16/09 (Quarta) 09:00") |

**Escolha do cliente (etapa 6):**

1. Envie `horarios_mensagem` e as opções, uma por item de `data.opcoes`, no formato `{numero}) {label}` (ou como botões/lista da Suri). Aguarde a resposta numérica.
2. Valide que o número existe em `data.opcoes` (de 1 até a quantidade de itens). Se não existir, peça de novo.
3. Pegue o item escolhido (posição `número − 1`) e copie `data` para `data_escolhida` e `horario` para `horario_escolhido`.

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

## Fluxos complementares (consultas)

Consultas somente leitura que o cliente pode pedir a partir de um menu (ex.: *1) Agendar · 2) Meu próximo agendamento · 3) Nota fiscal · 4) Boletos em aberto · 5) Situação do pedido · 6) Falar com atendente*).

- Todas recebem o documento do cliente em `documento` (CPF ou CNPJ). Também aceitam `cpf` ou `cnpj`.
- Identifique o cliente antes. Links de boleto e de nota fiscal só devem ir para o titular do documento.
- "Não encontrado" **não é erro**: vem com `ok:true` e um `code` próprio, e não é gravado no painel.
- Erros de documento são `CPF_INVALIDO` e `CNPJ_INVALIDO`: peça o documento de novo.
- `GFSIS_INDISPONIVEL` e `GFSIS_ERRO_CONSULTA`: envie `message` e transfira para um atendente.

### Próximo agendamento

**`POST /api/suri/agendamento/proximo`**

```json
{ "documento": "@User.IdentificationDocument" }
```

Resposta:

```json
{
  "ok": true,
  "code": "OK",
  "message": "📅 Seu próximo agendamento é 16/09 (Quarta), às 09:00.",
  "data": {
    "possuiAgendamento": true,
    "idAgendamento": "26030",
    "data": "2026-09-16",
    "dataFormatada": "16/09 (Quarta)",
    "dataCompleta": "16/09/2026",
    "horario": "09:00",
    "mensagemAgendamento": "📅 Seu próximo agendamento é 16/09 (Quarta), às 09:00."
  }
}
```

| code | Ação |
|---|---|
| `OK` | Envie `data.mensagemAgendamento` |
| `SEM_AGENDAMENTO` | Envie `message` e ofereça agendar (etapa 5) |

### Nota fiscal

**`POST /api/suri/nota-fiscal`**

```json
{ "documento": "@User.IdentificationDocument" }
```

Resposta:

```json
{
  "ok": true,
  "code": "OK",
  "data": {
    "possuiNota": true,
    "quantidade": 2,
    "texto": "🧾 Encontrei 2 notas fiscais:\n\n1) https://...\n\n2) https://...",
    "nota1_link": "https://...",
    "nota2_link": "https://..."
  }
}
```

| code | Ação |
|---|---|
| `OK` | Envie `data.texto` (os links já vêm nele) |
| `NOTA_FISCAL_NAO_GERADA` | Envie `message`: a nota ainda será emitida |
| `SEM_NOTA_FISCAL` | Envie `message` e ofereça um atendente |

### Boletos em aberto

**`POST /api/suri/boletos`**

```json
{ "documento": "@User.IdentificationDocument", "qtdBoletos": 5 }
```

- `qtdBoletos` é opcional: padrão 5, máximo 9.
- Campos planos: `boleto1_link`, `boleto1_vencimento` e `boleto1_valor`, até `boleto9_*`. Vencimento e valor só vêm preenchidos se o GFSIS os informar; a documentação só garante o link.

| code | Ação |
|---|---|
| `OK` | Envie `data.texto` |
| `SEM_BOLETOS` | Envie `message` (nenhum boleto em aberto) |

### Situação de um pedido

**`POST /api/suri/pedido/situacao`**

```json
{
  "documento": "@User.IdentificationDocument",
  "numeroPedido": "@User.Variables.numero_pedido"
}
```

- **Com `numeroPedido`:** consulta a situação desse pedido.
  - Se `documento` também vier, o pedido só é mostrado quando pertence a ele. Caso contrário, a resposta é `PEDIDO_NAO_ENCONTRADO`, sem expor dados de terceiros.
  - Precisa da unidade do GFSIS: `identificadorUnidade` no corpo, `GFSIS_UNIDADE_ID` ou, por último, `GFSIS_PONTO_ATENDIMENTO_ID`.
  - `considerarPedidosInternos` (opcional, `true`/`false`) inclui pedidos que não foram feitos pelo site.
- **Sem `numeroPedido`** (ou variável vazia): mostra o **último pedido** do documento.

Resposta:

```json
{
  "ok": true,
  "code": "OK",
  "data": {
    "origem": "numero",
    "numeroPedido": "12345",
    "situacao": "Aprovado",
    "produto": "Certificado Digital A1 - Pessoa Física",
    "dataPedido": "15/08/2025",
    "dataAprovacao": "16/08/2025",
    "mensagemPedido": "📦 Pedido 12345\nProduto: Certificado Digital A1 - Pessoa Física\nSituação: Aprovado\nData do pedido: 15/08/2025\nAprovado em: 16/08/2025"
  }
}
```

No último pedido (`origem: "ultimo_pedido"`) também vêm `dataValidade`, `protocolo`, `valor` e `urlVideoconferencia`.

| code | Ação |
|---|---|
| `OK` | Envie `data.mensagemPedido` |
| `PEDIDO_NAO_ENCONTRADO`, `PEDIDO_INVALIDO` | Envie `message` e peça o número de novo (limite de 2 tentativas) |
| `SEM_PEDIDO` | Envie `message` e ofereça um atendente |
| `CONFIGURACAO_INVALIDA` | Unidade não configurada: ajuste `GFSIS_UNIDADE_ID` e transfira para um atendente |

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
