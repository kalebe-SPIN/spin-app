-- ============================================================================
-- Migration 080 — Reclassifica "falsas placas" (smart home + rapid shutdown)
-- ============================================================================
-- CONTEXTO
-- A regex da 078/079 pra placa fotovoltaica pegava "Módulo" isolado, o que
-- capturava por engano "Módulo Dimmer Wi-Fi", "Módulo Interruptor Wi-Fi +
-- RF", "Módulo Relé Cortina Wi-Fi" (smart home) e "Módulo de Teste RSDW01"
-- (rapid shutdown WEG). Kalebe apontou em 2026-08-22.
--
-- Esta 080 corrige agressivamente os padrões óbvios que continuam errados.
-- ============================================================================

CREATE OR REPLACE VIEW public._produtos_texto AS
SELECT
  id, categoria, subcategoria,
  lower(coalesce(specs->>'descricao','') || ' ' || coalesce(descricao_curta,'') || ' ' ||
        coalesce(modelo,'') || ' ' || coalesce(codigo_weg,'')) AS texto,
  lower(coalesce(modelo,'')) AS modelo_lc,
  lower(coalesce(codigo_weg,'')) AS codigo_lc
FROM public.produtos;

-- ─── 1. RAPID SHUTDOWN (RSDW01, "Módulo de Teste RSDW") ──────────────────
UPDATE public.produtos p
SET categoria = 'outro'::categoria_principal, subcategoria = 'rapid_shutdown'
FROM public._produtos_texto t
WHERE p.id = t.id
  AND (t.modelo_lc ~ '^rsdw|rsdw0|rsdw ' OR t.texto ~ 'rapid shutdown|\mrsd\M')
  AND NOT (p.categoria = 'outro' AND p.subcategoria = 'rapid_shutdown');

-- ─── 2. SMART HOME (Wi-Fi, dimmer, interruptor, relé cortina, plugue,
--       tomada inteligente, sensor, controle remoto, câmera) ───────────────
UPDATE public.produtos p
SET categoria = 'outro'::categoria_principal, subcategoria = 'smart_home'
FROM public._produtos_texto t
WHERE p.id = t.id
  AND (
    t.texto ~ 'wi-?fi|wifi'
    OR t.texto ~ '\mdimmer\M'
    OR t.texto ~ 'interruptor'
    OR t.texto ~ 'relé cortina|rele cortina'
    OR t.texto ~ 'plugue (intelig|smart)'
    OR t.texto ~ 'tomada (intelig|smart)'
    OR t.texto ~ 'sensor (movimento|presença|fumaça|abertura)'
    OR t.texto ~ 'controle remoto'
    OR t.texto ~ 'câmera|camera (ip|smart|intelig)'
  )
  AND NOT (p.categoria = 'outro' AND p.subcategoria = 'smart_home')
  -- Preserva quem já está numa categoria específica correta:
  AND p.categoria NOT IN ('cabo_cc', 'cabo_ca', 'estrutura', 'disjuntor', 'dps');

-- ─── 3. PLACA fotovoltaica de verdade — reafirma pros que RESTARAM na
--       categoria 'placa' após a limpeza. Placa real bate padrões
--       específicos (Wp, monofacial, bifacial, topcon, percm, etc) —
--       nunca só "Módulo" no nome. ──────────────────────────────────────
--
-- Se depois das etapas 1 e 2 ainda sobrou algum item em categoria='placa'
-- que não bate padrão de placa fotovoltaica, joga pra outro/sem_categoria
-- pra você reclassificar manualmente.
UPDATE public.produtos p
SET categoria = 'outro'::categoria_principal, subcategoria = 'sem_categoria'
FROM public._produtos_texto t
WHERE p.id = t.id
  AND p.categoria = 'placa'
  AND NOT (
    t.texto ~ 'monofacial|bifacial|topcon|perc|heterojun|\d+\s*wp\M|vidro duplo|células|celulas'
    OR t.modelo_lc ~ '^\d{2,4}\s?wp|^ja |^longi|^trina|^canadian|^jinko|^risen|^era |^wpv|^jam|^ja_'
  );

DROP VIEW IF EXISTS public._produtos_texto;

-- Auditoria: verificar categoria='placa' pós-limpeza (deve mostrar só
-- placas de verdade). Cola separado no SQL Editor:
--
-- SELECT codigo_weg, modelo, subcategoria
-- FROM public.produtos
-- WHERE categoria = 'placa' AND ativo = true
-- ORDER BY modelo;
