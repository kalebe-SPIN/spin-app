-- ============================================================================
-- Migration 147 — Laís assume o atendimento no lugar do usuário (cobertura)
-- ============================================================================
-- Kalebe 2026-10-09: botão no Spinzap pra Laís assumir quando o usuário não
-- pode atender na hora. Ela lê a conversa do dia, segue com o cliente dizendo
-- que depois passa pro usuário as demandas que surgirem, e devolve quando o
-- usuário retoma (botão, mensagem pelo Spinzap ou pelo celular).
--  - lais_cobrindo_desde: início da cobertura (NULL = sem cobertura)
--  - lais_cobrindo_por:   usuário que a Laís está cobrindo (recebe as demandas)
-- As demandas anotadas ficam em contexto_qualificacao.cobertura_demandas.
-- Idempotente.
-- ============================================================================

BEGIN;

ALTER TABLE public.wa_conversas
  ADD COLUMN IF NOT EXISTS lais_cobrindo_desde timestamptz,
  ADD COLUMN IF NOT EXISTS lais_cobrindo_por   uuid REFERENCES public.profiles(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_wa_conversas_lais_cobrindo
  ON public.wa_conversas(lais_cobrindo_desde) WHERE lais_cobrindo_desde IS NOT NULL;

COMMIT;

-- Conferência (deve voltar 0 — ninguém sendo coberto ainda)
SELECT count(*) AS conversas_com_lais_cobrindo FROM public.wa_conversas WHERE lais_cobrindo_desde IS NOT NULL;
