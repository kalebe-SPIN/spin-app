-- ============================================================================
-- Migration 068 — Metas de trabalho globais em configuracoes_empresa
-- ============================================================================
-- 3 metas mensais únicas pra todos os vendedores de serviços:
--   • meta_telhados_mes   — telhados novos cadastrados no CRM /crm/servicos
--   • meta_contatos_mes   — interações registradas (ligação, WhatsApp, visita)
--   • meta_propostas_mes  — telhados que chegaram na fase proposta ou fechado
--
-- Meta comercial (R$) continua por vendedor na tabela `metas` (mig anterior).
-- Aplicar via Supabase Dashboard > SQL Editor.
-- ============================================================================

BEGIN;

ALTER TABLE public.configuracoes_empresa
  ADD COLUMN IF NOT EXISTS meta_telhados_mes  int NOT NULL DEFAULT 30 CHECK (meta_telhados_mes  >= 0),
  ADD COLUMN IF NOT EXISTS meta_contatos_mes  int NOT NULL DEFAULT 60 CHECK (meta_contatos_mes  >= 0),
  ADD COLUMN IF NOT EXISTS meta_propostas_mes int NOT NULL DEFAULT 15 CHECK (meta_propostas_mes >= 0);

COMMENT ON COLUMN public.configuracoes_empresa.meta_telhados_mes IS
  'Meta mensal de telhados novos cadastrados no CRM. Fixa pra todos vendedores. Default 30.';
COMMENT ON COLUMN public.configuracoes_empresa.meta_contatos_mes IS
  'Meta mensal de interações (ligação, WhatsApp, visita). Default 60.';
COMMENT ON COLUMN public.configuracoes_empresa.meta_propostas_mes IS
  'Meta mensal de telhados que atingiram fase proposta ou fechado. Default 15.';

COMMIT;
