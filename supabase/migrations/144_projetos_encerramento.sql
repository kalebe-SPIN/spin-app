-- ============================================================================
-- Migration 144 — Encerrar projeto como PERDIDO ou NÃO ELEGÍVEL (com motivo)
-- ============================================================================
-- Kalebe 2026-10-07: o card do projeto ganha "Perdido" e "Não elegível", cada
-- um com motivo; escolhido, o card sai da base de projetos (fica oculto, dá
-- pra reabrir). Perdido também vira 'recusado' (coluna "Perdido" do CRM e
-- perdidos do mês no Dashboard); não elegível só sai da base.
-- Idempotente.
-- ============================================================================

ALTER TABLE public.projetos
  ADD COLUMN IF NOT EXISTS encerrado_tipo            text,
  ADD COLUMN IF NOT EXISTS encerrado_motivo          text,
  ADD COLUMN IF NOT EXISTS encerrado_detalhe         text,
  ADD COLUMN IF NOT EXISTS encerrado_em              timestamptz,
  ADD COLUMN IF NOT EXISTS encerrado_por             uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS encerrado_status_anterior text;

DO $$ BEGIN
  ALTER TABLE public.projetos
    ADD CONSTRAINT projetos_encerrado_tipo_chk CHECK (encerrado_tipo IN ('perdido', 'nao_elegivel'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS idx_projetos_encerrado ON public.projetos(encerrado_em) WHERE encerrado_em IS NOT NULL;

SELECT count(*) AS colunas FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'projetos' AND column_name LIKE 'encerrado_%';
