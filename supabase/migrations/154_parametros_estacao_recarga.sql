-- ═══════════════════════════════════════════════════════════════════════
-- Migration 154 — Parâmetros da proposta de estação de recarga
--
-- Kalebe 2026-10-14: a proposta da estação segue a ordem equipamentos →
-- projeto → execução; materiais elétricos com distância padrão de 5 m até
-- o ponto de conexão; execução com 2 instaladores ("dois instaladores
-- levam 2 horas"); intervenção na alvenaria acrescenta 1 dia dos 2.
-- Projeto = diagramas unifilar + trifilar (parâmetros já existentes);
-- imposto = aliquota_simples_perc sobre a nota Spin; margem e comissão
-- = margem_contribuicao_perc e comissao_vendedor_perc.
--
-- UNIQUE da tabela é (chave, vigente_de) — padrão idempotente com
-- INSERT ... SELECT ... WHERE NOT EXISTS (igual à 082).
-- ═══════════════════════════════════════════════════════════════════════

INSERT INTO public.parametros_precificacao
  (grupo, chave, descricao, valor_numero, unidade, valor_minimo, valor_maximo, requer_aprovacao_kalebe)
SELECT 've_recarga', 've_instaladores',
  'Estação de recarga: instaladores na execução',
  2, 'pessoas', 1, 6, false
WHERE NOT EXISTS (SELECT 1 FROM public.parametros_precificacao WHERE chave = 've_instaladores' AND vigente_ate IS NULL);

INSERT INTO public.parametros_precificacao
  (grupo, chave, descricao, valor_numero, unidade, valor_minimo, valor_maximo, requer_aprovacao_kalebe)
SELECT 've_recarga', 've_horas_instalacao_por_carregador',
  'Estação de recarga: horas dos instaladores por carregador numa instalação padrão',
  2, 'h', 0.5, 24, false
WHERE NOT EXISTS (SELECT 1 FROM public.parametros_precificacao WHERE chave = 've_horas_instalacao_por_carregador' AND vigente_ate IS NULL);

INSERT INTO public.parametros_precificacao
  (grupo, chave, descricao, valor_numero, unidade, valor_minimo, valor_maximo, requer_aprovacao_kalebe)
SELECT 've_recarga', 've_horas_por_diaria',
  'Estação de recarga: horas de uma diária (converte valor_diaria_eletrica_predial em R$/hora)',
  8, 'h', 4, 12, false
WHERE NOT EXISTS (SELECT 1 FROM public.parametros_precificacao WHERE chave = 've_horas_por_diaria' AND vigente_ate IS NULL);

INSERT INTO public.parametros_precificacao
  (grupo, chave, descricao, valor_numero, unidade, valor_minimo, valor_maximo, requer_aprovacao_kalebe)
SELECT 've_recarga', 've_dias_extra_alvenaria',
  'Estação de recarga: dias a mais dos instaladores quando há intervenção na alvenaria',
  1, 'dias', 0, 10, false
WHERE NOT EXISTS (SELECT 1 FROM public.parametros_precificacao WHERE chave = 've_dias_extra_alvenaria' AND vigente_ate IS NULL);

INSERT INTO public.parametros_precificacao
  (grupo, chave, descricao, valor_numero, unidade, valor_minimo, valor_maximo, requer_aprovacao_kalebe)
SELECT 've_recarga', 've_distancia_padrao_m',
  'Estação de recarga: distância padrão até o ponto de conexão (materiais elétricos)',
  5, 'm', 1, 200, false
WHERE NOT EXISTS (SELECT 1 FROM public.parametros_precificacao WHERE chave = 've_distancia_padrao_m' AND vigente_ate IS NULL);

SELECT chave, valor_numero, unidade FROM public.parametros_precificacao
WHERE grupo = 've_recarga' AND vigente_ate IS NULL ORDER BY chave;
