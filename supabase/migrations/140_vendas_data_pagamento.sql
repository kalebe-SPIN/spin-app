-- ============================================================================
-- Migration 140 — Data do pagamento na venda manual
-- ============================================================================
-- Kalebe 2026-10-06: "campo de data da venda e data de pagamento ao cadastrar
-- a venda". Nas vendas do sistema a data fica em
-- projetos.orcamento_consolidado.venda_fechada (data_venda / data_pagamento,
-- sem coluna nova). Na venda manual: coluna própria. O fluxo de caixa lança o
-- recebimento na data do pagamento (vazio = na data da venda).
-- Idempotente.
-- ============================================================================

ALTER TABLE public.vendas_manuais ADD COLUMN IF NOT EXISTS data_pagamento date;

SELECT column_name FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'vendas_manuais' AND column_name = 'data_pagamento';
