-- ============================================================================
-- Migration 143 — Lembrete da Bianca pelo WhatsApp nas tarefas
-- ============================================================================
-- Kalebe 2026-10-07: proposta enviada pelo WhatsApp → projeto vai pra
-- "negociando" e nasce uma tarefa de follow-up com prazo de 1 dia; no dia,
-- a Bianca lembra o usuário pelo WhatsApp (rotina de 5 em 5 min).
-- Idempotente.
-- ============================================================================

ALTER TABLE public.agenda_tarefas
  ADD COLUMN IF NOT EXISTS lembrar_em          timestamptz,
  ADD COLUMN IF NOT EXISTS lembrete_enviado_em timestamptz;

CREATE INDEX IF NOT EXISTS idx_agenda_tarefas_lembrete
  ON public.agenda_tarefas(lembrar_em)
  WHERE lembrar_em IS NOT NULL AND lembrete_enviado_em IS NULL;

SELECT column_name FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'agenda_tarefas' AND column_name IN ('lembrar_em', 'lembrete_enviado_em');
