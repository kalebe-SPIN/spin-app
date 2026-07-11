-- ============================================================================
-- Migration 020: FK cliente_id em projetos
-- ============================================================================
-- Antes: projetos.cliente_razao_social/cpf/etc eram texto solto
-- Agora: projetos.cliente_id -> clientes.id (com denormalização preservada)
-- ============================================================================

ALTER TABLE public.projetos
  ADD COLUMN IF NOT EXISTS cliente_id uuid REFERENCES public.clientes(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_projetos_cliente_id ON public.projetos(cliente_id);
