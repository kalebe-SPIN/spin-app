-- ============================================================================
-- Migration 071 — Cidades atendidas com distância até a sede da Spin
-- ============================================================================
-- Refactor do simulador de orçamento de limpeza — o vendedor não digita mais
-- o km_deslocamento manualmente. Escolhe a cidade da obra na lista cadastrada
-- pelo admin em /admin/precificacao/cidades. A distância vem daí.
--
-- Sede da Spin Solar: Tijucas/SC (km = 0).
--
-- Aplicar via Supabase Dashboard > SQL Editor.
-- ============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.cidades_distancia (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cidade       text NOT NULL,
  uf           text NOT NULL DEFAULT 'SC',
  km           numeric(6, 1) NOT NULL CHECK (km >= 0),
  observacao   text,
  ativo        boolean NOT NULL DEFAULT true,
  criado_em    timestamptz NOT NULL DEFAULT now(),
  atualizado_em timestamptz NOT NULL DEFAULT now(),
  UNIQUE (cidade, uf)
);

CREATE INDEX IF NOT EXISTS idx_cidades_distancia_ativo
  ON public.cidades_distancia(ativo) WHERE ativo = true;

-- Trigger updated_at
CREATE OR REPLACE FUNCTION public.cidades_distancia_touch()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.atualizado_em = now();
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_cidades_distancia_touch ON public.cidades_distancia;
CREATE TRIGGER trg_cidades_distancia_touch
  BEFORE UPDATE ON public.cidades_distancia
  FOR EACH ROW EXECUTE FUNCTION public.cidades_distancia_touch();

-- RLS: leitura autenticada, escrita só admin
ALTER TABLE public.cidades_distancia ENABLE ROW LEVEL SECURITY;

CREATE POLICY "cidades_distancia_auth_read" ON public.cidades_distancia
  FOR SELECT USING (auth.uid() IS NOT NULL);

CREATE POLICY "cidades_distancia_admin_all" ON public.cidades_distancia
  FOR ALL USING (public.is_admin());

COMMENT ON TABLE public.cidades_distancia IS
  'Cidades atendidas pela Spin Solar com distância (km) até a sede em '
  'Tijucas/SC. Usada pelo simulador de orçamento pra calcular deslocamento '
  'automático em vez do vendedor digitar. Manutenção pelo admin em '
  '/admin/precificacao/cidades.';

-- ─── Seed inicial: Tijucas 0 + principais SC ────────────────────────────────
INSERT INTO public.cidades_distancia (cidade, uf, km, observacao) VALUES
  ('Tijucas',                'SC',   0, 'Sede da Spin Solar'),
  ('Porto Belo',             'SC',  12, NULL),
  ('Itapema',                'SC',  25, NULL),
  ('Camboriú',               'SC',  38, NULL),
  ('Balneário Camboriú',     'SC',  40, NULL),
  ('Itajaí',                 'SC',  55, NULL),
  ('Brusque',                'SC',  40, NULL),
  ('Canelinha',              'SC',  15, NULL),
  ('São João Batista',       'SC',  22, NULL),
  ('Nova Trento',            'SC',  30, NULL),
  ('Biguaçu',                'SC',  35, NULL),
  ('São José',               'SC',  45, NULL),
  ('Florianópolis',          'SC',  55, NULL),
  ('Palhoça',                'SC',  55, NULL),
  ('Blumenau',               'SC',  90, NULL),
  ('Joinville',              'SC', 140, NULL),
  ('Navegantes',             'SC',  60, NULL),
  ('Penha',                  'SC',  65, NULL)
ON CONFLICT (cidade, uf) DO NOTHING;

-- ─── Amplia o JSONB de parametros de limpeza (idempotente) ─────────────────
-- Adiciona os novos parâmetros da fórmula automática sem remover os antigos.
-- Se já rodou antes, coalesce mantém valores existentes.
UPDATE public.parametros_precificacao_servicos
SET parametros = parametros || jsonb_build_object(
  'min_por_placa_base',       COALESCE(parametros->>'min_por_placa_base',       '1')::numeric,
  'min_por_km',               COALESCE(parametros->>'min_por_km',               '1')::numeric,
  'min_setup_org_recolh',     COALESCE(parametros->>'min_setup_org_recolh',    '30')::numeric,
  'horas_dia_trabalho',       COALESCE(parametros->>'horas_dia_trabalho',       '8')::numeric,
  'fator_sujidade_leve',      COALESCE(parametros->>'fator_sujidade_leve',     '1.0')::numeric,
  'fator_sujidade_medio',     COALESCE(parametros->>'fator_sujidade_medio',    '1.5')::numeric,
  'fator_sujidade_pesado',    COALESCE(parametros->>'fator_sujidade_pesado',   '2.0')::numeric,
  'limite_placas_1_tecnico',  COALESCE(parametros->>'limite_placas_1_tecnico', '200')::int,
  'pe_direito_max_1_tecnico', COALESCE(parametros->>'pe_direito_max_1_tecnico', '6')::numeric
),
updated_at = now()
WHERE chave = 'limpeza_fotovoltaica';

COMMIT;
