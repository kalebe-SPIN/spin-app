-- ============================================================================
-- Migration 021: Titular do projeto (pode ser ≠ cliente) + endereço instalação
-- ============================================================================
-- Cenário: cliente José compra o sistema, mas titular da UC CELESC é a esposa
-- Maria, e será instalado em outro endereço (imóvel de veraneio, empresa, etc).
--
-- Conceitos:
-- - cliente_id: quem paga / cliente comercial
-- - titular_cliente_id: quem é titular da UC (importante pra homologação)
-- - endereco_instalacao: onde vai fisicamente instalar (visita técnica etc)
-- ============================================================================

ALTER TABLE public.projetos
  ADD COLUMN IF NOT EXISTS titular_cliente_id uuid REFERENCES public.clientes(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS titular_igual_cliente boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS endereco_instalacao jsonb,
  ADD COLUMN IF NOT EXISTS endereco_igual_titular boolean NOT NULL DEFAULT true;

CREATE INDEX IF NOT EXISTS idx_projetos_titular_id ON public.projetos(titular_cliente_id);
