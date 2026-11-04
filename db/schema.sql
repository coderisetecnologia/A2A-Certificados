-- ============================================================================
-- Integração Suri × GFSIS — A2A Certificações Digitais (CodeRise Tecnologia)
-- Banco: Neon Postgres
--
-- Como usar: cole este arquivo inteiro no SQL Editor do Neon e execute.
-- Pode ser executado mais de uma vez: tudo usa IF NOT EXISTS / ON CONFLICT.
-- (Equivale a `npm run db:migrate`, que cria as mesmas tabelas.)
--
-- O banco guarda APENAS:
--   1. error_logs   → erros técnicos e validações do GFSIS (sucessos não são gravados)
--   2. app_settings → regras de negócio editadas no painel (/dashboard/configuracoes)
-- ============================================================================

-- gen_random_uuid() é nativo a partir do Postgres 13 (o Neon já atende).


-- ----------------------------------------------------------------------------
-- 1. error_logs — erros da integração
-- ----------------------------------------------------------------------------
-- LGPD: request_payload é gravado MASCARADO pela aplicação
--   CPF   → ***.456.789-**      e-mail → jo***@gmail.com
--   fone  → (85) *****-8888     nome   → "João S."
--   nascimento → só o ano       senha/token → removidos
-- response_snippet: trecho da resposta do GFSIS, limitado a 2 KB e sanitizado.
-- Retenção: 90 dias (cron diário /api/cron/cleanup).
CREATE TABLE IF NOT EXISTS error_logs (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at        timestamptz NOT NULL DEFAULT now(),
  correlation_id    text        NOT NULL,           -- mesmo id devolvido à Suri na resposta
  route             text        NOT NULL,           -- ex.: /api/suri/agendar
  step              text,                           -- ex.: criar_agendamento, salvar_cliente
  gfsis_endpoint    text,                           -- ex.: POST /Agendamento
  http_status       int,                            -- status retornado pelo GFSIS (se houver)
  error_code        text,                           -- ex.: GFSIS_TIMEOUT, GFSIS_008
  message           text,                           -- descrição do erro (máx. 1000 chars)
  request_payload   jsonb,                          -- corpo recebido da Suri, mascarado
  response_snippet  text,                           -- trecho da resposta do GFSIS (máx. 2 KB)
  resolved          boolean     NOT NULL DEFAULT false,
  resolved_at       timestamptz
);

COMMENT ON TABLE  error_logs                  IS 'Erros da integração Suri x GFSIS (somente falhas; dados pessoais mascarados).';
COMMENT ON COLUMN error_logs.correlation_id   IS 'Identificador da requisição, também devolvido à Suri no campo correlationId.';
COMMENT ON COLUMN error_logs.request_payload  IS 'Corpo recebido da Suri com CPF, e-mail, telefone e nome mascarados.';
COMMENT ON COLUMN error_logs.response_snippet IS 'Trecho sanitizado da resposta do GFSIS, até 2 KB.';

-- Listagem do painel (mais recentes primeiro) e filtro por período
CREATE INDEX IF NOT EXISTS error_logs_created_at_idx  ON error_logs (created_at DESC);
-- Filtro "não resolvidos" e contador do painel
CREATE INDEX IF NOT EXISTS error_logs_resolved_idx    ON error_logs (resolved, created_at DESC);
-- Busca pelo correlation_id copiado no painel / informado pela Suri
CREATE INDEX IF NOT EXISTS error_logs_correlation_idx ON error_logs (correlation_id);


-- ----------------------------------------------------------------------------
-- 2. app_settings — configurações editáveis no painel
-- ----------------------------------------------------------------------------
-- Chave usada hoje: 'regras_negocio'
--   { "tzNegocio": "America/Fortaleza",
--     "diasAtendimento": [1,2,3,4,5],          -- 0=domingo ... 6=sábado
--     "antecedenciaMinimaMinutos": 30 }
-- Sem registro aqui, a aplicação usa as variáveis de ambiente
-- TZ_NEGOCIO, DIAS_ATENDIMENTO e ANTECEDENCIA_MINIMA_MINUTOS.
CREATE TABLE IF NOT EXISTS app_settings (
  key         text        PRIMARY KEY,
  value       jsonb       NOT NULL,
  updated_at  timestamptz NOT NULL DEFAULT now(),
  updated_by  text                                   -- e-mail de quem alterou no painel
);

COMMENT ON TABLE app_settings IS 'Configurações editadas no painel (ex.: regras_negocio).';

-- (Opcional) Valores iniciais das regras de negócio.
-- Deixe comentado para usar as variáveis de ambiente como padrão e editar
-- pelo painel. Descomente só se quiser fixar os valores direto no banco.
-- INSERT INTO app_settings (key, value, updated_by)
-- VALUES (
--   'regras_negocio',
--   '{"tzNegocio": "America/Fortaleza", "diasAtendimento": [1, 2, 3, 4, 5], "antecedenciaMinimaMinutos": 30}'::jsonb,
--   'schema.sql'
-- )
-- ON CONFLICT (key) DO NOTHING;


-- ============================================================================
-- Consultas úteis (opcional — não são executadas como parte do schema)
-- ============================================================================

-- Erros não resolvidos das últimas 24h:
--   SELECT created_at, route, step, http_status, error_code, message
--     FROM error_logs
--    WHERE NOT resolved AND created_at >= now() - interval '24 hours'
--    ORDER BY created_at DESC;

-- Erros mais frequentes nos últimos 7 dias:
--   SELECT error_code, route, count(*) AS total
--     FROM error_logs
--    WHERE created_at >= now() - interval '7 days'
--    GROUP BY error_code, route
--    ORDER BY total DESC;

-- Localizar um erro pelo correlation_id:
--   SELECT * FROM error_logs WHERE correlation_id = 'COLE-O-ID-AQUI';

-- Limpeza manual (o cron já faz isso diariamente):
--   DELETE FROM error_logs WHERE created_at < now() - interval '90 days';

-- Ver as regras de negócio vigentes:
--   SELECT value, updated_at, updated_by FROM app_settings WHERE key = 'regras_negocio';
