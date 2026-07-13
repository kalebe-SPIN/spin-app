-- ============================================================================
-- Migration 022: Pipeline completo (projeto → negócio → venda → execução → PV)
-- ============================================================================
-- projeto_status é um ENUM: precisa ALTER TYPE ... ADD VALUE (não CHECK)
-- ============================================================================

-- Cada ALTER TYPE precisa rodar em transação separada.
-- No SQL Editor do Supabase, rode um por vez OU o SQL Editor detecta e faz certo.

ALTER TYPE projeto_status ADD VALUE IF NOT EXISTS 'negociando';
ALTER TYPE projeto_status ADD VALUE IF NOT EXISTS 'em_fechamento';
ALTER TYPE projeto_status ADD VALUE IF NOT EXISTS 'vendido';
ALTER TYPE projeto_status ADD VALUE IF NOT EXISTS 'em_homologacao';
ALTER TYPE projeto_status ADD VALUE IF NOT EXISTS 'em_execucao';
ALTER TYPE projeto_status ADD VALUE IF NOT EXISTS 'instalado';
ALTER TYPE projeto_status ADD VALUE IF NOT EXISTS 'ativo_pos_venda';

-- Timestamp da última mudança de etapa (usado pra métricas)
ALTER TABLE public.projetos
  ADD COLUMN IF NOT EXISTS status_atualizado_em timestamptz DEFAULT now();

-- Histórico de mudanças de etapa
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
