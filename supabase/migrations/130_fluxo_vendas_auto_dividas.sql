-- Kalebe 2026-09-30: fluxo de caixa
--   1) Vendas entram sozinhas no fluxo; aqui fica o padrão do kit nessas
--      vendas automáticas (faturado direto ao cliente = não passa pelo caixa).
--   2) Passivo bancário e DÍVIDAS: valor de face, valor negociado (desconto
--      obtido = face − negociado) e histórico de renegociações.

-- 1) Padrão do kit nas vendas automáticas
ALTER TABLE public.fluxo_config
  ADD COLUMN IF NOT EXISTS kit_passa_caixa_padrao boolean NOT NULL DEFAULT false;

-- 2) Dívidas: face × negociado × renegociações
ALTER TABLE public.fluxo_passivos
  ADD COLUMN IF NOT EXISTS valor_face      numeric(14,2),
  ADD COLUMN IF NOT EXISTS valor_negociado numeric(14,2),
  ADD COLUMN IF NOT EXISTS renegociacoes   jsonb NOT NULL DEFAULT '[]';

ALTER TABLE public.fluxo_passivos DROP CONSTRAINT IF EXISTS fluxo_passivos_modalidade_check;
ALTER TABLE public.fluxo_passivos ADD CONSTRAINT fluxo_passivos_modalidade_check CHECK (modalidade IN (
  'acordo_renegociacao', 'antecipacao_recebiveis', 'capital_giro_bancario', 'cartao_credito', 'cheque_especial',
  'consorcio', 'divida_fornecedor', 'emprestimo', 'financiamento', 'outro', 'parcelamento_tributos'));

-- Conferência
SELECT
  (SELECT kit_passa_caixa_padrao FROM public.fluxo_config LIMIT 1) AS kit_passa_caixa_padrao,
  (SELECT count(*) FROM public.fluxo_passivos) AS contratos;
