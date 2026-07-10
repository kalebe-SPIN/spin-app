-- ============================================================================
-- Migration 018: Contexto conversacional persistido em eventos/tarefas
-- ============================================================================
-- Quando a Bianca cria um evento/tarefa a partir da conversa, ela salva o
-- histórico das mensagens envolvidas no proprio evento/tarefa e marca essas
-- mensagens como arquivadas — o chat fica limpo, mas o contexto continua
-- acessivel ao clicar no item.
-- ============================================================================

ALTER TABLE public.agenda_eventos
  ADD COLUMN IF NOT EXISTS contexto_conversa text;

ALTER TABLE public.agenda_tarefas
  ADD COLUMN IF NOT EXISTS contexto_conversa text;

ALTER TABLE public.bianca_conversas
  ADD COLUMN IF NOT EXISTS arquivada boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_bianca_conv_ativas
  ON public.bianca_conversas(usuario_id, arquivada, created_at DESC)
  WHERE arquivada = false;
