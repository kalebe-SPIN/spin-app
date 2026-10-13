-- ============================================================================
-- Migration 152 — Acompanhamento depois do compromisso
-- ============================================================================
-- Kalebe 2026-10-13: compromisso marcado pela conversa (responsável escolhido)
-- avisa ANTES (lembrete_min_antes / notificacao_enviada, que já existiam) e,
-- DEPOIS do horário, manda ao responsável uma mensagem de acompanhamento da
-- execução ("como foi?"). Esta coluna marca que o acompanhamento já saiu.
-- Idempotente.
-- ============================================================================

ALTER TABLE public.agenda_eventos
  ADD COLUMN IF NOT EXISTS acompanhamento_enviado_em timestamptz;

CREATE INDEX IF NOT EXISTS idx_agenda_eventos_acompanhamento
  ON public.agenda_eventos(data_hora_fim)
  WHERE wa_conversa_id IS NOT NULL AND acompanhamento_enviado_em IS NULL;

-- Eventos que já passaram não disparam acompanhamento atrasado
UPDATE public.agenda_eventos SET acompanhamento_enviado_em = now()
WHERE acompanhamento_enviado_em IS NULL AND data_hora_fim < now();

SELECT count(*) AS eventos_futuros_da_conversa
FROM public.agenda_eventos WHERE wa_conversa_id IS NOT NULL AND data_hora_inicio > now();
