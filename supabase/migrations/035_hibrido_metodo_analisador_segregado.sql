-- ============================================================================
-- Migration 035: Novo método analisador segregado na carga crítica
-- ============================================================================
-- Kalebe: pra carga crítica, a técnica MAIS PRECISA é segregar os disjuntores
-- daquilo que virará backup e instalar o analisador SÓ nesse ramal. Mede
-- exatamente o que o sistema precisará atender no modo off-grid.
--
-- Adiciona 'analisador_segregado_cc' ao CHECK constraint.
-- ============================================================================

ALTER TABLE public.projeto_hibrido_analise
  DROP CONSTRAINT IF EXISTS projeto_hibrido_analise_metodo_demanda_check;

ALTER TABLE public.projeto_hibrido_analise
  ADD CONSTRAINT projeto_hibrido_analise_metodo_demanda_check
  CHECK (metodo_demanda IN (
    'memoria_massa',
    'analise_rede_medido',
    'analisador_segregado_cc',
    'levantamento_listagem'
  ));

COMMENT ON COLUMN public.projeto_hibrido_analise.metodo_demanda IS
  'Fonte dos dados de demanda: memoria_massa (CELESC 12m) | analise_rede_medido (analisador ramal principal) | analisador_segregado_cc (analisador SÓ na carga crítica segregada) | levantamento_listagem (soma manual)';
