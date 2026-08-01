-- ============================================================================
-- Migration 059 — Complementa parâmetros de precificação FOTOVOLTAICA
-- ============================================================================
-- A mig 004 já semeou TUDO que rege orçamento formal: margem, comissão,
-- projeto+ART, frete, impostos, descontos, limites, financiamento, fator WEG,
-- tabela instalação. Aqui completo apenas as chaves específicas que o
-- Orçamento Rápido (mig 058) precisa ler pra estimar em 30s.
--
-- Contexto Kalebe 2026-07-31: R$/kWp e potência de placa estavam hardcoded
-- e chutados em lib/orcamento-rapido/tipos.ts. Movendo pra banco pra ele
-- editar via UI (task #48 — Painel de Controle Precificação).
--
-- Idempotente (ON CONFLICT DO NOTHING) — pode rodar múltiplas vezes.
-- ============================================================================

BEGIN;

-- ═════════════════════════════════════════════════════════════════════════════
-- FAIXAS DE R$/kWp POR PORTE (Orçamento Rápido)
-- ═════════════════════════════════════════════════════════════════════════════
-- Valores NULL — Kalebe preenche via UI admin. Enquanto NULL, código cai
-- no fallback de lib/orcamento-rapido/tipos.ts (com warning nos logs).

INSERT INTO public.parametros_precificacao
  (grupo, chave, descricao, valor_json, unidade, requer_aprovacao_kalebe, vigente_de)
VALUES
  ('fotovoltaico', 'fv_faixas_preco_kwp',
   'Faixas de R$/kWp instalado (chave-em-mão) por porte. Usado no Orçamento Rápido pra estimar valor final em 30s antes de visita técnica. O código lê a primeira faixa onde kwp_estimado ∈ [min, max) e usa o preco_kwp. Se NULL, cai no fallback do código.',
   '[
     {"min_kwp": 0,    "max_kwp": 5,     "preco_kwp": null, "descricao": "Residencial pequeno"},
     {"min_kwp": 5,    "max_kwp": 10,    "preco_kwp": null, "descricao": "Residencial médio"},
     {"min_kwp": 10,   "max_kwp": 30,    "preco_kwp": null, "descricao": "Comercial pequeno"},
     {"min_kwp": 30,   "max_kwp": 75,    "preco_kwp": null, "descricao": "Comercial grande"},
     {"min_kwp": 75,   "max_kwp": 9999,  "preco_kwp": null, "descricao": "Mini-GD / usina"}
   ]'::jsonb,
   'R$/kWp por faixa', true, current_date)

ON CONFLICT (chave, vigente_de) DO NOTHING;

-- ═════════════════════════════════════════════════════════════════════════════
-- PARÂMETROS TÉCNICOS DE DIMENSIONAMENTO (Orçamento Rápido)
-- ═════════════════════════════════════════════════════════════════════════════

INSERT INTO public.parametros_precificacao
  (grupo, chave, descricao, valor_numero, unidade, valor_minimo, valor_maximo, requer_aprovacao_kalebe, vigente_de)
VALUES
  ('fotovoltaico', 'fv_preco_kwh_celesc_medio',
   'Preço médio kWh CELESC (TE + TUSD + bandeira + impostos). Usado no Orçamento Rápido quando cliente informa R$/mês pra converter em kWh. Varia mensal — atualizar quando bandeira mudar.',
   0.75, 'R$/kWh', 0.50, 1.20, false, current_date),

  ('fotovoltaico', 'fv_fator_perda_sistema',
   'Fator de perdas totais do sistema (cabeamento + sombreamento + temperatura + sujeira). Multiplicador aplicado sobre horas de sol × 30 dias no dimensionamento kWp.',
   0.85, 'decimal', 0.70, 0.95, false, current_date),

  ('fotovoltaico', 'fv_potencia_padrao_modulo_wp',
   'Potência do módulo padrão (Wp) quando o consultor ainda não escolheu placa específica. Deve refletir a placa mais popular ATIVA do catálogo WEG (verificar antes de mudar).',
   615, 'Wp', 400, 750, false, current_date)

ON CONFLICT (chave, vigente_de) DO NOTHING;

COMMIT;

-- ============================================================================
-- CHAVES QUE JÁ EXISTEM (mig 004) — NÃO duplicar aqui, editar via UI admin:
-- ============================================================================
-- margem.margem_contribuicao_perc        (20%)
-- margem.margem_minima_negociacao_perc   (15%, requer aprovação)
-- comissao.comissao_vendedor_perc        (5%)
-- comissao.cashback_indicador_perc       (2%)
-- projeto.projeto_valor_fixo_ate_30kwp   (R$ 400)
-- projeto.projeto_rs_por_kwp_acima_30kwp (R$ 30/kWp)
-- frete.frete_ate_16_placas              (R$ 300)
-- frete.frete_acima_16_placas            (R$ 600)
-- frete.frete_km_extra_fora_raio         (R$ 2,80/km)
-- impostos.aliquota_simples_perc         (6%, requer aprovação)
-- impostos.iss_municipal_perc            (2%, requer aprovação)
-- descontos.desconto_pix_perc            (5%)
-- descontos.desconto_ted_boleto_perc     (3%)
-- descontos.desconto_indicacao_perc      (2%)
-- descontos.desconto_recorrente_perc     (3%)
-- limites.prazo_validade_orcamento_dias  (15 dias)
-- limites.valor_minimo_orcamento_rs      (R$ 3.000, requer aprovação)
-- limites.max_parcelas_cartao            (18x)
-- limites.max_parcelas_financiamento     (72x)
-- financiamento.taxa_juros_perc_mes_estimada  (1,49%/mês)
-- kit_weg.fator_kit_weg_preco_cliente    (0,4182 — desconto WEG integrador)
-- instalacao.tabela_instalacao_rs_placa  (5 faixas R$/placa)
-- ============================================================================

-- DOWN:
-- BEGIN;
--   DELETE FROM public.parametros_precificacao
--    WHERE grupo = 'fotovoltaico'
--      AND chave IN ('fv_faixas_preco_kwp', 'fv_preco_kwh_celesc_medio',
--                    'fv_fator_perda_sistema', 'fv_potencia_padrao_modulo_wp');
-- COMMIT;
