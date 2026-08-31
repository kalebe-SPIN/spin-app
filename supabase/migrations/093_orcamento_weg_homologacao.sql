-- ═══════════════════════════════════════════════════════════════════════
-- Migration 093 — Campo pro PDF do orçamento WEG na homologação
--
-- Kalebe 2026-08-29: 'quero adicionar um campo com o arquivo do orçamento
-- do weg para carregar tb' — junto dos outros documentos obrigatórios do
-- consultor.
-- ═══════════════════════════════════════════════════════════════════════

ALTER TABLE public.homologacoes
  ADD COLUMN IF NOT EXISTS orcamento_weg_url text,
  ADD COLUMN IF NOT EXISTS orcamento_weg_updated_at timestamptz;

COMMENT ON COLUMN public.homologacoes.orcamento_weg_url IS
  'URL assinada do PDF/imagem do orçamento WEG (aceita PDF, JPG, PNG, HEIC).';
