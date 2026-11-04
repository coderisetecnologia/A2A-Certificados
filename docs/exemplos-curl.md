# Exemplos cURL

Defina as variáveis antes de rodar os exemplos:

```bash
export BASE_URL="https://SEU-DOMINIO.vercel.app"   # ou http://localhost:3000
export SURI_API_KEY="sua-chave"
```

## Health

```bash
curl -s "$BASE_URL/api/suri/health"
```

## Etapa 3: consultar cliente

```bash
curl -s -X POST "$BASE_URL/api/suri/cliente/consultar" \
  -H "x-api-key: $SURI_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"cpf":"529.982.247-25"}'
```

## Etapa 4: cadastrar/atualizar cliente

```bash
curl -s -X POST "$BASE_URL/api/suri/cliente/salvar" \
  -H "x-api-key: $SURI_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "cpf": "52998224725",
    "nome": "Maria Souza",
    "email": "maria.souza@gmail.com",
    "telefone": "+55 (85) 99999-8888",
    "dataNascimento": "15/04/1985",
    "cep": "60110-001",
    "numero": "100"
  }'
```

## Etapas 5–6: horários

```bash
curl -s -X POST "$BASE_URL/api/suri/horarios" \
  -H "x-api-key: $SURI_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"periodo":"manha","dias":5,"maxOpcoes":6}'
```

A partir de uma data específica:

```bash
curl -s -X POST "$BASE_URL/api/suri/horarios" \
  -H "x-api-key: $SURI_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"periodo":"tarde","dataInicial":"21/09/2026"}'
```

## Etapas 7–8: agendar

```bash
curl -s -X POST "$BASE_URL/api/suri/agendar" \
  -H "x-api-key: $SURI_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "horarioEscolhido": "16/09 (Quarta) 09:00",
    "cliente": {
      "cpf": "52998224725",
      "nome": "Maria Souza",
      "email": "maria.souza@gmail.com",
      "telefone": "85999998888",
      "cep": "60110-001",
      "numero": "100"
    },
    "videoconferencia": true,
    "observacao": "Agendamento via WhatsApp (Suri)"
  }'
```

## Etapa 3 com CNPJ

O campo `documento` aceita CPF ou CNPJ (também valem `cpf` ou `cnpj`):

```bash
curl -s -X POST "$BASE_URL/api/suri/cliente/consultar" \
  -H "x-api-key: $SURI_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"documento":"11.222.333/0001-81"}'
```

## Fluxos complementares

Próximo agendamento:

```bash
curl -s -X POST "$BASE_URL/api/suri/agendamento/proximo" \
  -H "x-api-key: $SURI_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"documento":"52998224725"}'
```

Nota fiscal:

```bash
curl -s -X POST "$BASE_URL/api/suri/nota-fiscal" \
  -H "x-api-key: $SURI_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"documento":"52998224725"}'
```

Boletos em aberto:

```bash
curl -s -X POST "$BASE_URL/api/suri/boletos" \
  -H "x-api-key: $SURI_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"documento":"52998224725","qtdBoletos":5}'
```

Situação de um pedido (pelo número; sem `numeroPedido`, devolve o último pedido do documento):

```bash
curl -s -X POST "$BASE_URL/api/suri/pedido/situacao" \
  -H "x-api-key: $SURI_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"documento":"52998224725","numeroPedido":"12345"}'
```

## Sem API key (espera 401)

```bash
curl -s -i -X POST "$BASE_URL/api/suri/cliente/consultar" \
  -H "Content-Type: application/json" -d '{"cpf":"52998224725"}'
```

## Cron de limpeza (manual)

```bash
curl -s "$BASE_URL/api/cron/cleanup" -H "Authorization: Bearer $CRON_SECRET"
```
