-- ============================================================================
-- Migration 043: Grupo tarifário do padrão de entrada novo
-- ============================================================================
-- Kalebe: padrões Grupo A (média tensão, com subestação) e Grupo B (baixa
-- tensão, medidor comum) têm diagramas diferentes. Adiciona grupo à
-- homologação pra gerador saber qual SVG desenhar.
-- ============================================================================

ALTER TABLE public.homologacoes
  ADD COLUMN IF NOT EXISTS padrao_novo_grupo_tarifa text
    CHECK (padrao_novo_grupo_tarifa IN ('A', 'B')),
  ADD COLUMN IF NOT EXISTS padrao_novo_tensao_v int;

COMMENT ON COLUMN public.homologacoes.padrao_novo_grupo_tarifa IS
  'A = média tensão (>=75kW, subestação com TC/TP) | B = baixa tensão (padrão comum)';
COMMENT ON COLUMN public.homologacoes.padrao_novo_tensao_v IS
  'Tensão nominal em V. Grupo A típico: 13800. Grupo B: 220/380/440.';
