-- ═══════════════════════════════════════════════════════════════════════
-- Migration 083 — Parâmetro de deslocamento: R$/km rodado
--
-- Kalebe pediu 2026-08-25: 'outro ponto é o sistema calcular a distância
-- e aplicar 2,5 km rodado' — deslocamento SPIN até cliente entra na
-- precificação da estação de recarga VE (e reutilizável em outros fluxos).
--
-- Fórmula: total = km_ida × 2 (ida+volta) × valor_km_rodado
-- Cidade → busca automática em cidades_distancia (SPIN → cidade cliente).
--
-- Padrão idempotente (UNIQUE composta é chave+vigente_de).
-- ═══════════════════════════════════════════════════════════════════════

INSERT INTO public.parametros_precificacao
  (grupo, chave, descricao, valor_numero, unidade, valor_minimo, valor_maximo, requer_aprovacao_kalebe)
SELECT
  'deslocamento', 'valor_km_rodado',
  'Custo por km rodado em deslocamento (aplicado × 2 pra ida+volta)',
  2.50, 'R$/km', 1.00, 10.00, false
WHERE NOT EXISTS (
  SELECT 1 FROM public.parametros_precificacao
  WHERE chave = 'valor_km_rodado' AND vigente_ate IS NULL
);
