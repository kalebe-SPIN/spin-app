-- ============================================================================
-- Migration 041: Flag "precisa novo padrão de entrada" nas homologações
-- ============================================================================
-- Kalebe: nem sempre a instalação já tem padrão CELESC compatível. Quando
-- precisa upgrade (ou é entrada nova), o projeto precisa de um DIAGRAMA
-- ESPECÍFICO do padrão de entrada novo, além do unifilar da GD.
--
-- Se precisa_padrao_novo=true → adiciona etapa 7 na homologação e gera
-- SVG do padrão.
-- ============================================================================

ALTER TABLE public.homologacoes
  ADD COLUMN IF NOT EXISTS precisa_padrao_novo boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS padrao_novo_amperagem int,
  ADD COLUMN IF NOT EXISTS padrao_novo_observacao text;

COMMENT ON COLUMN public.homologacoes.precisa_padrao_novo IS
  'true = projeto exige novo padrão de entrada CELESC (upgrade ou instalação nova). Adiciona etapa 7 na homologação.';
