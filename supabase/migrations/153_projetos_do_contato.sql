-- ============================================================================
-- Migration 153 — Vários projetos por contato do WhatsApp
-- ============================================================================
-- Kalebe 2026-10-13: "quando se tratar de mais que um item será adicionado um
-- novo projeto para o contato". Cada categoria de proposta (fotovoltaico,
-- estação de recarga, BESS, O&M) vira um projeto; o contato do WhatsApp
-- aponta pra todos eles (wa_contatos.projeto_id continua sendo o principal).
-- Idempotente.
-- ============================================================================

BEGIN;

ALTER TABLE public.projetos
  ADD COLUMN IF NOT EXISTS wa_contato_id uuid REFERENCES public.wa_contatos(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_projetos_wa_contato ON public.projetos(wa_contato_id);

-- Projeto principal de cada contato já fica ligado
UPDATE public.projetos p SET wa_contato_id = c.id
FROM public.wa_contatos c
WHERE c.projeto_id = p.id AND p.wa_contato_id IS NULL;

COMMIT;

SELECT count(*) AS projetos_ligados_a_contato FROM public.projetos WHERE wa_contato_id IS NOT NULL;
