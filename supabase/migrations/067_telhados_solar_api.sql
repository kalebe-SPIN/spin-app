-- ============================================================================
-- Migration 067 — Colunas Solar API do Google em `telhados`
-- ============================================================================
-- Quando o vendedor clica no telhado, o app chama a Google Solar API
-- (buildingInsights.findClosest) e recebe dados calculados por imagem aérea:
-- máx de placas que cabem, área útil, geração anual estimada e a qualidade
-- da imagem usada. Guardamos junto pra: (1) pré-preencher qtd_placas, (2)
-- comparar depois com o que o vendedor conta na foto, (3) mostrar na
-- proposta como fonte técnica.
--
-- Todas as colunas são NULLABLE — se o telhado estiver fora da cobertura
-- da Solar API (retorna NOT_FOUND), o cadastro segue com estimativa manual.
--
-- Aplicar via Supabase Dashboard > SQL Editor.
-- ============================================================================

BEGIN;

ALTER TABLE public.telhados
  ADD COLUMN IF NOT EXISTS google_max_placas    int,
  ADD COLUMN IF NOT EXISTS area_util_m2         numeric(8, 2),
  ADD COLUMN IF NOT EXISTS geracao_anual_kwh    numeric(10, 2),
  ADD COLUMN IF NOT EXISTS imagery_quality      text CHECK (imagery_quality IN ('HIGH', 'MEDIUM', 'LOW')),
  ADD COLUMN IF NOT EXISTS solar_capturado_em   timestamptz;

COMMENT ON COLUMN public.telhados.google_max_placas IS
  'Máximo de placas que a Google Solar API estimou caber no telhado '
  '(maxArrayPanelsCount). Pré-preenche qtd_placas_estimada ao cadastrar.';
COMMENT ON COLUMN public.telhados.area_util_m2 IS
  'Área útil do telhado (maxArrayAreaMeters2) — descontando obstruções.';
COMMENT ON COLUMN public.telhados.geracao_anual_kwh IS
  'Geração anual estimada da config máxima (yearlyEnergyDcKwh).';
COMMENT ON COLUMN public.telhados.imagery_quality IS
  'Qualidade da imagem aérea usada pela Solar API: HIGH | MEDIUM | LOW. '
  'LOW = estimativa grosseira, exigir confirmação visual pelo vendedor.';
COMMENT ON COLUMN public.telhados.solar_capturado_em IS
  'Quando a Solar API foi consultada. NULL = fora da cobertura ou consulta '
  'falhou; cadastro usou estimativa manual.';

COMMIT;
