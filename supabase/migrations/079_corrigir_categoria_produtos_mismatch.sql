-- ============================================================================
-- Migration 079 — Corrige produtos com categoria manifestamente errada
-- ============================================================================
-- CONTEXTO
-- A migration 078 só reclassificou quem tinha subcategoria vazia. Mas
-- Kalebe apontou em 2026-08-22 que a categoria 'placa' tinha entrada de
-- Luna (bateria Huawei), monitoramento, frete — cadastros errados de
-- muito antes que a 078 não pegou porque a subcategoria já estava
-- preenchida (com valor incoerente).
--
-- Esta migration é MAIS AGRESSIVA — sobrescreve categoria+subcategoria
-- quando o modelo/nome bate INEQUIVOCAMENTE com outra família, mesmo
-- que subcategoria atual esteja preenchida. Só cobre padrões que não
-- deixam dúvida (Luna=bateria, CFW=bombeamento, frete=frete, etc).
-- ============================================================================

CREATE OR REPLACE VIEW public._produtos_texto AS
SELECT
  id, categoria, subcategoria,
  lower(coalesce(specs->>'descricao','') || ' ' || coalesce(descricao_curta,'') || ' ' ||
        coalesce(modelo,'') || ' ' || coalesce(codigo_weg,'')) AS texto,
  lower(coalesce(modelo,'')) AS modelo_lc,
  lower(coalesce(codigo_weg,'')) AS codigo_lc
FROM public.produtos;

-- ─── 1. LUNA (bateria Huawei) — mover pra bateria/bess ────────────────────
UPDATE public.produtos p
SET categoria = 'bateria'::categoria_principal, subcategoria = 'bess'
FROM public._produtos_texto t
WHERE p.id = t.id
  AND t.modelo_lc ~ '^luna|luna2000|luna 2000'
  AND p.categoria != 'bateria';

-- ─── 2. SBW/BCW/BSCW (bateria WEG BESS) — mover pra bateria/bess ─────────
UPDATE public.produtos p
SET categoria = 'bateria'::categoria_principal, subcategoria = 'bess'
FROM public._produtos_texto t
WHERE p.id = t.id
  AND t.modelo_lc ~ '^(sbw|bcw|bscw)'
  AND p.categoria != 'bateria';

-- ─── 3. CFW (inversor bombeamento) — mover pra inversor/bombeamento ──────
UPDATE public.produtos p
SET categoria = 'inversor'::categoria_principal, subcategoria = 'inversor_bombeamento'
FROM public._produtos_texto t
WHERE p.id = t.id
  AND t.modelo_lc ~ '^cfw'
  AND p.subcategoria != 'inversor_bombeamento';

-- ─── 4. FRETE / CIF / RETIRADA ────────────────────────────────────────────
UPDATE public.produtos p
SET categoria = 'frete'::categoria_principal, subcategoria = 'frete'
FROM public._produtos_texto t
WHERE p.id = t.id
  AND t.texto ~ '\mfrete\M|\mcif\M|\mretirada\M|\mcoleta\M'
  AND p.categoria != 'frete';

-- ─── 5. EMBOX / DONGLE / EDGE / SMARTLOGGER — mover pra monitoramento ────
UPDATE public.produtos p
SET categoria = 'monitoramento'::categoria_principal, subcategoria = 'controlador'
FROM public._produtos_texto t
WHERE p.id = t.id
  AND t.modelo_lc ~ '^(embox|edge box|smartlogger|dongle|smart dongle)'
  AND p.categoria != 'monitoramento';

-- ─── 6. WEMOB / WALLBOX — mover pra outro/ve_wallbox ─────────────────────
UPDATE public.produtos p
SET categoria = 'outro'::categoria_principal, subcategoria = 've_wallbox'
FROM public._produtos_texto t
WHERE p.id = t.id
  AND (t.modelo_lc ~ '^wemob' OR t.texto ~ 'wallbox|estação (de )?recarga|recarga (ve|veíc|veic|elétr|eletr)')
  AND NOT (p.categoria = 'outro' AND p.subcategoria = 've_wallbox');

-- ─── 7. DTSU/DDSU/MMW (medidor) — mover pra smart_meter ──────────────────
UPDATE public.produtos p
SET categoria = 'smart_meter'::categoria_principal, subcategoria = 'medidor'
FROM public._produtos_texto t
WHERE p.id = t.id
  AND (t.modelo_lc ~ '^(dtsu|ddsu|mmw)' OR t.texto ~ 'multimedidor|smart meter|analisador de rede')
  AND p.categoria != 'smart_meter';

-- ─── 8. Placas mal cadastradas — se está como 'placa' mas o modelo/nome
--       claramente NÃO menciona módulo/wp/bifacial, joga pra outro/sem_categoria
--       (o vendedor reclassifica manualmente depois — melhor sumir da lista
--       de placas do que continuar aparecendo errado)
UPDATE public.produtos p
SET categoria = 'outro'::categoria_principal, subcategoria = 'sem_categoria'
FROM public._produtos_texto t
WHERE p.id = t.id
  AND p.categoria = 'placa'
  AND NOT (t.texto ~ 'módulo|modulo|monofacial|bifacial|topcon|percm|heterojun|células|celulas|wp\M|placa (solar|fotov)|painel (solar|fotov)')
  AND NOT (t.modelo_lc ~ 'wp$|w$');   -- protege placas com nome tipo "615 Wp"

-- ─── 9. Inversores mal cadastrados — se está como 'inversor' mas o modelo
--       não bate padrão conhecido (SIW/CFW/nem "inversor" no texto), move
--       pra outro/sem_categoria pra parar de poluir a lista de inversores
UPDATE public.produtos p
SET categoria = 'outro'::categoria_principal, subcategoria = 'sem_categoria'
FROM public._produtos_texto t
WHERE p.id = t.id
  AND p.categoria = 'inversor'
  AND NOT (t.modelo_lc ~ '^(siw|cfw)' OR t.texto ~ 'inversor|microinversor|otimizador');

-- Limpa view auxiliar
DROP VIEW IF EXISTS public._produtos_texto;

-- Auditoria final — cole também no SQL Editor pra ver quantos foram
-- movidos por família:
--
-- SELECT categoria, subcategoria, COUNT(*)
-- FROM public.produtos
-- WHERE ativo = true
-- GROUP BY 1, 2
-- ORDER BY 1, 2;
