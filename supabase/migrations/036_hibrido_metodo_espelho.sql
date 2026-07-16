-- ============================================================================
-- Migration 036: Método kit_direto_espelho (proposta concorrente)
-- ============================================================================
-- Kalebe: consultor às vezes só quer "espelhar" a proposta do concorrente —
-- já tem Pcc + Pca + kWh definidos e não precisa passar por análise de demanda.
-- Sistema monta a composição WEG direta, com paralelismo automático se
-- necessário e componentes obrigatórios (MMW03, JBW, EMBOX).
-- ============================================================================

ALTER TABLE public.projeto_hibrido_analise
  DROP CONSTRAINT IF EXISTS projeto_hibrido_analise_metodo_demanda_check;

ALTER TABLE public.projeto_hibrido_analise
  ADD CONSTRAINT projeto_hibrido_analise_metodo_demanda_check
  CHECK (metodo_demanda IN (
    'memoria_massa',
    'analise_rede_medido',
    'analisador_segregado_cc',
    'levantamento_listagem',
    'kit_direto_espelho'
  ));

COMMENT ON COLUMN public.projeto_hibrido_analise.metodo_demanda IS
  'Fonte dos dados de demanda: memoria_massa (CELESC 12m) | analise_rede_medido (analisador ramal principal) | analisador_segregado_cc (analisador SÓ na carga crítica) | levantamento_listagem (soma manual) | kit_direto_espelho (Pcc+Pca+kWh diretos — modo espelho concorrente)';
