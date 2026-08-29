-- ═══════════════════════════════════════════════════════════════════════
-- Migration 091 — Parâmetros de projeto + mão de obra pra AMPLIAÇÃO
--
-- Kalebe 2026-08-28: modo ampliação (cliente já tem inversor, Spin cota
-- só placas + estrutura + cabo) precisa de valores próprios de mão de
-- obra e projeto, porque envolve:
--  - Redimensionar o inversor existente pra suportar as novas placas
--  - Reconfigurar strings + MPPTs
--  - Emitir nova ART considerando o sistema anterior + adição
--  - Cabeamento adicional integrado ao painel elétrico existente
-- Tudo isso é mais complexo que uma instalação nova, e o preço reflete.
--
-- Padrão idempotente (UNIQUE composto chave+vigente_de).
-- ═══════════════════════════════════════════════════════════════════════

-- Projeto + ART na ampliação (fixo)
INSERT INTO public.parametros_precificacao
  (grupo, chave, descricao, valor_numero, unidade, valor_minimo, valor_maximo, requer_aprovacao_kalebe)
SELECT 'ampliacao', 'projeto_valor_ampliacao',
  'Projeto + ART de ampliação (redimensiona inversor existente + emite ART considerando o sistema anterior)',
  800.00, 'R$', 300.00, 3000.00, false
WHERE NOT EXISTS (
  SELECT 1 FROM public.parametros_precificacao
  WHERE chave = 'projeto_valor_ampliacao' AND vigente_ate IS NULL
);

-- Instalação de ampliação por placa
INSERT INTO public.parametros_precificacao
  (grupo, chave, descricao, valor_numero, unidade, valor_minimo, valor_maximo, requer_aprovacao_kalebe)
SELECT 'ampliacao', 'instalacao_ampliacao_rs_por_placa',
  'R$/placa na ampliação (mexer no sistema existente, reconfigurar strings/MPPTs, integrar ao painel)',
  200.00, 'R$/placa', 100.00, 500.00, false
WHERE NOT EXISTS (
  SELECT 1 FROM public.parametros_precificacao
  WHERE chave = 'instalacao_ampliacao_rs_por_placa' AND vigente_ate IS NULL
);
