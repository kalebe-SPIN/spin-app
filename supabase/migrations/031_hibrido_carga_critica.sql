-- ============================================================================
-- Migration 031: Composição da carga crítica + peak shaving (Grupo A)
-- ============================================================================
-- Regras Kalebe:
--   • Carga crítica tem tipos: indutiva / resistiva / capacitiva
--   • Cada tipo demanda de inversor:
--       - Indutiva: pico de partida ~3-5× nominal (motores, ar cond)
--       - Capacitiva: reativo, precisa cuidado com harmônicos
--       - Resistiva: comportamento linear, simples
--   • Grupo A: peak shaving em horário de ponta pra reduzir demanda
-- ============================================================================

ALTER TABLE public.projeto_hibrido_analise
  ADD COLUMN IF NOT EXISTS perc_carga_indutiva numeric(5,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS perc_carga_resistiva numeric(5,2) DEFAULT 100,
  ADD COLUMN IF NOT EXISTS perc_carga_capacitiva numeric(5,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS grupo_tarifa text CHECK (grupo_tarifa IN ('A', 'B')),
  ADD COLUMN IF NOT EXISTS horario_ponta_inicio time,
  ADD COLUMN IF NOT EXISTS horario_ponta_fim time,
  ADD COLUMN IF NOT EXISTS observacao_carga_critica text;

COMMENT ON COLUMN public.projeto_hibrido_analise.perc_carga_indutiva IS
  'Percentual de carga indutiva (motores, ar condicionado, geladeira). Motores partem com 3-5x nominal.';
COMMENT ON COLUMN public.projeto_hibrido_analise.perc_carga_resistiva IS
  'Percentual resistiva (chuveiro, iluminação incandescente, forno). Comportamento linear.';
COMMENT ON COLUMN public.projeto_hibrido_analise.perc_carga_capacitiva IS
  'Percentual capacitiva (eletrônicos, LEDs, TVs). Introduz harmônicos.';
