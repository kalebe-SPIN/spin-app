-- ============================================================================
-- Migration 133 — Agenda o cron da Laís / fila de leads a cada minuto
-- ============================================================================
-- Kalebe 2026-10-01: /api/cron/lead-sla não estava agendado no repositório
-- (vercel.json da Hobby só aceita cron diário). Ele faz, a cada minuto:
--   1. aviso "restam 2 min" pro representante no volante
--   2. passa o lead pro próximo da fila quando o prazo de 8 min vence
--   3. modo profundo da Laís depois de 35 min sem contato
--   4. rede de segurança: responde lead que ficou sem resposta da Laís
--   5. plantão da Laís: cliente esperando o responsável humano há 10 min
-- Mesmo esquema do 'spin-followups-bianca' (mig 123): pg_cron + pg_net,
-- autenticado com wa_config.cron_secret. Idempotente.
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

SELECT cron.unschedule('spin-lead-sla')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'spin-lead-sla');

SELECT cron.schedule(
  'spin-lead-sla',
  '* * * * *',
  $$
  SELECT net.http_get(
    url := 'https://app.spinsolar.com.br/api/cron/lead-sla',
    headers := jsonb_build_object('Authorization', 'Bearer ' || (SELECT cron_secret FROM public.wa_config LIMIT 1)),
    timeout_milliseconds := 55000
  );
  $$
);

-- Conferência: TODOS os agendamentos (se aparecer outro job chamando
-- lead-sla com outro nome, me avise — ficaria rodando em dobro)
SELECT jobname, schedule, active, left(command, 90) AS chama
FROM cron.job
ORDER BY jobname;
