-- ============================================================================
-- Migration 078 — Reclassificar subcategoria dos ~500 produtos existentes
-- ============================================================================
-- CONTEXTO
-- Depois que ligamos o filtro por subcategoria na query de inversores solares
-- (commit 34bda8d), qualquer produto que ficou sem subcategoria caiu de fora
-- de vários fluxos (gerar kit, orçamento rápido, etc). Kalebe pediu 2026-08-22
-- pra passar de novo a lógica do importador WEG por cima do que já está
-- cadastrado.
--
-- SEGURO: só reclassifica onde a subcategoria atual é NULL / vazia / 'outro'
-- / 'sem_categoria'. Se Kalebe já ajustou manualmente algum item pra outra
-- subcategoria específica, não é sobrescrito.
--
-- ORDEM DE APLICAÇÃO IMPORTA — regras mais específicas primeiro:
--  1. microinversor antes de inversor_string
--  2. inversor_bombeamento (CFW) antes de inversor_string
--  3. bess/nobreak antes de outro
--  ... etc
-- ============================================================================

-- Helper: subcategoria "vazia o suficiente pra reclassificar"
-- (evita ficar repetindo o mesmo WHERE em cada UPDATE)
CREATE OR REPLACE FUNCTION public._sub_vazia(sub text) RETURNS boolean
LANGUAGE sql IMMUTABLE AS $$
  SELECT sub IS NULL OR sub = '' OR sub IN ('outro', 'sem_categoria')
$$;

-- Base de detecção: usa specs->>'descricao' (Tipo original da planilha
-- preservado no import) + descricao_curta + modelo + codigo_weg.
-- Todos em lower case pra comparação insensível a caixa.
CREATE OR REPLACE VIEW public._produtos_texto AS
SELECT
  id,
  categoria,
  subcategoria,
  lower(coalesce(specs->>'descricao', '') || ' ' ||
        coalesce(descricao_curta, '')     || ' ' ||
        coalesce(modelo, '')              || ' ' ||
        coalesce(codigo_weg, '')) AS texto,
  lower(coalesce(modelo, '')) AS modelo_lc,
  lower(coalesce(codigo_weg, '')) AS codigo_lc
FROM public.produtos;

-- ─── 1. MICROINVERSOR (SIW100 ou "micro" no nome) ─────────────────────────
UPDATE public.produtos p SET subcategoria = 'microinversor', categoria = 'inversor'
FROM public._produtos_texto t
WHERE p.id = t.id
  AND public._sub_vazia(t.subcategoria)
  AND (t.modelo_lc ~ '^siw100' OR t.texto ~ 'microinversor|micro-inversor');

-- ─── 2. INVERSOR BOMBEAMENTO (CFW = drive de motor pra bomba d'água) ─────
UPDATE public.produtos p SET subcategoria = 'inversor_bombeamento', categoria = 'inversor'
FROM public._produtos_texto t
WHERE p.id = t.id
  AND public._sub_vazia(t.subcategoria)
  AND (t.modelo_lc ~ '^cfw' OR t.codigo_lc ~ '^cfw' OR t.texto ~ 'bomba');

-- ─── 3. INVERSOR STRING SOLAR (SIW200/300/400/500) ────────────────────────
UPDATE public.produtos p SET subcategoria = 'inversor_string', categoria = 'inversor'
FROM public._produtos_texto t
WHERE p.id = t.id
  AND public._sub_vazia(t.subcategoria)
  AND (t.modelo_lc ~ '^siw(200|300|400|500|600)' OR t.texto ~ 'inversor.*(string|solar|fotovolt)');

-- ─── 4. MÓDULO FOTOVOLTAICO / PLACA ───────────────────────────────────────
UPDATE public.produtos p SET subcategoria = 'modulo_fotovoltaico', categoria = 'placa'
FROM public._produtos_texto t
WHERE p.id = t.id
  AND public._sub_vazia(t.subcategoria)
  AND (t.texto ~ 'módulo|modulo fotovol|monofacial|bifacial|placa (solar|fotov)|topcon|percm|heterojun');

-- ─── 5. BATERIA / BESS (SBW, BCW, BSCW) ───────────────────────────────────
UPDATE public.produtos p SET subcategoria = 'bess', categoria = 'bateria'
FROM public._produtos_texto t
WHERE p.id = t.id
  AND public._sub_vazia(t.subcategoria)
  AND (t.modelo_lc ~ '^(sbw|bscw|bcw|luna2000)' OR t.texto ~ 'bateria|cabine de bateria|banco de bateria');

-- ─── 6. NOBREAK ───────────────────────────────────────────────────────────
UPDATE public.produtos p SET subcategoria = 'nobreak', categoria = 'bateria'
FROM public._produtos_texto t
WHERE p.id = t.id
  AND public._sub_vazia(t.subcategoria)
  AND t.texto ~ 'nobreak|no-break|ups solar';

-- ─── 7. ESTRUTURA (kits, grampos, suportes, perfis) ───────────────────────
UPDATE public.produtos p SET
  subcategoria = CASE
    WHEN t.texto ~ 'telhado|ceramic|fibro|metal|colonial|trapez' THEN 'telhado'
    WHEN t.texto ~ 'laje|lage'                                    THEN 'laje'
    WHEN t.texto ~ 'solo|terreno'                                 THEN 'solo'
    ELSE 'acessorio'
  END,
  categoria = 'estrutura'
FROM public._produtos_texto t
WHERE p.id = t.id
  AND public._sub_vazia(t.subcategoria)
  AND t.texto ~ 'estrutura|kit p/ ?\d+ ?módul|kit para ?\d+ ?módul|^grampo|^suporte|^kit fix|perfil (alum|estr)';

-- ─── 8. CABOS (CC solar vs CA) ────────────────────────────────────────────
UPDATE public.produtos p SET
  subcategoria = 'cabo',
  categoria = (CASE
    WHEN t.texto ~ 'cabo (solar|fotov|cc|dc|módulo|modulo)' THEN 'cabo_cc'
    ELSE 'cabo_ca'
  END)::categoria_principal
FROM public._produtos_texto t
WHERE p.id = t.id
  AND public._sub_vazia(t.subcategoria)
  AND t.texto ~ '^cabo |cabo (elétr|eletr|solar|de energia|de força|de forca|flex)';

-- ─── 9. CONECTOR (MC4 e outros) ───────────────────────────────────────────
UPDATE public.produtos p SET subcategoria = 'conector'::categoria_principal, categoria = 'conector'
FROM public._produtos_texto t
WHERE p.id = t.id
  AND public._sub_vazia(t.subcategoria)
  AND (t.texto ~ '^conector|mc4|mc-4|terminal (compress|prens)');

-- ─── 10. DISJUNTOR (MDWH, MDWP, DTMDS, DZM) ───────────────────────────────
UPDATE public.produtos p SET subcategoria = 'disjuntor_ca', categoria = 'disjuntor'
FROM public._produtos_texto t
WHERE p.id = t.id
  AND public._sub_vazia(t.subcategoria)
  AND (t.modelo_lc ~ '^(mdwh|mdwp|mdw|dtmds|dzm|dwb)' OR t.texto ~ 'disjuntor|termomagn');

-- ─── 11. STRING BOX / CAIXA DE JUNÇÃO ─────────────────────────────────────
UPDATE public.produtos p SET subcategoria = 'stringbox_cc', categoria = 'string_box'
FROM public._produtos_texto t
WHERE p.id = t.id
  AND public._sub_vazia(t.subcategoria)
  AND (t.modelo_lc ~ '^sb-|^sbw' OR t.texto ~ 'string ?box');

UPDATE public.produtos p SET subcategoria = 'caixa_juncao', categoria = 'string_box'
FROM public._produtos_texto t
WHERE p.id = t.id
  AND public._sub_vazia(t.subcategoria)
  AND (t.modelo_lc ~ '^jbw' OR t.texto ~ 'caixa de junção|caixa de juncao');

-- ─── 12. DPS (protetor contra surtos) ─────────────────────────────────────
UPDATE public.produtos p SET subcategoria = 'dps'::categoria_principal, categoria = 'dps'
FROM public._produtos_texto t
WHERE p.id = t.id
  AND public._sub_vazia(t.subcategoria)
  AND t.texto ~ '\mdps\M|protetor (contra )?surto|protetor de surto|surge arrest';

-- ─── 13. FUSÍVEL ──────────────────────────────────────────────────────────
UPDATE public.produtos p SET subcategoria = 'fusivel', categoria = 'outro'
FROM public._produtos_texto t
WHERE p.id = t.id
  AND public._sub_vazia(t.subcategoria)
  AND t.texto ~ 'fusível|fusivel|base fusível|base fusivel';

-- ─── 14. QUADRO / ATS (SmartGuard, TBW) ───────────────────────────────────
UPDATE public.produtos p SET subcategoria = 'quadro_transferencia', categoria = 'quadro'
FROM public._produtos_texto t
WHERE p.id = t.id
  AND public._sub_vazia(t.subcategoria)
  AND (t.modelo_lc ~ '^(smartguard|tbw)' OR t.texto ~ 'quadro de transfer|ats solar|transfer switch');

-- ─── 15. MEDIDOR / SMART METER (DTSU, DDSU, MMW) ──────────────────────────
UPDATE public.produtos p SET subcategoria = 'medidor', categoria = 'smart_meter'
FROM public._produtos_texto t
WHERE p.id = t.id
  AND public._sub_vazia(t.subcategoria)
  AND (t.modelo_lc ~ '^(dtsu|ddsu|mmw)' OR t.texto ~ 'multimedidor|medidor de energia|smart meter|analisador');

-- ─── 16. CONTROLADOR / GATEWAY (EMBOX, EDGE BOX) ──────────────────────────
UPDATE public.produtos p SET subcategoria = 'controlador', categoria = 'monitoramento'
FROM public._produtos_texto t
WHERE p.id = t.id
  AND public._sub_vazia(t.subcategoria)
  AND (t.modelo_lc ~ '^(embox|edge)' OR t.texto ~ 'controlador|gateway|dongle|smart dongle');

-- ─── 17. RAPID SHUTDOWN (RSDW) ────────────────────────────────────────────
UPDATE public.produtos p SET subcategoria = 'rapid_shutdown', categoria = 'outro'
FROM public._produtos_texto t
WHERE p.id = t.id
  AND public._sub_vazia(t.subcategoria)
  AND (t.modelo_lc ~ '^rsdw' OR t.texto ~ 'rapid shutdown|rsd');

-- ─── 18. OTIMIZADOR ───────────────────────────────────────────────────────
UPDATE public.produtos p SET subcategoria = 'otimizador', categoria = 'inversor'
FROM public._produtos_texto t
WHERE p.id = t.id
  AND public._sub_vazia(t.subcategoria)
  AND t.texto ~ 'otimizador|dc optimizer|power optimizer';

-- ─── 19. WALLBOX / RECARGA VE (WEMOB) ─────────────────────────────────────
UPDATE public.produtos p SET subcategoria = 've_wallbox', categoria = 'outro'
FROM public._produtos_texto t
WHERE p.id = t.id
  AND public._sub_vazia(t.subcategoria)
  AND (t.modelo_lc ~ '^wemob' OR t.texto ~ 'wallbox|estação (de )?recarga|recarga (ve|veíc|veic|elétr|eletr)');

-- ─── 20. FRETE ────────────────────────────────────────────────────────────
UPDATE public.produtos p SET subcategoria = 'frete'::categoria_principal, categoria = 'frete'
FROM public._produtos_texto t
WHERE p.id = t.id
  AND public._sub_vazia(t.subcategoria)
  AND t.texto ~ 'frete|cif |retirada|coleta';

-- ─── 21. Fallback: qualquer coisa que sobrar sem subcategoria ─────────────
UPDATE public.produtos SET subcategoria = 'sem_categoria'
WHERE subcategoria IS NULL OR subcategoria = '';

-- Limpa view/função auxiliares
DROP VIEW IF EXISTS public._produtos_texto;
DROP FUNCTION IF EXISTS public._sub_vazia(text);

-- Relatório final (executar depois pra ver o efeito):
--
-- SELECT categoria, subcategoria, COUNT(*)
-- FROM public.produtos
-- GROUP BY 1, 2
-- ORDER BY 1, 2;
