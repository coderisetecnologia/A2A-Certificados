# Integração Suri × GFSIS — A2A Certificações Digitais

API em Next.js (App Router, TypeScript) hospedada na Vercel que conecta os fluxos da **Suri** ao **GFSIS**. Ela cuida do atendimento e do agendamento de reuniões. Inclui um painel web, protegido por login Google, para consultar os erros da integração.

> Escopo: apenas atendimento e agendamento. Pedidos, certificados e boletos **não** fazem parte desta API.

## Sumário

1. [Arquitetura](#arquitetura)
2. [Endpoints](#endpoints)
3. [Configuração passo a passo](#configuração-passo-a-passo)
4. [Rodando localmente](#rodando-localmente)
5. [Deploy na Vercel](#deploy-na-vercel)
6. [Registro de erros e LGPD](#registro-de-erros-e-lgpd)
7. [Divergências da documentação do GFSIS](#divergências-da-documentação-do-gfsis)

Documentos complementares:

- [docs/GUIA-SURI.md](docs/GUIA-SURI.md): como configurar cada etapa dos fluxos na Suri.
- [docs/exemplos-curl.md](docs/exemplos-curl.md): exemplos cURL de todos os endpoints.
- [docs/postman_collection.json](docs/postman_collection.json): coleção Postman.

---

## Arquitetura

```
Suri (Requisição HTTP) ──x-api-key──▶ /api/suri/*  ──Bearer──▶ GFSIS REST
                                          │                     ViaCEP
                                          └── somente erros ──▶ Neon Postgres (error_logs)

Navegador ──Google OAuth──▶ /dashboard, /api/admin/*  ──▶ Neon (leitura)
Vercel Cron ──Bearer CRON_SECRET──▶ /api/cron/cleanup (apaga erros > 90 dias)
```

| Pasta/arquivo | Função |
|---|---|
| `app/api/suri/*` | Endpoints consumidos pela Suri |
| `app/api/admin/*` | APIs do painel (login Google obrigatório) |
| `app/api/cron/cleanup` | Limpeza diária de `error_logs` |
| `app/dashboard`, `app/(auth)/*` | Painel (erros e configurações), login e "acesso negado" |
| `lib/settings.ts` | Regras de negócio editáveis no painel (tabela `app_settings`) |
| `auth.ts`, `proxy.ts` | Auth.js (Google) e proxy de proteção (Next.js 16) |
| `lib/gfsis.ts` | Cliente HTTP do GFSIS: token em cache, retry e timeouts |
| `lib/suri-handler.ts` | Wrapper das rotas: API key, correlation_id, zod, orçamento de tempo e log de erros |
| `lib/horarios.ts`, `lib/time.ts` | Filtro por período e cálculos no fuso do negócio |
| `lib/cliente.ts`, `lib/viacep.ts` | Mescla de cadastro, campos faltantes e ViaCEP |
| `lib/mask.ts`, `lib/cpf.ts`, `lib/normalize.ts` | Máscaras (LGPD), CPF e normalização |
| `lib/db.ts`, `scripts/migrate.ts` | Neon e migration |

### Decisões importantes

- **Orçamento de tempo (`SURI_TIMEOUT_MS`, padrão 10s).** Toda chamada externa usa o tempo que resta. Retries só acontecem se ainda houver orçamento. Se o tempo acabar, a resposta é `GFSIS_INDISPONIVEL`.
- **Token do GFSIS em memória.** É renovado 5 min antes de expirar. Autenticações concorrentes são deduplicadas. Num 401, a API reautentica uma vez.
- **`POST /Agendamento` nunca é repetido.** Depois de um timeout ou 5xx, a API consulta `GET /ConsultaAgendamentoCliente` para saber se o agendamento foi criado.
- **Idempotência sem banco.** Antes de criar, a API verifica se o próximo agendamento do cliente já tem a mesma data e horário. Se tiver, responde `JA_AGENDADO`.
- **Fuso horário.** "Hoje", dia da semana e "horário já passou" são sempre calculados no fuso configurado no painel (padrão `America/Fortaleza`). A Vercel roda em UTC.

### Regras de negócio (página Configurações)

Em **Painel → Configurações** (`/dashboard/configuracoes`) você define:

| Regra | Efeito |
|---|---|
| **Fuso horário** | O que é "hoje", o dia da semana e se um horário já passou |
| **Dias de atendimento** | Quais dias da semana são consultados no GFSIS ao buscar horários |
| **Antecedência mínima** | Horários de hoje que começam dentro desse intervalo (em minutos) não são oferecidos |

- Os valores ficam na tabela `app_settings` do Neon, junto com quem alterou e quando. Cada alteração também gera um log `settings.atualizadas` com os valores anteriores e os novos.
- As variáveis `TZ_NEGOCIO`, `DIAS_ATENDIMENTO` e `ANTECEDENCIA_MINIMA_MINUTOS` são o **valor padrão**. Elas valem enquanto nada for salvo no painel e servem de reserva se o banco estiver fora do ar. O botão "Restaurar padrão" preenche o formulário com elas.
- Cada instância guarda as regras em cache por 30 segundos. Uma alteração leva até 30s para valer em todas as instâncias.
- A leitura do banco tem timeout de 1,5s. Se falhar, a rota usa o último valor conhecido ou o padrão, e a requisição da Suri não é afetada.

## Endpoints

Todas as rotas da Suri são `POST` com JSON, header `x-api-key` e prefixo `/api/suri`. A resposta sempre tem este formato:

```json
{ "ok": true, "code": "OK", "message": "texto amigável", "data": { }, "correlationId": "uuid" }
```

| Endpoint | Etapa | Resumo |
|---|---|---|
| `POST /api/suri/cliente/consultar` | 3 | `{cpf}` → `encontrado`, `primeiroNome`, `emailMascarado`, `telefoneMascarado`, `cadastroCompleto`, `camposFaltantes` |
| `POST /api/suri/cliente/salvar` | 4 | Cadastra ou atualiza o cliente. Mescla com o cadastro existente e completa o endereço via ViaCEP. |
| `POST /api/suri/horarios` | 5–6 | `{periodo, dataInicial?, dias?, maxOpcoes?}` → opções numeradas e texto pronto |
| `POST /api/suri/agendar` | 7–8 | `{data, horario, cliente{...}, videoconferencia?, observacao?}` → confirmação pronta |
| `GET /api/suri/health` | — | Healthcheck sem chamar o GFSIS (não exige API key) |

**Status HTTP:** é sempre `200` para resultados de negócio, inclusive `ok:false`. `401` só aparece com API key inválida. `500` só aparece em falha inesperada nossa ou configuração ausente.

**Códigos (`code`) para ramificar o flow:**

| code | ok | Significado | Grava erro? |
|---|---|---|---|
| `OK` | ✔ | Sucesso | — |
| `CLIENTE_NAO_ENCONTRADO` | ✔ | CPF sem cadastro (`encontrado:false`) | não |
| `JA_AGENDADO` | ✔ | Já existe agendamento igual | não |
| `CLIENTE_JA_CADASTRADO` | ✔ | GFSIS recusou a atualização com o código 003 | sim |
| `CPF_INVALIDO` | ✖ | CPF digitado inválido | não |
| `EMAIL_INVALIDO`, `TELEFONE_INVALIDO`, `DATA_NASCIMENTO_INVALIDA`, `CEP_INVALIDO` | ✖ | Formato digitado inválido | não |
| `ENDERECO_INCOMPLETO` | ✖ | CEP geral da cidade, sem rua ou bairro (em `/agendar`, também quando falta o endereço) | só em `/agendar` |
| `DATA_NASCIMENTO_OBRIGATORIA`, `EMAIL_OBRIGATORIO`, `NOME_OBRIGATORIO`, `ENDERECO_INVALIDO`, `CPF_OBRIGATORIO` | ✖ | Validação do GFSIS ou dado ausente: pedir o dado de novo | sim |
| `SEM_HORARIOS` | ✖ | Nenhum horário no período: sugerir outro | não |
| `HORARIO_INDISPONIVEL` | ✖ | Horário ocupado (409) ou já passou: reconsultar horários | não |
| `DATA_INVALIDA`, `HORARIO_INVALIDO` | ✖ | Data ou horário enviados pelo flow são inválidos | não |
| `DADOS_INVALIDOS` | ✖ | Corpo fora do contrato (erro de configuração do flow) | sim |
| `PONTO_NAO_ENCONTRADO`, `GFSIS_ERRO_CADASTRO`, `GFSIS_ERRO_AGENDAMENTO` | ✖ | Erro de configuração ou dado no GFSIS: transferir para humano | sim |
| `GFSIS_INDISPONIVEL` | ✖ | Timeout, 5xx ou falha de autenticação: transferir para humano | sim |

## Configuração passo a passo

### 1. Usuário integração no GFSIS

1. Peça a um administrador do GFSIS da AR que crie um **usuário administrador marcado com a flag "usuário integração"**. Esse usuário não acessa a interface do GFSIS; serve apenas para a API. Há um passo a passo em <https://gfsis.readme.io/reference/autenticação-1>.
2. Anote o **login** (`GFSIS_USER`), a **senha** (`GFSIS_PASSWORD`) e o **subdomínio** da instância (`GFSIS_SUBDOMAIN`). Por exemplo, `a2a` em `https://a2a.gfsis.com.br`.
3. Descubra o **identificador do ponto de atendimento** (filial) usado nos agendamentos online (`GFSIS_PONTO_ATENDIMENTO_ID`). Ele só é exigido pelo GFSIS em `ConsultaHorarioAgenda` e `Agendamento`; autenticação e rotas de cliente funcionam sem ele. Para descobrir, use a aba **Testes** do painel (Consultar horários com `identificadorPontoAtendimento` no corpo: um ponto inexistente responde `PONTO_NAO_ENCONTRADO`) ou confirme com o suporte do GFSIS (suporte@gfsis.com.br).
4. Depois do deploy, use o botão **"Testar conexão com o GFSIS"** no painel. Ele valida as credenciais e, se configurado, o ponto de atendimento. Em seguida, use as abas **Testes** (executa cada função como a Suri) e **Implantação Suri** (passo a passo do flow).

### 2. Banco Neon (somente erros)

1. Crie um projeto em <https://console.neon.tech>. Prefira a região `sa-east-1` (São Paulo).
2. Copie a connection string **pooled** (host com `-pooler`) para `DATABASE_URL`.
   - Também é possível criar o banco pela integração **Vercel → Storage → Neon**, que já preenche `DATABASE_URL`.
3. Rode a migration. Ela cria a tabela `error_logs` (com índices em `created_at` e `resolved`) e a tabela `app_settings`, que guarda as regras de negócio editadas no painel:

   ```bash
   npm run db:migrate
   ```

   O script lê `DATABASE_URL` do ambiente ou de `.env.local`. Pode ser executado mais de uma vez sem problema (`IF NOT EXISTS`).

### 3. Login Google (OAuth)

1. No [Google Cloud Console](https://console.cloud.google.com/), crie ou selecione um projeto.
2. Em **APIs e serviços → Tela de consentimento OAuth** (ou "Google Auth Platform"):
   - Tipo de usuário: **Externo**.
   - Preencha o nome do app ("CodeRise – Painel Suri/GFSIS"), o e-mail de suporte e o domínio.
   - Escopos: apenas os padrão (`openid`, `email`, `profile`).
   - Se o app ficar em modo **"Teste"**, adicione **`coderisetecnologia@gmail.com`** em **Usuários de teste**. Sem isso, o Google bloqueia o login antes de chegar à aplicação.
3. Em **Credenciais → Criar credenciais → ID do cliente OAuth**:
   - Tipo: **Aplicativo da Web**.
   - **Origens JavaScript autorizadas:** `https://SEU-DOMINIO` e `http://localhost:3000`.
   - **URIs de redirecionamento autorizados:**
     - `https://SEU-DOMINIO/api/auth/callback/google`
     - `http://localhost:3000/api/auth/callback/google`
4. Copie o **Client ID** para `AUTH_GOOGLE_ID` e o **Client Secret** para `AUTH_GOOGLE_SECRET`.
5. Gere o `AUTH_SECRET` com `npx auth secret` ou `openssl rand -base64 32`.

O acesso fica restrito a `ALLOWED_EMAIL` (padrão `coderisetecnologia@gmail.com`). O callback `signIn` exige `email_verified === true` e e-mail exatamente igual, sem diferenciar maiúsculas. Qualquer outra conta vê a tela **"Acesso negado"**. A sessão é verificada em duas camadas: no `proxy.ts` e de novo dentro de cada rota `/api/admin/*` e no server component do dashboard.

### 4. Variáveis de ambiente

Veja [.env.example](.env.example). Resumo:

| Variável | Obrigatória | Descrição |
|---|---|---|
| `GFSIS_SUBDOMAIN` | ✔ | Subdomínio do GFSIS |
| `GFSIS_USER` / `GFSIS_PASSWORD` | ✔ | Usuário integração |
| `GFSIS_PONTO_ATENDIMENTO_ID` | — | Ponto de atendimento padrão. Só é usado em horários e agendamento (pode ser sobrescrito no body). Sem ele, essas duas rotas exigem `identificadorPontoAtendimento` no body |
| `SURI_API_KEY` | ✔ | Chave do header `x-api-key` (`openssl rand -hex 32`) |
| `DATABASE_URL` | ✔ | Neon (pooled) |
| `AUTH_SECRET` | ✔ | Segredo do Auth.js |
| `AUTH_GOOGLE_ID` / `AUTH_GOOGLE_SECRET` | ✔ | OAuth Google |
| `ALLOWED_EMAIL` | — | Padrão `coderisetecnologia@gmail.com` |
| `CRON_SECRET` | ✔ | Protege `/api/cron/cleanup` (a Vercel envia como Bearer) |
| `TZ_NEGOCIO` | — | Valor padrão do fuso (`America/Fortaleza`); editável no painel |
| `DIAS_ATENDIMENTO` | — | Valor padrão dos dias (`1,2,3,4,5`, 0 = domingo); editável no painel |
| `SURI_TIMEOUT_MS` | — | Padrão `10000` |
| `ANTECEDENCIA_MINIMA_MINUTOS` | — | Valor padrão da antecedência (`30` min); editável no painel |

## Rodando localmente

Requer Node.js 20.9 ou superior.

```bash
npm install
cp .env.example .env.local   # preencha os valores
npm run db:migrate
npm run dev                  # http://localhost:3000
```

Outros comandos:

```bash
npm test           # testes unitários (Vitest)
npm run typecheck  # TypeScript estrito
npm run build      # build de produção
```

Teste rápido:

```bash
curl http://localhost:3000/api/suri/health
```

## Deploy na Vercel

1. Envie o repositório para o GitHub (`git push`) e importe o projeto na Vercel. O framework Next.js é detectado sozinho.
2. Em **Settings → Environment Variables**, cadastre todas as variáveis acima para **Production** (e Preview, se for usar).
3. Faça o deploy. Depois:
   - Rode `npm run db:migrate` localmente apontando para o `DATABASE_URL` de produção (ou rode a migration uma única vez pelo SQL Editor do Neon com o SQL de `lib/db.ts`).
   - Adicione o domínio de produção nas URIs de redirecionamento do Google (passo 3).
   - Acesse `/login`, entre com `coderisetecnologia@gmail.com` e clique em **Testar conexão com o GFSIS**.
4. **Cron:** o `vercel.json` agenda `/api/cron/cleanup` uma vez por dia às 09:00 UTC (06:00 em Fortaleza). Isso é compatível com o plano Hobby, que permite um cron diário. A Vercel envia `Authorization: Bearer ${CRON_SECRET}` automaticamente quando `CRON_SECRET` está definida.
5. **Funções:** todas as rotas usam o runtime Node.js. O `vercel.json` define `maxDuration` de 20s para as rotas da Suri. Na prática, nenhuma passa de `SURI_TIMEOUT_MS`.

## Registro de erros e LGPD

- **Eventos de sucesso não são persistidos.** Eles aparecem apenas como `console.log` estruturado (JSON) nos logs da Vercel, sem dados pessoais.
- **Somente erros** vão para `error_logs` no Neon:
  - falhas técnicas: timeout, 5xx, 401 do GFSIS após reautenticar, exceções nossas e configuração ausente;
  - validações do GFSIS: códigos 001–016 e 999, 422, ponto não encontrado;
  - corpos fora do contrato e dados insuficientes para agendar.
- **Não** são gravados resultados de negócio esperados: cliente não encontrado, CPF digitado inválido, sem horários, horário indisponível (409).
- O payload é **mascarado** antes de gravar:
  - CPF: `***.456.789-**`;
  - e-mail: `jo***@gmail.com`;
  - telefone: `(85) *****-8888`;
  - nome: "João S.";
  - data de nascimento: só o ano;
  - número e complemento do endereço são ocultados;
  - senha e token são removidos.
- O trecho da resposta do GFSIS é limitado a 2 KB e passa pela mesma limpeza.
- A gravação usa `waitUntil` (`@vercel/functions`) e fica dentro de `try/catch`: se o Neon falhar, sai apenas um `console.error` e a resposta para a Suri não é afetada.
- Retenção: **90 dias**, com limpeza diária pelo cron.

## Divergências da documentação do GFSIS

A documentação oficial (<https://gfsis.readme.io>) traz exemplos conflitantes. O cliente aceita todas as variantes:

| Ponto | Variantes tratadas |
|---|---|
| `POST /auth` | Corpo JSON `{username,password}` **e** header `Basic`. Resposta `{token, expiresIn}` **ou** `{accessToken, expirationDate}`. Sem `expiresIn`, a validade vem do `exp` do JWT, limitada a 1h. |
| `GET /ConsultaHorarioAgenda` | `horariosDisponiveis` **ou** `listaHorarios`. Sem horários, vem `{mensagem}` com HTTP 200. |
| `POST /Agendamento` | `idAgendamento` **ou** `id`. Data `yyyy-MM-dd` **ou** `dd/MM/yyyy`. |
| Próximo agendamento | `GET /ConsultaAgendamentoCliente?cpf=` (apenas dígitos) |
| `GET /ConsultaCliente` | Telefone como `"Celular: 37..."` e `dataNascimento` como `dd-MM-yyyy` |
| `POST /Cliente` | Erros como `{erro, codigo, mensagem}` **ou** `{erros:[{codigo, mensagem}]}`. O código `003` ("já existe cliente com o CPF") vira `CLIENTE_JA_CADASTRADO` com `ok:true` e é registrado para conferência. |

> ⚠️ **Validar em homologação:** o formato exato da autenticação e o comportamento de `POST /Cliente` para um CPF já existente (atualiza ou retorna `003`) precisam ser confirmados com uma chamada real. Use o botão de teste do painel e confira `error_logs` nos primeiros atendimentos.
#   A 2 A - C e r t i f i c a d o s  
 #   A 2 A - C e r t i f i c a d o s  
 