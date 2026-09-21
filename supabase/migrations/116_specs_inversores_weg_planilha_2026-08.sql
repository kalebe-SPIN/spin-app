-- Migration 116 — Specs oficiais WEG (planilha 2026-08 R0) — 54 inversores
-- Kalebe 2026-09-19: planilha nova deslocou colunas. Este UPDATE grava
-- direto os specs corretos dos SIW por modelo. Preserva outras specs.

BEGIN;

-- SIW100G M010 W00 (microinversor)
UPDATE produtos SET specs = coalesce(specs, '{}'::jsonb) || jsonb_build_object('potencia_kw', 1, 'fases', 'monofasico', 'tensao_nominal_v', 220, 'entradas_mppt', 2, 'disjuntor_equivalente', '16'), subcategoria = 'microinversor' WHERE modelo = 'SIW100G M010 W00' AND categoria = 'inversor';

-- SIW100G M024 W10 (microinversor)
UPDATE produtos SET specs = coalesce(specs, '{}'::jsonb) || jsonb_build_object('potencia_kw', 2.4, 'fases', 'monofasico', 'tensao_nominal_v', 220, 'entradas_mppt', 4, 'disjuntor_equivalente', '20'), subcategoria = 'microinversor' WHERE modelo = 'SIW100G M024 W10' AND categoria = 'inversor';

-- SIW300H M060 W00 (inversor_hibrido)
UPDATE produtos SET specs = coalesce(specs, '{}'::jsonb) || jsonb_build_object('potencia_kw', 6, 'fases', 'monofasico', 'tensao_nominal_v', 220, 'entradas_mppt', 2, 'disjuntor_equivalente', '50', 'string_box_recomendada', 'SB-2E/4E-2S-600DC'), subcategoria = 'inversor_hibrido' WHERE modelo = 'SIW300H M060 W00' AND categoria = 'inversor';

-- SIW300H M075 W00 (inversor_hibrido)
UPDATE produtos SET specs = coalesce(specs, '{}'::jsonb) || jsonb_build_object('potencia_kw', 7.5, 'fases', 'monofasico', 'tensao_nominal_v', 220, 'entradas_mppt', 3, 'disjuntor_equivalente', '80', 'string_box_recomendada', 'SB-2E/4E-2S-600DC'), subcategoria = 'inversor_hibrido' WHERE modelo = 'SIW300H M075 W00' AND categoria = 'inversor';

-- SIW300H M080 W00 (inversor_hibrido)
UPDATE produtos SET specs = coalesce(specs, '{}'::jsonb) || jsonb_build_object('potencia_kw', 8, 'fases', 'monofasico', 'tensao_nominal_v', 220, 'entradas_mppt', 3, 'disjuntor_equivalente', '80', 'string_box_recomendada', 'SB-2E/4E-2S-600DC'), subcategoria = 'inversor_hibrido' WHERE modelo = 'SIW300H M080 W00' AND categoria = 'inversor';

-- SIW300 M100 W00 (inversor_string)
UPDATE produtos SET specs = coalesce(specs, '{}'::jsonb) || jsonb_build_object('potencia_kw', 10, 'fases', 'monofasico', 'tensao_nominal_v', 220, 'entradas_mppt', 3, 'disjuntor_equivalente', '80', 'string_box_recomendada', 'SB-2E/4E-2S-600DC'), subcategoria = 'inversor_string' WHERE modelo = 'SIW300 M100 W00' AND categoria = 'inversor';

-- SIW500H T012 W00 (inversor_hibrido)
UPDATE produtos SET specs = coalesce(specs, '{}'::jsonb) || jsonb_build_object('potencia_kw', 12, 'fases', 'trifasico', 'tensao_nominal_v', 380, 'entradas_mppt', 4, 'disjuntor_equivalente', '32', 'string_box_recomendada', 'SB-2E/4E-2S-2X20A-1010V'), subcategoria = 'inversor_hibrido' WHERE modelo = 'SIW500H T012 W00' AND categoria = 'inversor';

-- SIW500H T015 W00 (inversor_hibrido)
UPDATE produtos SET specs = coalesce(specs, '{}'::jsonb) || jsonb_build_object('potencia_kw', 15, 'fases', 'trifasico', 'tensao_nominal_v', 380, 'entradas_mppt', 4, 'disjuntor_equivalente', '40', 'string_box_recomendada', 'SB-2E/4E-2S-2X20A-1010V'), subcategoria = 'inversor_hibrido' WHERE modelo = 'SIW500H T015 W00' AND categoria = 'inversor';

-- SIW500H T020 W00 (inversor_hibrido)
UPDATE produtos SET specs = coalesce(specs, '{}'::jsonb) || jsonb_build_object('potencia_kw', 20, 'fases', 'trifasico', 'tensao_nominal_v', 380, 'entradas_mppt', 4, 'disjuntor_equivalente', '63', 'string_box_recomendada', 'SB-2E/4E-2S-2X20A-1010V'), subcategoria = 'inversor_hibrido' WHERE modelo = 'SIW500H T020 W00' AND categoria = 'inversor';

-- SIW500H T025 W00 (inversor_hibrido)
UPDATE produtos SET specs = coalesce(specs, '{}'::jsonb) || jsonb_build_object('potencia_kw', 25, 'fases', 'trifasico', 'tensao_nominal_v', 380, 'entradas_mppt', 4, 'disjuntor_equivalente', '80', 'string_box_recomendada', 'SB-2E/4E-2S-2X20A-1010V'), subcategoria = 'inversor_hibrido' WHERE modelo = 'SIW500H T025 W00' AND categoria = 'inversor';

-- SIW500H ST030 M3 (inversor_hibrido)
UPDATE produtos SET specs = coalesce(specs, '{}'::jsonb) || jsonb_build_object('potencia_kw', 30, 'fases', 'trifasico', 'tensao_nominal_v', 380, 'entradas_mppt', 8, 'disjuntor_equivalente', '100', 'string_box_recomendada', 'SB-2E/4E-2S-2X20A-1010V'), subcategoria = 'inversor_hibrido' WHERE modelo = 'SIW500H ST030 M3' AND categoria = 'inversor';

-- SIW500H ST040 M3 (inversor_hibrido)
UPDATE produtos SET specs = coalesce(specs, '{}'::jsonb) || jsonb_build_object('potencia_kw', 40, 'fases', 'trifasico', 'tensao_nominal_v', 380, 'entradas_mppt', 8, 'disjuntor_equivalente', '125', 'string_box_recomendada', 'SB-2E/4E-2S-2X20A-1010V'), subcategoria = 'inversor_hibrido' WHERE modelo = 'SIW500H ST040 M3' AND categoria = 'inversor';

-- SIW500G T075 W00 (inversor_string)
UPDATE produtos SET specs = coalesce(specs, '{}'::jsonb) || jsonb_build_object('potencia_kw', 75, 'fases', 'trifasico', 'tensao_nominal_v', 380, 'entradas_mppt', 20, 'disjuntor_codigo_weg', 'DWB160B160-3DF', 'string_box_recomendada', 'SB-2E/4E-2S-2X20A-1010V'), subcategoria = 'inversor_string' WHERE modelo = 'SIW500G T075 W00' AND categoria = 'inversor';

-- SIW500G T100 W00 (inversor_string)
UPDATE produtos SET specs = coalesce(specs, '{}'::jsonb) || jsonb_build_object('potencia_kw', 100, 'fases', 'trifasico', 'tensao_nominal_v', 380, 'entradas_mppt', 20, 'disjuntor_codigo_weg', 'DWB250B200-3DF', 'string_box_recomendada', 'SB-2E/4E-2S-2X20A-1010V'), subcategoria = 'inversor_string' WHERE modelo = 'SIW500G T100 W00' AND categoria = 'inversor';

-- SIW500G K050 W00 (inversor_string)
UPDATE produtos SET specs = coalesce(specs, '{}'::jsonb) || jsonb_build_object('potencia_kw', 50, 'fases', 'trifasico', 'tensao_nominal_v', 220, 'entradas_mppt', 21, 'disjuntor_codigo_weg', 'DWB250B200-3DF', 'string_box_recomendada', 'SB-2E/4E-2S-2X20A-1010V'), subcategoria = 'inversor_string' WHERE modelo = 'SIW500G K050 W00' AND categoria = 'inversor';

-- SIW500G K075 W00 (inversor_string)
UPDATE produtos SET specs = coalesce(specs, '{}'::jsonb) || jsonb_build_object('potencia_kw', 75, 'fases', 'trifasico', 'tensao_nominal_v', 220, 'entradas_mppt', 21, 'disjuntor_codigo_weg', 'DWB250B250-3DF', 'string_box_recomendada', 'SB-2E/4E-2S-2X20A-1010V'), subcategoria = 'inversor_string' WHERE modelo = 'SIW500G K075 W00' AND categoria = 'inversor';

-- SIW500G H250 W0 (inversor_string)
UPDATE produtos SET specs = coalesce(specs, '{}'::jsonb) || jsonb_build_object('potencia_kw', 250, 'fases', 'trifasico', 'tensao_nominal_v', 800, 'entradas_mppt', 28, 'disjuntor_codigo_weg', 'FUSIVEL NH aR FNH3-400S-A08', 'string_box_recomendada', 'SECCIONADORA VERTICAL SF FSW400-3 V PV'), subcategoria = 'inversor_string' WHERE modelo = 'SIW500G H250 W0' AND categoria = 'inversor';

-- SIW200G M030 W1 (inversor_string)
UPDATE produtos SET specs = coalesce(specs, '{}'::jsonb) || jsonb_build_object('potencia_kw', 3, 'fases', 'monofasico', 'tensao_nominal_v', 220, 'entradas_mppt', 2, 'disjuntor_equivalente', '40', 'string_box_recomendada', 'SB-2E/4E-2S-600DC'), subcategoria = 'inversor_string' WHERE modelo = 'SIW200G M030 W1' AND categoria = 'inversor';

-- SIW200G M050 W1 (inversor_string)
UPDATE produtos SET specs = coalesce(specs, '{}'::jsonb) || jsonb_build_object('potencia_kw', 5, 'fases', 'monofasico', 'tensao_nominal_v', 220, 'entradas_mppt', 2, 'disjuntor_equivalente', '40', 'string_box_recomendada', 'SB-2E/4E-2S-600DC'), subcategoria = 'inversor_string' WHERE modelo = 'SIW200G M050 W1' AND categoria = 'inversor';

-- SIW200G M060 W1 (inversor_string)
UPDATE produtos SET specs = coalesce(specs, '{}'::jsonb) || jsonb_build_object('potencia_kw', 6, 'fases', 'monofasico', 'tensao_nominal_v', 220, 'entradas_mppt', 2, 'disjuntor_equivalente', '50', 'string_box_recomendada', 'SB-2E/4E-2S-600DC'), subcategoria = 'inversor_string' WHERE modelo = 'SIW200G M060 W1' AND categoria = 'inversor';

-- SIW200G M075 W1 (inversor_string)
UPDATE produtos SET specs = coalesce(specs, '{}'::jsonb) || jsonb_build_object('potencia_kw', 7.5, 'fases', 'monofasico', 'tensao_nominal_v', 220, 'entradas_mppt', 3, 'disjuntor_equivalente', '63', 'string_box_recomendada', 'SB-2E/4E-2S-600DC'), subcategoria = 'inversor_string' WHERE modelo = 'SIW200G M075 W1' AND categoria = 'inversor';

-- SIW200G M080 W1 (inversor_string)
UPDATE produtos SET specs = coalesce(specs, '{}'::jsonb) || jsonb_build_object('potencia_kw', 8, 'fases', 'monofasico', 'tensao_nominal_v', 220, 'entradas_mppt', 3, 'disjuntor_equivalente', '80', 'string_box_recomendada', 'SB-2E/4E-2S-600DC'), subcategoria = 'inversor_string' WHERE modelo = 'SIW200G M080 W1' AND categoria = 'inversor';

-- SIW200G M090 W1 (inversor_string)
UPDATE produtos SET specs = coalesce(specs, '{}'::jsonb) || jsonb_build_object('potencia_kw', 9, 'fases', 'monofasico', 'tensao_nominal_v', 220, 'entradas_mppt', 3, 'disjuntor_equivalente', '80', 'string_box_recomendada', 'SB-2E/4E-2S-600DC'), subcategoria = 'inversor_string' WHERE modelo = 'SIW200G M090 W1' AND categoria = 'inversor';

-- SIW200G M105 W1 (inversor_string)
UPDATE produtos SET specs = coalesce(specs, '{}'::jsonb) || jsonb_build_object('potencia_kw', 10.5, 'fases', 'monofasico', 'tensao_nominal_v', 220, 'entradas_mppt', 3, 'disjuntor_equivalente', '80', 'string_box_recomendada', 'SB-2E/4E-2S-600DC'), subcategoria = 'inversor_string' WHERE modelo = 'SIW200G M105 W1' AND categoria = 'inversor';

-- SIW400G T012 W1 (inversor_string)
UPDATE produtos SET specs = coalesce(specs, '{}'::jsonb) || jsonb_build_object('potencia_kw', 12, 'fases', 'trifasico', 'tensao_nominal_v', 380, 'entradas_mppt', 2, 'disjuntor_equivalente', '32', 'string_box_recomendada', 'SB-2E/4E-2S-2X20A-1010V'), subcategoria = 'inversor_string' WHERE modelo = 'SIW400G T012 W1' AND categoria = 'inversor';

-- SIW400G T015 W1 (inversor_string)
UPDATE produtos SET specs = coalesce(specs, '{}'::jsonb) || jsonb_build_object('potencia_kw', 15, 'fases', 'trifasico', 'tensao_nominal_v', 380, 'entradas_mppt', 4, 'disjuntor_equivalente', '40', 'string_box_recomendada', 'SB-2E/4E-2S-2X20A-1010V'), subcategoria = 'inversor_string' WHERE modelo = 'SIW400G T015 W1' AND categoria = 'inversor';

-- SIW400G T020 W1 (inversor_string)
UPDATE produtos SET specs = coalesce(specs, '{}'::jsonb) || jsonb_build_object('potencia_kw', 20, 'fases', 'trifasico', 'tensao_nominal_v', 380, 'entradas_mppt', 4, 'disjuntor_equivalente', '63', 'string_box_recomendada', 'SB-2E/4E-2S-2X20A-1010V'), subcategoria = 'inversor_string' WHERE modelo = 'SIW400G T020 W1' AND categoria = 'inversor';

-- SIW400G T025 W1 (inversor_string)
UPDATE produtos SET specs = coalesce(specs, '{}'::jsonb) || jsonb_build_object('potencia_kw', 25, 'fases', 'trifasico', 'tensao_nominal_v', 380, 'entradas_mppt', 4, 'disjuntor_equivalente', '63', 'string_box_recomendada', 'SB-2E/4E-2S-2X20A-1010V'), subcategoria = 'inversor_string' WHERE modelo = 'SIW400G T025 W1' AND categoria = 'inversor';

-- SIW400G T050 W00 (inversor_string)
UPDATE produtos SET specs = coalesce(specs, '{}'::jsonb) || jsonb_build_object('potencia_kw', 50, 'fases', 'trifasico', 'tensao_nominal_v', 380, 'entradas_mppt', 8, 'disjuntor_codigo_weg', 'DWB160B100-3DF', 'string_box_recomendada', 'SB-2E/4E-2S-2X20A-1010V'), subcategoria = 'inversor_string' WHERE modelo = 'SIW400G T050 W00' AND categoria = 'inversor';

-- SIW400G T060 W00 (inversor_string)
UPDATE produtos SET specs = coalesce(specs, '{}'::jsonb) || jsonb_build_object('potencia_kw', 60, 'fases', 'trifasico', 'tensao_nominal_v', 380, 'entradas_mppt', 12, 'disjuntor_codigo_weg', 'DWB160B125-3DF', 'string_box_recomendada', 'SB-2E/4E-2S-2X20A-1010V'), subcategoria = 'inversor_string' WHERE modelo = 'SIW400G T060 W00' AND categoria = 'inversor';

-- SIW400G T075 W01 (inversor_string)
UPDATE produtos SET specs = coalesce(specs, '{}'::jsonb) || jsonb_build_object('potencia_kw', 75, 'fases', 'trifasico', 'tensao_nominal_v', 380, 'entradas_mppt', 12, 'disjuntor_codigo_weg', 'DWB160B160-3DF', 'string_box_recomendada', 'SB-2E/4E-2S-2X20A-1010V'), subcategoria = 'inversor_string' WHERE modelo = 'SIW400G T075 W01' AND categoria = 'inversor';

-- SIW400G T100 W0 (inversor_string)
UPDATE produtos SET specs = coalesce(specs, '{}'::jsonb) || jsonb_build_object('potencia_kw', 100, 'fases', 'trifasico', 'tensao_nominal_v', 380, 'entradas_mppt', 18, 'disjuntor_codigo_weg', 'DWB250B200-3DF', 'string_box_recomendada', 'SB-2E/4E-2S-2X20A-1010V'), subcategoria = 'inversor_string' WHERE modelo = 'SIW400G T100 W0' AND categoria = 'inversor';

-- SIW400G K015 W00 (inversor_string)
UPDATE produtos SET specs = coalesce(specs, '{}'::jsonb) || jsonb_build_object('potencia_kw', 15, 'fases', 'trifasico', 'tensao_nominal_v', 220, 'entradas_mppt', 8, 'disjuntor_equivalente', '80', 'string_box_recomendada', 'SB-2E/4E-2S-2X20A-1010V'), subcategoria = 'inversor_string' WHERE modelo = 'SIW400G K015 W00' AND categoria = 'inversor';

-- SIW400G K020 W00 (inversor_string)
UPDATE produtos SET specs = coalesce(specs, '{}'::jsonb) || jsonb_build_object('potencia_kw', 20, 'fases', 'trifasico', 'tensao_nominal_v', 220, 'entradas_mppt', 8, 'disjuntor_equivalente', '100', 'string_box_recomendada', 'SB-2E/4E-2S-2X20A-1010V'), subcategoria = 'inversor_string' WHERE modelo = 'SIW400G K020 W00' AND categoria = 'inversor';

-- SIW400G K025 W00 (inversor_string)
UPDATE produtos SET specs = coalesce(specs, '{}'::jsonb) || jsonb_build_object('potencia_kw', 25, 'fases', 'trifasico', 'tensao_nominal_v', 220, 'entradas_mppt', 8, 'disjuntor_equivalente', '125', 'string_box_recomendada', 'SB-2E/4E-2S-2X20A-1010V'), subcategoria = 'inversor_string' WHERE modelo = 'SIW400G K025 W00' AND categoria = 'inversor';

-- SIW400G K030 W00 (inversor_string)
UPDATE produtos SET specs = coalesce(specs, '{}'::jsonb) || jsonb_build_object('potencia_kw', 30, 'fases', 'trifasico', 'tensao_nominal_v', 220, 'entradas_mppt', 8, 'disjuntor_codigo_weg', 'DWB160B125-3DF', 'string_box_recomendada', 'SB-2E/4E-2S-2X20A-1010V'), subcategoria = 'inversor_string' WHERE modelo = 'SIW400G K030 W00' AND categoria = 'inversor';

-- SIW400G K037 W00 (inversor_string)
UPDATE produtos SET specs = coalesce(specs, '{}'::jsonb) || jsonb_build_object('potencia_kw', 37, 'fases', 'trifasico', 'tensao_nominal_v', 220, 'entradas_mppt', 8, 'disjuntor_codigo_weg', 'DWB160B125-3DF', 'string_box_recomendada', 'SB-2E/4E-2S-2X20A-1010V'), subcategoria = 'inversor_string' WHERE modelo = 'SIW400G K037 W00' AND categoria = 'inversor';

-- SIW420G K025 W00 (inversor_string)
UPDATE produtos SET specs = coalesce(specs, '{}'::jsonb) || jsonb_build_object('potencia_kw', 25, 'fases', 'trifasico', 'tensao_nominal_v', 220, 'entradas_mppt', 8, 'disjuntor_equivalente', '125', 'string_box_recomendada', 'SB-2E/4E-2S-2X20A-1010V'), subcategoria = 'inversor_string' WHERE modelo = 'SIW420G K025 W00' AND categoria = 'inversor';

-- SIW420G K075 W00 (inversor_string)
UPDATE produtos SET specs = coalesce(specs, '{}'::jsonb) || jsonb_build_object('potencia_kw', 75, 'fases', 'trifasico', 'tensao_nominal_v', 220, 'entradas_mppt', 18, 'disjuntor_codigo_weg', 'DWB250B250-3DF', 'string_box_recomendada', 'SB-2E/4E-2S-2X20A-1010V'), subcategoria = 'inversor_string' WHERE modelo = 'SIW420G K075 W00' AND categoria = 'inversor';

-- SIW610 T075 W0 (inversor_string)
UPDATE produtos SET specs = coalesce(specs, '{}'::jsonb) || jsonb_build_object('potencia_kw', 75, 'fases', 'trifasico', 'tensao_nominal_v', 380, 'entradas_mppt', 12, 'disjuntor_codigo_weg', 'DWB160B160-3DF', 'string_box_recomendada', 'SB-2E/4E-2S-2X20A-1010V'), subcategoria = 'inversor_string' WHERE modelo = 'SIW610 T075 W0' AND categoria = 'inversor';

-- SIW610 T018 W0 (inversor_string)
UPDATE produtos SET specs = coalesce(specs, '{}'::jsonb) || jsonb_build_object('potencia_kw', 18, 'fases', 'trifasico', 'tensao_nominal_v', 380, 'entradas_mppt', 4, 'disjuntor_equivalente', '63', 'string_box_recomendada', 'SB-2E/4E-2S-2X20A-1010V'), subcategoria = 'inversor_string' WHERE modelo = 'SIW610 T018 W0' AND categoria = 'inversor';

-- SIW200H M050 W00 (inversor_hibrido)
UPDATE produtos SET specs = coalesce(specs, '{}'::jsonb) || jsonb_build_object('potencia_kw', 5, 'fases', 'monofasico', 'tensao_nominal_v', 220, 'entradas_mppt', 2, 'disjuntor_equivalente', '40', 'string_box_recomendada', 'SB-2E/4E-2S-600DC'), subcategoria = 'inversor_hibrido' WHERE modelo = 'SIW200H M050 W00' AND categoria = 'inversor';

-- SIW200H M075 W10 (inversor_hibrido)
UPDATE produtos SET specs = coalesce(specs, '{}'::jsonb) || jsonb_build_object('potencia_kw', 7.5, 'fases', 'monofasico', 'tensao_nominal_v', 220, 'entradas_mppt', 3, 'disjuntor_equivalente', '80', 'string_box_recomendada', 'SB-2E/4E-2S-600DC'), subcategoria = 'inversor_hibrido' WHERE modelo = 'SIW200H M075 W10' AND categoria = 'inversor';

-- SIW200H M105 W10 (inversor_hibrido)
UPDATE produtos SET specs = coalesce(specs, '{}'::jsonb) || jsonb_build_object('potencia_kw', 10.5, 'fases', 'monofasico', 'tensao_nominal_v', 220, 'entradas_mppt', 4, 'disjuntor_equivalente', '80', 'string_box_recomendada', 'SB-2E/4E-2S-600DC'), subcategoria = 'inversor_hibrido' WHERE modelo = 'SIW200H M105 W10' AND categoria = 'inversor';

-- SIW200H S057 W20 (inversor_hibrido)
UPDATE produtos SET specs = coalesce(specs, '{}'::jsonb) || jsonb_build_object('potencia_kw', 5.7, 'fases', 'monofasico', 'tensao_nominal_v', 220, 'entradas_mppt', 3, 'disjuntor_equivalente', '40'), subcategoria = 'inversor_hibrido' WHERE modelo = 'SIW200H S057 W20' AND categoria = 'inversor';

-- SIW200H S075 W20 (inversor_hibrido)
UPDATE produtos SET specs = coalesce(specs, '{}'::jsonb) || jsonb_build_object('potencia_kw', 7.5, 'fases', 'monofasico', 'tensao_nominal_v', 220, 'entradas_mppt', 3, 'disjuntor_equivalente', '63'), subcategoria = 'inversor_hibrido' WHERE modelo = 'SIW200H S075 W20' AND categoria = 'inversor';

-- SIW200H S114 W20 (inversor_hibrido)
UPDATE produtos SET specs = coalesce(specs, '{}'::jsonb) || jsonb_build_object('potencia_kw', 11.4, 'fases', 'monofasico', 'tensao_nominal_v', 220, 'entradas_mppt', 5, 'disjuntor_equivalente', '80'), subcategoria = 'inversor_hibrido' WHERE modelo = 'SIW200H S114 W20' AND categoria = 'inversor';

-- SIW400H T015 W20 (inversor_hibrido)
UPDATE produtos SET specs = coalesce(specs, '{}'::jsonb) || jsonb_build_object('potencia_kw', 15, 'fases', 'trifasico', 'tensao_nominal_v', 380, 'entradas_mppt', 6, 'disjuntor_equivalente', '40'), subcategoria = 'inversor_hibrido' WHERE modelo = 'SIW400H T015 W20' AND categoria = 'inversor';

-- SIW400H T030 W20 (inversor_hibrido)
UPDATE produtos SET specs = coalesce(specs, '{}'::jsonb) || jsonb_build_object('potencia_kw', 30, 'fases', 'trifasico', 'tensao_nominal_v', 380, 'entradas_mppt', 6, 'disjuntor_equivalente', '100'), subcategoria = 'inversor_hibrido' WHERE modelo = 'SIW400H T030 W20' AND categoria = 'inversor';

-- SIW400H T050 W30 (inversor_hibrido)
UPDATE produtos SET specs = coalesce(specs, '{}'::jsonb) || jsonb_build_object('potencia_kw', 50, 'fases', 'trifasico', 'tensao_nominal_v', 380, 'entradas_mppt', 4), subcategoria = 'inversor_hibrido' WHERE modelo = 'SIW400H T050 W30' AND categoria = 'inversor';

-- SIW400H T075 W30 (inversor_hibrido)
UPDATE produtos SET specs = coalesce(specs, '{}'::jsonb) || jsonb_build_object('potencia_kw', 75, 'fases', 'trifasico', 'tensao_nominal_v', 380, 'entradas_mppt', 8), subcategoria = 'inversor_hibrido' WHERE modelo = 'SIW400H T075 W30' AND categoria = 'inversor';

-- SIW400H T125 W30 (inversor_hibrido)
UPDATE produtos SET specs = coalesce(specs, '{}'::jsonb) || jsonb_build_object('potencia_kw', 125, 'fases', 'trifasico', 'tensao_nominal_v', 380, 'entradas_mppt', 8), subcategoria = 'inversor_hibrido' WHERE modelo = 'SIW400H T125 W30' AND categoria = 'inversor';

-- SIW400H K008 W20 (inversor_hibrido)
UPDATE produtos SET specs = coalesce(specs, '{}'::jsonb) || jsonb_build_object('potencia_kw', 8, 'fases', 'trifasico', 'tensao_nominal_v', 220, 'entradas_mppt', 6, 'disjuntor_equivalente', '40'), subcategoria = 'inversor_hibrido' WHERE modelo = 'SIW400H K008 W20' AND categoria = 'inversor';

-- SIW400H K017 W20 (inversor_hibrido)
UPDATE produtos SET specs = coalesce(specs, '{}'::jsonb) || jsonb_build_object('potencia_kw', 17, 'fases', 'trifasico', 'tensao_nominal_v', 220, 'entradas_mppt', 6, 'disjuntor_equivalente', '100'), subcategoria = 'inversor_hibrido' WHERE modelo = 'SIW400H K017 W20' AND categoria = 'inversor';

COMMIT;