-- ============================================================================
-- Migration 118 — Histórico de PDFs de propostas
-- ============================================================================
-- Kalebe 2026-09-22: hoje o /projetos/[id]/orcamento sobrescreve
-- url_pdf_proposta a cada nova geração. O bucket 'propostas-pdf' guarda
-- todos os arquivos, mas não tem tabela de auditoria com PV, data, quem gerou.
--
-- Esta migration cria projeto_propostas_historico pra registrar cada emissão
-- (versão v1 da proposta, v2, v3, ...) e listar no portal.
--
-- Idempotente.
-- ============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.projeto_propostas_historico (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  projeto_id            uuid NOT NULL REFERENCES public.projetos(id) ON DELETE CASCADE,

  -- Arquivo
  url_pdf               text NOT NULL,

  -- Financeiro snapshot no momento da geração
  pv_total              numeric(12,2),
  pv_bruto              numeric(12,2),
  desconto_pct          numeric(5,2),
  desconto_valor        numeric(12,2),
  desconto_motivo       text,

  -- Contexto técnico snapshot
  potencia_cc_kwp       numeric(8,2),
  potencia_ca_kw        numeric(8,2),
  modo_composicao       text,
  ucs_qtd               int,

  -- Memória de cálculo completa (margem_pct, comissao_pct, imposto_pct, etc)
  memoria_calculo       jsonb,

  -- Autoria
  gerado_por            uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  gerado_em             timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_prop_hist_projeto ON public.projeto_propostas_historico(projeto_id, gerado_em DESC);

-- RLS: quem vê o projeto vê o histórico
ALTER TABLE public.projeto_propostas_historico ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "prop_hist_dono_read" ON public.projeto_propostas_historico;
CREATE POLICY "prop_hist_dono_read" ON public.projeto_propostas_historico
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.projetos p
      WHERE p.id = projeto_id
        AND (p.consultor_id = auth.uid() OR public.is_admin())
    )
  );

DROP POLICY IF EXISTS "prop_hist_dono_insert" ON public.projeto_propostas_historico;
CREATE POLICY "prop_hist_dono_insert" ON public.projeto_propostas_historico
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.projetos p
      WHERE p.id = projeto_id
        AND (p.consultor_id = auth.uid() OR public.is_admin())
    )
  );

COMMIT;
