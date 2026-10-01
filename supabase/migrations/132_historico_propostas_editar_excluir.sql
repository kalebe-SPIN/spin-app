-- ============================================================================
-- Migration 132 — Editar / atualizar valores / excluir versões de proposta
-- ============================================================================
-- Kalebe 2026-10-01: cada linha do "Histórico de propostas emitidas" ganha
--   ✏️ Editar / 🔄 Atualizar valores → o PDF novo SUBSTITUI a versão (mesmo
--      número); o que havia antes fica em `substituicoes` (auditoria)
--   🗑 Excluir → soft delete (excluida_em/por), some da lista
-- A tabela (mig 118) só tinha política de SELECT e INSERT — aqui entra UPDATE
-- pro dono do projeto e pro admin. Idempotente.
-- ============================================================================

BEGIN;

ALTER TABLE public.projeto_propostas_historico
  ADD COLUMN IF NOT EXISTS atualizado_em  timestamptz,
  ADD COLUMN IF NOT EXISTS atualizado_por uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS substituicoes  jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS excluida_em    timestamptz,
  ADD COLUMN IF NOT EXISTS excluida_por   uuid REFERENCES public.profiles(id) ON DELETE SET NULL;

DROP POLICY IF EXISTS "prop_hist_dono_update" ON public.projeto_propostas_historico;
CREATE POLICY "prop_hist_dono_update" ON public.projeto_propostas_historico
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM public.projetos p
      WHERE p.id = projeto_id
        AND (p.consultor_id = auth.uid() OR public.is_admin())
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.projetos p
      WHERE p.id = projeto_id
        AND (p.consultor_id = auth.uid() OR public.is_admin())
    )
  );

COMMIT;

-- Conferência: deve listar as 5 colunas novas
SELECT column_name FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'projeto_propostas_historico'
  AND column_name IN ('atualizado_em', 'atualizado_por', 'substituicoes', 'excluida_em', 'excluida_por')
ORDER BY column_name;
