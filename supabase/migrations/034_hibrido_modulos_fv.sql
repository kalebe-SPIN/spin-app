-- ============================================================================
-- Migration 034: Módulos FV no dimensionamento híbrido
-- ============================================================================
-- Correção do modelo (Kalebe): pra montar sistema híbrido precisamos de 3
-- grandezas do cliente:
--   1. CONSUMO mensal (kWh) → define potência CC (módulos FV)
--   2. CARGA CRÍTICA (kW) → define potência CA (inversor)
--   3. AUTONOMIA (h) → define baterias
--
-- Antes: dimensionador ignorava os módulos FV (só inversor + baterias).
-- Agora: calcula quantidade de módulos WEG baseado em Pcc = Consumo/(HSP×30×PR)
-- e valida FCI = Pcc/Pca × 100% (aceitável 100-130%).
-- ============================================================================

ALTER TABLE public.projeto_hibrido_dimensionamento
  ADD COLUMN IF NOT EXISTS consumo_mensal_kwh numeric(10,2),
  ADD COLUMN IF NOT EXISTS modulo_potencia_wp int,
  ADD COLUMN IF NOT EXISTS qtd_modulos int,
  ADD COLUMN IF NOT EXISTS potencia_cc_kwp numeric(6,2),
  ADD COLUMN IF NOT EXISTS geracao_mensal_estimada_kwh numeric(10,2),
  ADD COLUMN IF NOT EXISTS fci_percentual numeric(5,2);

COMMENT ON COLUMN public.projeto_hibrido_dimensionamento.consumo_mensal_kwh IS
  'Consumo mensal do cliente (da fatura CELESC). Define a quantidade de módulos FV.';
COMMENT ON COLUMN public.projeto_hibrido_dimensionamento.potencia_cc_kwp IS
  'Potência CC total dos módulos FV (kWp). Calculada: Consumo / (HSP × 30 × PR)';
COMMENT ON COLUMN public.projeto_hibrido_dimensionamento.fci_percentual IS
  'Fator de Carregamento CC/CA = Pcc/Pca × 100%. Faixa aceitável: 100-130%';
