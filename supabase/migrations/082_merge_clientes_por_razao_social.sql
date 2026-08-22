-- ============================================================================
-- Migration 082 — Merge clientes duplicados por razão social
-- ============================================================================
-- CONTEXTO
-- A 081 mergia só por CPF. Kalebe rodou e apontou 2026-08-22 que os
-- "Kleber Furtado" continuavam duplicados — provavelmente cadastrados
-- sem CPF/CNPJ. Esta migration completa o merge usando razão social
-- (case-insensitive, com trim) como chave secundária.
--
-- REGRA DE SEGURANÇA:
-- Só une quando ambos têm o mesmo CPF, ou quando NENHUM tem CPF. Se
-- dois cadastros compartilham o nome mas têm CPFs diferentes, ficam
-- como estão — pra evitar fundir dois clientes reais homônimos.
-- ============================================================================

DO $$
DECLARE
  chave text;
  canonico uuid;
  dup uuid;
  cpf_canonico text;
BEGIN
  FOR chave IN
    SELECT lower(trim(razao_social)) FROM public.clientes
    GROUP BY lower(trim(razao_social)) HAVING COUNT(*) > 1
  LOOP
    SELECT id, cpf_cnpj INTO canonico, cpf_canonico
    FROM public.clientes
    WHERE lower(trim(razao_social)) = chave
    ORDER BY created_at ASC LIMIT 1;

    FOR dup IN
      SELECT id FROM public.clientes
      WHERE lower(trim(razao_social)) = chave
        AND id != canonico
        AND (
          (cpf_cnpj IS NULL AND cpf_canonico IS NULL)
          OR (cpf_cnpj = cpf_canonico)
        )
    LOOP
      UPDATE public.projetos            SET cliente_id = canonico WHERE cliente_id = dup;
      UPDATE public.projetos            SET titular_cliente_id = canonico WHERE titular_cliente_id = dup;
      UPDATE public.interacoes_cliente  SET cliente_id = canonico WHERE cliente_id = dup;
      UPDATE public.leads               SET cliente_id = canonico WHERE cliente_id = dup;
      UPDATE public.comissoes           SET cliente_id = canonico WHERE cliente_id = dup;
      DELETE FROM public.clientes WHERE id = dup;
    END LOOP;
  END LOOP;
END $$;

-- Backfill final: projetos ainda sem cliente_id
UPDATE public.projetos p
SET cliente_id = c.id
FROM public.clientes c
WHERE p.cliente_id IS NULL
  AND p.cliente_razao_social IS NOT NULL
  AND lower(trim(c.razao_social)) = lower(trim(p.cliente_razao_social));
