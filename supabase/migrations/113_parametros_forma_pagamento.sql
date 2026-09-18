-- ============================================================================
-- Migration 113 — Parâmetros das formas de pagamento (grupo 'pagamento')
-- ============================================================================
-- Kalebe 2026-09-18: até aqui, à vista PIX (3%), 12× cartão (juros 8,99%) e
-- financiamento 60× (35–85%) estavam HARDCODED em lib/precificacao/calcular.ts
-- na função calcularFormasPagamento. Movendo pra parametros_precificacao
-- pra ele editar via admin quando as condições mudarem (banco reajustar juros,
-- promoção à vista maior, etc).
--
-- calcularFormasPagamento(total, params?) agora aceita params opcional — se
-- passado, lê essas chaves; senão, usa defaults iguais aos valores antigos
-- (retrocompatível).
--
-- Idempotente (ON CONFLICT DO NOTHING).
-- ============================================================================

BEGIN;

INSERT INTO public.parametros_precificacao
  (grupo, chave, descricao, valor_numero, unidade, valor_minimo, valor_maximo, requer_aprovacao_kalebe, vigente_de)
VALUES
  ('pagamento', 'desconto_a_vista_pix_perc',
   'Desconto oferecido quando cliente paga à vista via PIX. Aplicado sobre o PV final da proposta.',
   3.00, '%', 0.00, 15.00, false, current_date),

  ('pagamento', 'parcelas_cartao_padrao',
   'Número padrão de parcelas no cartão de crédito exibido na proposta.',
   12, 'x', 1, 24, false, current_date),

  ('pagamento', 'juros_cartao_total_perc',
   'Juros TOTAL do parcelamento no cartão (não é ao mês). Ex: 8,99% em 12x = valor_total do cartão × 1,0899. Reajustar quando o banco/adquirente mudar taxa.',
   8.99, '%', 0.00, 30.00, true, current_date),

  ('pagamento', 'parcelas_financiamento_padrao',
   'Número padrão de parcelas no financiamento bancário CDC solar exibido na proposta.',
   60, 'x', 12, 120, false, current_date),

  ('pagamento', 'financiamento_juros_min_perc',
   'Juros TOTAL do financiamento no cenário MÍNIMO (parcela menor). Ex: 35% em 60x = base × 1,35 / 60. Depende da taxa do banco.',
   35.00, '%', 10.00, 100.00, true, current_date),

  ('pagamento', 'financiamento_juros_max_perc',
   'Juros TOTAL do financiamento no cenário MÁXIMO (parcela maior). Ex: 85% em 60x = base × 1,85 / 60.',
   85.00, '%', 20.00, 200.00, true, current_date)

ON CONFLICT (chave, vigente_de) DO NOTHING;

COMMIT;

-- DOWN:
-- BEGIN;
--   DELETE FROM public.parametros_precificacao
--    WHERE grupo = 'pagamento'
--      AND chave IN ('desconto_a_vista_pix_perc', 'parcelas_cartao_padrao',
--                    'juros_cartao_total_perc', 'parcelas_financiamento_padrao',
--                    'financiamento_juros_min_perc', 'financiamento_juros_max_perc');
-- COMMIT;
