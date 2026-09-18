-- ============================================================================
-- Migration 115 — Matriz de margem por tipo de projeto × faixa de kWp
-- ============================================================================
-- Kalebe 2026-09-18: hoje toda proposta usa margem_contribuicao_perc=20% fixo
-- (mig 004). Ele quer diferenciar: em usina mini-GD 100 kWp on-grid a margem
-- não pode ser a mesma que num residencial 5 kWp híbrido.
--
-- Estrutura: matriz TIPO_PROJETO × FAIXA_KWP. Cada célula é uma % (0–50).
-- Célula NULL → cai no fallback global margem_contribuicao_perc.
--
-- Kalebe preenche via /admin/precificacao/fotovoltaico > "Matriz de margem".
-- Enquanto todas células NULL, comportamento igual ao atual (20% em tudo).
--
-- Idempotente.
-- ============================================================================

BEGIN;

INSERT INTO public.parametros_precificacao
  (grupo, chave, descricao, valor_json, unidade, requer_aprovacao_kalebe, vigente_de)
VALUES
  ('fotovoltaico', 'fv_matriz_margem_kwp',
   'Matriz de margem % por tipo de projeto e faixa de potência instalada. Célula NULL usa margem_contribuicao_perc global como fallback.',
   '{
     "faixas": [
       {"min": 0,   "max": 5,    "rotulo": "Residencial pequeno"},
       {"min": 5,   "max": 10,   "rotulo": "Residencial médio"},
       {"min": 10,  "max": 30,   "rotulo": "Comercial pequeno"},
       {"min": 30,  "max": 75,   "rotulo": "Comercial grande"},
       {"min": 75,  "max": 9999, "rotulo": "Mini-GD / usina"}
     ],
     "por_tipo": {
       "fv_ongrid":    [null, null, null, null, null],
       "fv_hibrido":   [null, null, null, null, null],
       "fv_zero_grid": [null, null, null, null, null],
       "fv_offgrid":   [null, null, null, null, null]
     }
   }'::jsonb,
   '%', true, current_date)

ON CONFLICT (chave, vigente_de) DO NOTHING;

COMMIT;

-- DOWN:
-- BEGIN;
--   DELETE FROM public.parametros_precificacao
--    WHERE chave = 'fv_matriz_margem_kwp';
-- COMMIT;
