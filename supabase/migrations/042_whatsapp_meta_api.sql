-- ============================================================================
-- Migration 042: Tracking WhatsApp Meta Cloud API
-- ============================================================================
-- Ao integrar Meta Cloud API, cada mensagem enviada retorna um message_id
-- e recebe webhooks de status (sent → delivered → read → replied).
--
-- Novas colunas em bianca_comunicacoes pra rastrear o ciclo completo.
-- ============================================================================

ALTER TABLE public.bianca_comunicacoes
  ADD COLUMN IF NOT EXISTS meta_message_id text,
  ADD COLUMN IF NOT EXISTS entregue_em timestamptz,
  ADD COLUMN IF NOT EXISTS lida_em timestamptz,
  ADD COLUMN IF NOT EXISTS respondida_em timestamptz,
  ADD COLUMN IF NOT EXISTS erro_envio text,
  ADD COLUMN IF NOT EXISTS resposta_texto text;

CREATE INDEX IF NOT EXISTS idx_bianca_comunicacoes_meta_id
  ON public.bianca_comunicacoes(meta_message_id)
  WHERE meta_message_id IS NOT NULL;

COMMENT ON COLUMN public.bianca_comunicacoes.meta_message_id IS
  'ID retornado pela Meta Cloud API ao enviar (wamid.xxx). Chave pra webhooks.';
