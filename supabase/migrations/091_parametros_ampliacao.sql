-- ═══════════════════════════════════════════════════════════════════════
-- Migration 091 — Parâmetros de projeto + mão de obra pra AMPLIAÇÃO
--
-- Kalebe já rodou no banco (2026-08-28). Arquivo recriado pra manter
-- rastreio do histórico.
--
-- Nota importante: no código atual (lib/precificacao/calcular.ts) o modo
-- ampliação usa os MESMOS valores de projeto e instalação do sistema
-- completo — Kalebe reverteu: 'não muda os valores, só quero que sejam
-- adicionados na precificação'. Esses 2 parâmetros ficam disponíveis
-- no banco pra uso futuro caso a regra mude e a Spin passe a cobrar
-- valores próprios de ampliação.
--
-- Padrão idempotente (UNIQUE composta chave+vigente_de).
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
