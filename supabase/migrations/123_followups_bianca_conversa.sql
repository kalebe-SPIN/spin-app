-- Kalebe 2026-09-29: da conversa (inbox ou caixa do projeto) dá pra cadastrar
-- tarefa, evento ou FOLLOW-UP pra Bianca acompanhar e executar.
-- Follow-up = na data/hora marcada a Bianca manda a mensagem ao cliente na
-- própria conversa (texto exato ou escrito por ela com base no histórico).
-- Se o cliente responder antes, cancela; se a janela de 24h fechou, avisa
-- o responsável em vez de enviar.

-- 1) Follow-ups agendados
CREATE TABLE IF NOT EXISTS public.wa_followups (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversa_id            uuid NOT NULL REFERENCES public.wa_conversas(id) ON DELETE CASCADE,
  projeto_id             uuid REFERENCES public.projetos(id) ON DELETE SET NULL,
  responsavel_id         uuid NOT NULL REFERENCES public.profiles(id),
  executar_em            timestamptz NOT NULL,
  modo                   text NOT NULL DEFAULT 'bianca_escreve'
                           CHECK (modo IN ('texto_exato', 'bianca_escreve')),
  mensagem               text NOT NULL,          -- texto exato OU instrução pra Bianca
  cancelar_se_responder  boolean NOT NULL DEFAULT true,
  status                 text NOT NULL DEFAULT 'agendado'
                           CHECK (status IN ('agendado', 'enviado', 'cancelado', 'aguardando_humano', 'falhou')),
  texto_enviado          text,
  motivo                 text,
  executado_em           timestamptz,
  criado_em              timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_wa_followups_fila ON public.wa_followups(status, executar_em);
CREATE INDEX IF NOT EXISTS idx_wa_followups_conversa ON public.wa_followups(conversa_id);

ALTER TABLE public.wa_followups ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "followups_le" ON public.wa_followups;
CREATE POLICY "followups_le" ON public.wa_followups
  FOR SELECT USING (responsavel_id = auth.uid() OR public.is_admin());
DROP POLICY IF EXISTS "followups_cria" ON public.wa_followups;
CREATE POLICY "followups_cria" ON public.wa_followups
  FOR INSERT WITH CHECK (responsavel_id = auth.uid() OR public.is_admin());
DROP POLICY IF EXISTS "followups_altera" ON public.wa_followups;
CREATE POLICY "followups_altera" ON public.wa_followups
  FOR UPDATE USING (responsavel_id = auth.uid() OR public.is_admin());

-- 2) Tarefa/evento criados a partir da conversa guardam o vínculo
ALTER TABLE public.agenda_tarefas ADD COLUMN IF NOT EXISTS wa_conversa_id uuid REFERENCES public.wa_conversas(id) ON DELETE SET NULL;
ALTER TABLE public.agenda_eventos ADD COLUMN IF NOT EXISTS wa_conversa_id uuid REFERENCES public.wa_conversas(id) ON DELETE SET NULL;

-- 3) Execução a cada 5 min pelo próprio Supabase (pg_cron + pg_net) —
--    a Vercel Hobby só permite cron diário. Autentica com wa_config.cron_secret.
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

SELECT cron.unschedule('spin-followups-bianca')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'spin-followups-bianca');

SELECT cron.schedule(
  'spin-followups-bianca',
  '*/5 * * * *',
  $$
  SELECT net.http_get(
    url := 'https://app.spinsolar.com.br/api/cron/followups',
    headers := jsonb_build_object('Authorization', 'Bearer ' || (SELECT cron_secret FROM public.wa_config LIMIT 1)),
    timeout_milliseconds := 55000
  );
  $$
);

-- Conferência
SELECT jobname, schedule, active FROM cron.job WHERE jobname = 'spin-followups-bianca';
