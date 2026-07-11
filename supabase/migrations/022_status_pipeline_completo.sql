-- ============================================================================
-- Migration 022: Pipeline completo (projeto → negócio → venda → execução → PV)
-- ============================================================================
-- Amplia constraint de status com novos estágios:
-- negociando, em_fechamento, vendido, em_homologacao, em_execucao,
-- instalado, ativo_pos_venda
-- ============================================================================

-- Remove constraint antiga se existir e recria com estados completos
ALTER TABLE public.projetos DROP CONSTRAINT IF EXISTS projetos_status_check;
ALTER TABLE public.projetos
  ADD CONSTRAINT projetos_status_check CHECK (
    status IN (
      -- FASE 1: PROJETO (workflow técnico)
      'rascunho', 'fatura_analisada', 'telhado_preenchido', 'dimensionado',
      'kit_selecionado', 'lista_ca_confirmada', 'orcamento_gerado',
      -- FASE 2: NEGÓCIO (comercial)
      'proposta_enviada', 'negociando', 'em_fechamento',
      -- FASE 3: VENDA
      'vendido', 'aceito',  -- aceito = venda concretizada (retrocompat)
      -- FASE 4: EXECUÇÃO
      'em_homologacao', 'em_execucao', 'instalado',
      -- FASE 5: PÓS-VENDA
      'ativo_pos_venda',
      -- TERMINAIS
      'recusado', 'cancelado', 'expirado'
    )
  );

-- Adiciona campo pra timestamp da transição atual (metricas)
ALTER TABLE public.projetos
  ADD COLUMN IF NOT EXISTS status_atualizado_em timestamptz DEFAULT now();

-- Historico de mudanças de etapa
CREATE TABLE IF NOT EXISTS public.projeto_status_historico (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  projeto_id uuid NOT NULL REFERENCES public.projetos(id) ON DELETE CASCADE,
  status_anterior text,
  status_novo text NOT NULL,
  usuario_id uuid REFERENCES public.profiles(id),
  observacoes text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_status_hist_projeto ON public.projeto_status_historico(projeto_id, created_at DESC);

ALTER TABLE public.projeto_status_historico ENABLE ROW LEVEL SECURITY;
CREATE POLICY "status_hist_read_projeto" ON public.projeto_status_historico
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.projetos p
      WHERE p.id = projeto_id AND (p.consultor_id = auth.uid() OR public.is_admin())
    )
  );
CREATE POLICY "status_hist_admin_all" ON public.projeto_status_historico
  FOR ALL USING (public.is_admin());
