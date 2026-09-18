-- Specs oficiais dos inversores híbridos WEG extraídos dos datasheets R6/R02
-- do Kalebe (Downloads/DATASHEET_SIW*.pdf), setembro 2026.
--
-- Contexto: a planilha WEG nova entregue no import corrompeu specs de
-- híbridos (potência null, MPPT null, disjuntor com valores absurdos como
-- "3 A" pra 7,5 kW). Este UPDATE grava os valores oficiais do datasheet
-- por modelo (linha SIW200H, SIW300H, SIW500H), preservando outras chaves
-- em specs (usa `||` = jsonb concat, não substitui o objeto inteiro).
--
-- Fórmula do disjuntor equivalente: NBR 5410 — padrão comercial
-- imediatamente acima da corrente CA MÁXIMA do inversor.
--
-- Modelos SEM datasheet oficial em mão (SIW200H M050, SIW300H M075/M080,
-- SIW400H T015/T030/T050) NÃO foram tocados — o Kalebe precisa mandar
-- datasheet ou preencher à mão no /admin/catalogo.

-- =========================================================================
-- SIW200H — Inversor Híbrido MONOFÁSICO 220V (datasheet R6)
-- Modelos: M070/M075/M090/M100/M105 W10
-- =========================================================================

UPDATE produtos
SET specs = coalesce(specs, '{}'::jsonb) || jsonb_build_object(
  'potencia_kw', 7.0,
  'entradas_mppt', 3,
  'cordas_por_mppt', 1,
  'disjuntor_equivalente', '40',
  'tensao_nominal_v', 220,
  'corrente_ca_maxima_a', 33.5,
  'fases', 'monofasico'
)
WHERE modelo ILIKE 'SIW200H M070%'
  AND categoria = 'inversor';

UPDATE produtos
SET specs = coalesce(specs, '{}'::jsonb) || jsonb_build_object(
  'potencia_kw', 7.5,
  'entradas_mppt', 3,
  'cordas_por_mppt', 1,
  'disjuntor_equivalente', '40',
  'tensao_nominal_v', 220,
  'corrente_ca_maxima_a', 34.1,
  'fases', 'monofasico'
)
WHERE modelo ILIKE 'SIW200H M075%'
  AND categoria = 'inversor';

UPDATE produtos
SET specs = coalesce(specs, '{}'::jsonb) || jsonb_build_object(
  'potencia_kw', 9.0,
  'entradas_mppt', 4,
  'cordas_por_mppt', 1,
  'disjuntor_equivalente', '50',
  'tensao_nominal_v', 220,
  'corrente_ca_maxima_a', 43.0,
  'fases', 'monofasico'
)
WHERE modelo ILIKE 'SIW200H M090%'
  AND categoria = 'inversor';

UPDATE produtos
SET specs = coalesce(specs, '{}'::jsonb) || jsonb_build_object(
  'potencia_kw', 10.0,
  'entradas_mppt', 4,
  'cordas_por_mppt', 1,
  'disjuntor_equivalente', '63',
  'tensao_nominal_v', 220,
  'corrente_ca_maxima_a', 45.7,
  'fases', 'monofasico'
)
WHERE modelo ILIKE 'SIW200H M100%'
  AND categoria = 'inversor';

UPDATE produtos
SET specs = coalesce(specs, '{}'::jsonb) || jsonb_build_object(
  'potencia_kw', 10.5,
  'entradas_mppt', 4,
  'cordas_por_mppt', 1,
  'disjuntor_equivalente', '63',
  'tensao_nominal_v', 220,
  'corrente_ca_maxima_a', 47.7,
  'fases', 'monofasico'
)
WHERE modelo ILIKE 'SIW200H M105%'
  AND categoria = 'inversor';

-- =========================================================================
-- SIW300H — Inversor String Híbrido MONOFÁSICO 220V (datasheet W00)
-- Modelos: M030/M050/M060 W00
-- =========================================================================

UPDATE produtos
SET specs = coalesce(specs, '{}'::jsonb) || jsonb_build_object(
  'potencia_kw', 3.0,
  'entradas_mppt', 2,
  'cordas_por_mppt', 1,
  'disjuntor_equivalente', '20',
  'tensao_nominal_v', 220,
  'corrente_ca_maxima_a', 15.0,
  'fases', 'monofasico'
)
WHERE modelo ILIKE 'SIW300H M030%'
  AND categoria = 'inversor';

UPDATE produtos
SET specs = coalesce(specs, '{}'::jsonb) || jsonb_build_object(
  'potencia_kw', 5.0,
  'entradas_mppt', 2,
  'cordas_por_mppt', 1,
  'disjuntor_equivalente', '32',
  'tensao_nominal_v', 220,
  'corrente_ca_maxima_a', 25.0,
  'fases', 'monofasico'
)
WHERE modelo ILIKE 'SIW300H M050%'
  AND categoria = 'inversor';

UPDATE produtos
SET specs = coalesce(specs, '{}'::jsonb) || jsonb_build_object(
  'potencia_kw', 6.0,
  'entradas_mppt', 2,
  'cordas_por_mppt', 1,
  'disjuntor_equivalente', '32',
  'tensao_nominal_v', 220,
  'corrente_ca_maxima_a', 27.3,
  'fases', 'monofasico'
)
WHERE modelo ILIKE 'SIW300H M060%'
  AND categoria = 'inversor';

-- =========================================================================
-- SIW500H — Inversor OnGrid TRIFÁSICO 380V (datasheet R02)
-- Modelos: T012/T015/T017/T020/T025 W00
-- Nota: WEG classifica como "OnGrid Trifásico" no datasheet mas o
-- equipamento é compatível com baterias (SBW300), por isso o parser
-- classificou como híbrido — mantemos.
-- =========================================================================

UPDATE produtos
SET specs = coalesce(specs, '{}'::jsonb) || jsonb_build_object(
  'potencia_kw', 12.0,
  'entradas_mppt', 2,
  'cordas_por_mppt', 2,
  'disjuntor_equivalente', '25',
  'tensao_nominal_v', 380,
  'corrente_ca_maxima_a', 20.2,
  'fases', 'trifasico'
)
WHERE modelo ILIKE 'SIW500H T012%'
  AND categoria = 'inversor';

UPDATE produtos
SET specs = coalesce(specs, '{}'::jsonb) || jsonb_build_object(
  'potencia_kw', 15.0,
  'entradas_mppt', 2,
  'cordas_por_mppt', 2,
  'disjuntor_equivalente', '32',
  'tensao_nominal_v', 380,
  'corrente_ca_maxima_a', 25.2,
  'fases', 'trifasico'
)
WHERE modelo ILIKE 'SIW500H T015%'
  AND categoria = 'inversor';

UPDATE produtos
SET specs = coalesce(specs, '{}'::jsonb) || jsonb_build_object(
  'potencia_kw', 17.0,
  'entradas_mppt', 2,
  'cordas_por_mppt', 2,
  'disjuntor_equivalente', '32',
  'tensao_nominal_v', 380,
  'corrente_ca_maxima_a', 28.6,
  'fases', 'trifasico'
)
WHERE modelo ILIKE 'SIW500H T017%'
  AND categoria = 'inversor';

UPDATE produtos
SET specs = coalesce(specs, '{}'::jsonb) || jsonb_build_object(
  'potencia_kw', 20.0,
  'entradas_mppt', 2,
  'cordas_por_mppt', 2,
  'disjuntor_equivalente', '40',
  'tensao_nominal_v', 380,
  'corrente_ca_maxima_a', 33.6,
  'fases', 'trifasico'
)
WHERE modelo ILIKE 'SIW500H T020%'
  AND categoria = 'inversor';

UPDATE produtos
SET specs = coalesce(specs, '{}'::jsonb) || jsonb_build_object(
  'potencia_kw', 25.0,
  'entradas_mppt', 2,
  'cordas_por_mppt', 2,
  'disjuntor_equivalente', '50',
  'tensao_nominal_v', 380,
  'corrente_ca_maxima_a', 42.0,
  'fases', 'trifasico'
)
WHERE modelo ILIKE 'SIW500H T025%'
  AND categoria = 'inversor';

-- Verificação pós-migração:
-- SELECT modelo, subcategoria,
--   specs->>'potencia_kw' as pot,
--   specs->>'entradas_mppt' as mppt,
--   specs->>'disjuntor_equivalente' as disj,
--   specs->>'corrente_ca_maxima_a' as imax
-- FROM produtos
-- WHERE modelo ILIKE 'SIW200H%' OR modelo ILIKE 'SIW300H%' OR modelo ILIKE 'SIW500H%'
-- ORDER BY modelo;
