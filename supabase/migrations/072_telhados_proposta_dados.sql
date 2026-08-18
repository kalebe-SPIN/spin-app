-- ============================================================================
-- Migration 072 — Proposta ao vivo no card do telhado
-- ============================================================================
-- O vendedor abre o card na coluna Proposta e o simulador de limpeza fica
-- embutido no modal. Cada mudança recalcula ao vivo. Ao salvar, todo o
-- snapshot (entradas + resultado) fica em telhados.proposta_dados.
--
-- Guardar em JSONB (não colunas separadas) porque:
--   • Estrutura evolui rápido (Kalebe vai ajustar campos ao longo do uso)
--   • É um snapshot no tempo — se depois mudar preço, a proposta salva
--     mantém o valor que o cliente foi cotado
--   • Não precisamos filtrar/agregar por campos específicos
--
-- Aplicar via Supabase Dashboard > SQL Editor.
-- ============================================================================

BEGIN;

ALTER TABLE public.telhados
  ADD COLUMN IF NOT EXISTS proposta_dados        jsonb,
  ADD COLUMN IF NOT EXISTS proposta_valor        numeric(10, 2),
  ADD COLUMN IF NOT EXISTS proposta_atualizada_em timestamptz;

COMMENT ON COLUMN public.telhados.proposta_dados IS
  'Snapshot completo da proposta: { entradas: EntradasLimpeza, resultado: ResultadoLimpeza }. '
  'JSONB porque a estrutura evolui — colunas separadas engessariam.';

COMMENT ON COLUMN public.telhados.proposta_valor IS
  'Cache do subtotal da proposta pra ordenação/filtro rápido sem parsear o JSON.';

COMMENT ON COLUMN public.telhados.proposta_atualizada_em IS
  'Quando a proposta foi gerada/atualizada pela última vez.';

COMMIT;
