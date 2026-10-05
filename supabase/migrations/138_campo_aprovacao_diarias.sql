-- ============================================================================
-- Migration 138 — Campo: aprovação da agenda pelo admin + diárias
-- ============================================================================
-- Kalebe 2026-10-05:
--  - "o admin será o único usuário para liberar serviços de campo"
--  - "o profissional de campo monta agenda e solicita aprovação"
--  - Diária: R$ 100 se concluir todas as demandas aprovadas do dia;
--    R$ 70 se não concluir. O que não foi executado volta pras demandas.
--
-- campo_agenda_dias = o dia de trabalho de cada profissional: pedido de
-- aprovação, serviços aprovados (base da diária) e o fechamento da diária
-- (a Bianca fecha na manhã seguinte).
-- Idempotente.
-- ============================================================================

BEGIN;

-- Gravação direta pela sessão do usuário: só admin (o campo usa /campo,
-- server actions que conferem papel e responsável)
DROP POLICY IF EXISTS "execucoes_responsavel_update" ON public.execucoes_servicos;

-- Aprovação de cada serviço agendado: NULL (fora da agenda) | pendente | aprovada
ALTER TABLE public.execucoes_servicos ADD COLUMN IF NOT EXISTS aprovacao text;
DO $$ BEGIN
  ALTER TABLE public.execucoes_servicos
    ADD CONSTRAINT execucoes_aprovacao_chk CHECK (aprovacao IN ('pendente', 'aprovada'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.campo_agenda_dias (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profissional_id     uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  data                date NOT NULL,
  status              text NOT NULL DEFAULT 'pendente'
                      CHECK (status IN ('pendente', 'aprovada', 'recusada', 'expirada', 'fechada')),
  servicos            uuid[] NOT NULL DEFAULT '{}',   -- serviços APROVADOS do dia (base da diária)
  solicitado_em       timestamptz,
  aprovado_por        uuid REFERENCES public.profiles(id),
  aprovado_em         timestamptz,
  motivo_recusa       text,
  servicos_previstos  int,
  servicos_concluidos int,
  valor_diaria        numeric(10,2),
  tipo_diaria         text CHECK (tipo_diaria IN ('integral', 'parcial')),
  fechado_em          timestamptz,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  UNIQUE (profissional_id, data)
);
CREATE INDEX IF NOT EXISTS idx_campo_dias_status ON public.campo_agenda_dias(status, data);

ALTER TABLE public.campo_agenda_dias ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "campo_dias_read" ON public.campo_agenda_dias;
CREATE POLICY "campo_dias_read" ON public.campo_agenda_dias
  FOR SELECT USING (public.is_admin() OR profissional_id = auth.uid());
DROP POLICY IF EXISTS "campo_dias_admin_all" ON public.campo_agenda_dias;
CREATE POLICY "campo_dias_admin_all" ON public.campo_agenda_dias
  FOR ALL USING (public.is_admin());

COMMIT;

-- Conferência
SELECT
  (SELECT count(*) FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'execucoes_servicos' AND column_name = 'aprovacao') AS col_aprovacao,
  (SELECT count(*) FROM public.campo_agenda_dias) AS dias,
  (SELECT string_agg(policyname, ', ' ORDER BY policyname) FROM pg_policies
     WHERE schemaname = 'public' AND tablename = 'execucoes_servicos') AS policies_execucoes;
