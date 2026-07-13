-- ============================================================================
-- Migration 024: Dimensionamento sem fatura (orçamento rapido)
-- ============================================================================
-- Consultor pode criar projeto/proposta SEM fatura em PDF quando cliente
-- ainda nao compartilhou. Escolhe entre 3 modos:
--   1. qtd_placas: cliente disse "quero N placas"
--   2. geracao_anual: cliente falou geracao anual em kWh
--   3. geracao_media: consumo/geracao media mensal em kWh
-- ============================================================================

ALTER TABLE public.projetos
  ADD COLUMN IF NOT EXISTS origem_dimensionamento text CHECK (
    origem_dimensionamento IN ('fatura', 'qtd_placas', 'geracao_anual', 'geracao_media')
  ),
  ADD COLUMN IF NOT EXISTS qtd_placas_estimada int,
  ADD COLUMN IF NOT EXISTS geracao_anual_alvo_kwh numeric(12,2),
  ADD COLUMN IF NOT EXISTS geracao_media_alvo_kwh numeric(12,2),
  ADD COLUMN IF NOT EXISTS potencia_wp_placa_estimada int DEFAULT 605,
  ADD COLUMN IF NOT EXISTS hsp_estimado numeric(4,2) DEFAULT 4.5,
  ADD COLUMN IF NOT EXISTS observacao_sem_fatura text;

CREATE INDEX IF NOT EXISTS idx_projetos_origem_dim ON public.projetos(origem_dimensionamento);

COMMENT ON COLUMN public.projetos.origem_dimensionamento IS
  'Origem dos dados de dimensionamento: fatura (PDF analisado), qtd_placas, geracao_anual ou geracao_media.';
COMMENT ON COLUMN public.projetos.qtd_placas_estimada IS
  'Qtd de placas informada pelo cliente (quando origem = qtd_placas).';
COMMENT ON COLUMN public.projetos.geracao_anual_alvo_kwh IS
  'Geracao anual desejada em kWh (quando origem = geracao_anual).';
COMMENT ON COLUMN public.projetos.geracao_media_alvo_kwh IS
  'Consumo/geracao media mensal em kWh (quando origem = geracao_media).';
