-- ============================================================================
-- Migration 070 — Apelido do telhado no CRM
-- ============================================================================
-- Endereços genéricos ("Rua Açaí, 17") são difíceis do vendedor lembrar.
-- Apelido opcional serve como rótulo mnemônico do card ("Marmoraria Tijucas",
-- "Padaria da Esquina", "Prédio Amarelo em Centro"). Vira o TÍTULO do card
-- no Kanban; endereço fica como subtítulo.
--
-- Aplicar via Supabase Dashboard > SQL Editor.
-- ============================================================================

BEGIN;

ALTER TABLE public.telhados
  ADD COLUMN IF NOT EXISTS apelido text;

COMMENT ON COLUMN public.telhados.apelido IS
  'Rótulo mnemônico do vendedor pra identificar o card rapidamente. '
  'Se preenchido, vira o título do card no Kanban (fallback: endereço).';

COMMIT;
