-- ============================================================================
-- Migration 062 — Tipo de proposta do convite
-- ============================================================================
-- Ao gerar o convite, o admin escolhe o tipo de proposta que o candidato verá.
--   'comercial' -> Parceiro Comercial (Serviços de O&M)  [padrão]
--   'campo'     -> Profissional de campo (prestador PJ)
-- Aplicar via Supabase Dashboard > SQL Editor.
-- ============================================================================

ALTER TABLE public.convites_trabalho
  ADD COLUMN IF NOT EXISTS tipo_proposta text NOT NULL DEFAULT 'comercial';

COMMENT ON COLUMN public.convites_trabalho.tipo_proposta IS
  'Tipo de proposta apresentada: comercial | campo.';
