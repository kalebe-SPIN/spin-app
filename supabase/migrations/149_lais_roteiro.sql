-- ============================================================================
-- Migration 149 — Roteiro da Laís pra lead novo (liga/desliga)
-- ============================================================================
-- Kalebe 2026-10-10: recepção com lista de atendimento, etiquetas, ligação
-- com consultor do setor Comercial (2 opções de horário, confirmação por
-- botão, lembrete 5 min antes pro lead e pro consultor).
-- Começa DESLIGADO: os textos pro cliente precisam do OK do Kalebe. Pra ligar:
--   UPDATE public.wa_config SET lais_roteiro_ativo = true;
-- Idempotente.
-- ============================================================================

ALTER TABLE public.wa_config
  ADD COLUMN IF NOT EXISTS lais_roteiro_ativo boolean NOT NULL DEFAULT false;

-- Lembretes de ligação: o cron procura por aqui a cada minuto
CREATE INDEX IF NOT EXISTS idx_agenda_eventos_lembrete_ligacao
  ON public.agenda_eventos(data_hora_inicio)
  WHERE tipo = 'ligacao' AND notificacao_enviada = false;

-- Conferência
SELECT lais_roteiro_ativo FROM public.wa_config LIMIT 1;
