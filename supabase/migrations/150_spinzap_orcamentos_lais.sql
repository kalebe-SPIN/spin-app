-- ============================================================================
-- Migration 150 — Orçamentos montados pela Laís (aguardando aprovação)
-- ============================================================================
-- Kalebe 2026-10-10: lead que não quer ligação → a Laís monta o orçamento
-- (fatura ou dados que o lead passou), o auditor confere cadastro × orçamento
-- (CELESC, técnico, coerência), gera o PDF resumido e o admin aprova pelo
-- link antes de ir pro cliente. Idempotente.
-- ============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.spinzap_orcamentos (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversa_id    uuid NOT NULL REFERENCES public.wa_conversas(id) ON DELETE CASCADE,
  contato_id     uuid REFERENCES public.wa_contatos(id) ON DELETE SET NULL,
  projeto_id     uuid REFERENCES public.projetos(id) ON DELETE SET NULL,
  status         text NOT NULL DEFAULT 'aguardando_aprovacao'
                 CHECK (status IN ('aguardando_aprovacao', 'enviado', 'recusado')),
  orcamento      jsonb NOT NULL,          -- kit, preço, formas de pagamento, premissas (+ bloco interno)
  auditoria      jsonb NOT NULL,          -- { aprovado, itens[], auditado_em }
  url_pdf        text,
  pv_total       numeric(12,2),
  potencia_kwp   numeric(8,2),
  criado_em      timestamptz NOT NULL DEFAULT now(),
  decidido_em    timestamptz,
  decidido_por   uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  motivo_recusa  text
);
CREATE INDEX IF NOT EXISTS idx_spinzap_orcamentos_conversa ON public.spinzap_orcamentos(conversa_id, criado_em DESC);
CREATE INDEX IF NOT EXISTS idx_spinzap_orcamentos_pendentes ON public.spinzap_orcamentos(criado_em) WHERE status = 'aguardando_aprovacao';

ALTER TABLE public.spinzap_orcamentos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS spinzap_orcamentos_admin ON public.spinzap_orcamentos;
CREATE POLICY spinzap_orcamentos_admin ON public.spinzap_orcamentos FOR ALL USING (public.is_admin());

COMMIT;

SELECT count(*) AS orcamentos_da_lais FROM public.spinzap_orcamentos;
