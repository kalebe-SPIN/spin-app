-- ═══════════════════════════════════════════════════════════════════════
-- Migration 084 — Parâmetros de valor do Diagrama Unifilar/Trifilar
--
-- Kalebe pediu 2026-08-26: os diagramas devem compor a precificação
-- (como serviço) e aparecer citados na descrição da proposta VE.
-- Padrão idempotente (UNIQUE composta é chave+vigente_de).
-- ═══════════════════════════════════════════════════════════════════════

INSERT INTO public.parametros_precificacao
  (grupo, chave, descricao, valor_numero, unidade, valor_minimo, valor_maximo, requer_aprovacao_kalebe)
SELECT
  'diagramas', 'valor_diagrama_unifilar',
  'Valor cobrado pelo Diagrama Unifilar da instalação (documento técnico)',
  350.00, 'R$', 100.00, 2000.00, false
WHERE NOT EXISTS (
  SELECT 1 FROM public.parametros_precificacao
  WHERE chave = 'valor_diagrama_unifilar' AND vigente_ate IS NULL
);

INSERT INTO public.parametros_precificacao
  (grupo, chave, descricao, valor_numero, unidade, valor_minimo, valor_maximo, requer_aprovacao_kalebe)
SELECT
  'diagramas', 'valor_diagrama_trifilar',
  'Valor cobrado pelo Diagrama Trifilar da instalação (documento técnico)',
  250.00, 'R$', 100.00, 2000.00, false
WHERE NOT EXISTS (
  SELECT 1 FROM public.parametros_precificacao
  WHERE chave = 'valor_diagrama_trifilar' AND vigente_ate IS NULL
);
