-- ═══════════════════════════════════════════════════════════════════════
-- Migration 082 — Parâmetros de mão de obra auxiliar (diária)
--
-- Kalebe pediu 2026-08-25: 'na precificação deve existir o campo
-- quantidade de profissionais que puxa informações na precificação tanto
-- para alvenaria, quanto elétrica predial'.
--
-- Vai em parametros_precificacao (grupo 'mao_obra') pra reutilizar em
-- vários fluxos: estação VE, padrão de entrada, retrofit, etc.
-- ═══════════════════════════════════════════════════════════════════════

INSERT INTO public.parametros_precificacao
  (grupo, chave, descricao, valor_numero, unidade, valor_minimo, valor_maximo, requer_aprovacao_kalebe)
VALUES
  ('mao_obra', 'valor_diaria_alvenaria',
   'Custo de 1 profissional de alvenaria por dia (pedreiro + servente médio)',
   250.00, 'R$/dia', 100.00, 800.00, false),
  ('mao_obra', 'valor_diaria_eletrica_predial',
   'Custo de 1 profissional de elétrica predial por dia (eletricista qualificado)',
   350.00, 'R$/dia', 150.00, 1200.00, false)
ON CONFLICT (chave) DO NOTHING;
