-- Migration 099: limpar disjuntor_equivalente que veio capacitor (Kalebe 2026-09-01)
--
-- Diagnóstico: SIW200G M050 tinha specs.disjuntor_equivalente = 'BCWA30V53 D -V25
-- 480V / 30kVAr' (banco de capacitor 30 kVAr) — vindo da planilha WEG com dado
-- errado. O gerador de kits usava essa referência e escolhia o próprio BCWA
-- (R$ 31k) como disjuntor CA do sistema FV.
--
-- Fix: sanitizar toda spec.disjuntor_equivalente que comece com prefixo de
-- capacitor. Depois desse UPDATE, o gerador cai no dimensionamento por
-- corrente/polos e escolhe MDW/DWB corretamente.

UPDATE public.produtos
SET specs = specs - 'disjuntor_equivalente'
WHERE categoria = 'inversor'
  AND specs->>'disjuntor_equivalente' IS NOT NULL
  AND (
    specs->>'disjuntor_equivalente' ILIKE 'BC%' OR
    specs->>'disjuntor_equivalente' ILIKE 'TCP%' OR
    specs->>'disjuntor_equivalente' ILIKE 'BSMJ%' OR
    specs->>'disjuntor_equivalente' ILIKE 'CAP%' OR
    specs->>'disjuntor_equivalente' ILIKE 'BFR%' OR
    specs->>'disjuntor_equivalente' ILIKE 'BFC%' OR
    specs->>'disjuntor_equivalente' ILIKE 'BCF%'
  );

COMMENT ON COLUMN public.produtos.specs IS
  'JSONB. Chave disjuntor_equivalente pode vir NULL quando a planilha WEG traz capacitor por engano — sanitizado no import (route.ts:sanitizarDisjuntorEq).';
