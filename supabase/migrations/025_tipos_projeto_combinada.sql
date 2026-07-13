-- ============================================================================
-- Migration 025: Tipos de projeto (10 tipos) + proposta combinada
-- ============================================================================
-- Spin Solar agora vende:
--   Fotovoltaico: on-grid, híbrido BESS, zero-grid, off-grid
--   Bateria: BESS standalone
--   Mobilidade: estação de recarga VE
--   Serviços: limpeza, manutenção, elétrica predial, padrão de entrada
--
-- Proposta pode ter MÚLTIPLOS itens (combinada) — cada um dimensionado
-- separadamente e consolidado no orçamento final.
-- ============================================================================

-- Enum com os 10 tipos
DO $$ BEGIN
  CREATE TYPE tipo_item_projeto AS ENUM (
    'fv_ongrid',
    'fv_hibrido',
    'fv_zero_grid',
    'fv_offgrid',
    'bess',
    've_recarga',
    'srv_limpeza',
    'srv_manutencao',
    'srv_eletrica_predial',
    'srv_padrao_entrada'
  );
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- Tabela de itens da proposta (uma proposta pode ter N itens)
CREATE TABLE IF NOT EXISTS public.projeto_itens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  projeto_id uuid NOT NULL REFERENCES public.projetos(id) ON DELETE CASCADE,
  tipo tipo_item_projeto NOT NULL,
  ordem int NOT NULL DEFAULT 0,       -- ordem de exibição na proposta
  titulo text,                        -- opcional (auto se null: nome do tipo)
  dados jsonb NOT NULL DEFAULT '{}',  -- especificações específicas do tipo
  valor_estimado numeric(12,2),       -- valor calculado pelo fluxo daquele item
  status text NOT NULL DEFAULT 'pendente' CHECK (
    status IN ('pendente', 'em_dimensionamento', 'concluido', 'removido')
  ),
  observacoes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_projeto_itens_projeto ON public.projeto_itens(projeto_id, ordem);
CREATE INDEX IF NOT EXISTS idx_projeto_itens_tipo ON public.projeto_itens(tipo, status);

-- Modo da proposta
ALTER TABLE public.projetos
  ADD COLUMN IF NOT EXISTS modo_proposta text NOT NULL DEFAULT 'combinada' CHECK (
    modo_proposta IN ('simples', 'combinada')
  ),
  ADD COLUMN IF NOT EXISTS valor_total_proposta numeric(12,2);

-- RLS
ALTER TABLE public.projeto_itens ENABLE ROW LEVEL SECURITY;

CREATE POLICY "projeto_itens_dono" ON public.projeto_itens
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.projetos p
      WHERE p.id = projeto_id AND (p.consultor_id = auth.uid() OR public.is_admin())
    )
  );

CREATE POLICY "projeto_itens_admin_all" ON public.projeto_itens
  FOR ALL USING (public.is_admin());
