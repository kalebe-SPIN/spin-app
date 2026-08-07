-- ============================================================================
-- Migration 061 — Cidades de atuação do convite de trabalho
-- ============================================================================
-- O admin cadastra, ao gerar o convite, as cidades onde o parceiro vai atuar.
-- Elas aparecem no mapa ilustrado de Santa Catarina, na proposta.
-- Aplicar via Supabase Dashboard > SQL Editor.
-- ============================================================================

ALTER TABLE public.convites_trabalho
  ADD COLUMN IF NOT EXISTS cidades text[] NOT NULL DEFAULT '{}';

COMMENT ON COLUMN public.convites_trabalho.cidades IS
  'Cidades de atuação (SC) marcadas no mapa da proposta. Ex: {Florianópolis,Itajaí,Blumenau}.';
