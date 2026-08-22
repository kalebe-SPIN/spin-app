-- ============================================================================
-- Migration 081 — Cliente único por CPF/CNPJ + merge de duplicatas + backfill
-- ============================================================================
-- CONTEXTO
-- Kalebe apontou 2026-08-22: "Kleber Furtado" aparecia como 3 projetos
-- separados sem agrupar. Regra fixa: um CPF/CNPJ = um cadastro. Novo
-- projeto pro mesmo CPF vira mais um item no card do cliente existente,
-- não cliente duplicado.
--
-- Esta migration:
--  1. Normaliza CPF/CNPJ (remove máscara) pra deduplicar corretamente
--  2. Faz merge de duplicatas (mesmo CPF) — mantém o mais antigo, migra
--     projetos/interações/leads/comissões dos outros pra ele, apaga os
--     órfãos
--  3. Backfill de projetos.cliente_id pelos que ainda estão null:
--     casa por cliente_cpf_cnpj > cliente_razao_social exato
--  4. UNIQUE parcial em cpf_cnpj (só onde não null e não vazio)
-- ============================================================================

-- ─── 1. Normaliza CPF/CNPJ removendo máscara ──────────────────────────────
UPDATE public.clientes
SET cpf_cnpj = regexp_replace(cpf_cnpj, '\D', '', 'g')
WHERE cpf_cnpj IS NOT NULL AND cpf_cnpj != '';

UPDATE public.projetos
SET cliente_cpf_cnpj = regexp_replace(cliente_cpf_cnpj, '\D', '', 'g')
WHERE cliente_cpf_cnpj IS NOT NULL AND cliente_cpf_cnpj != '';

-- Limpa strings vazias pra NULL
UPDATE public.clientes SET cpf_cnpj = NULL
WHERE cpf_cnpj IS NOT NULL AND cpf_cnpj = '';

UPDATE public.projetos SET cliente_cpf_cnpj = NULL
WHERE cliente_cpf_cnpj IS NOT NULL AND cliente_cpf_cnpj = '';

-- ─── 2. Merge de clientes duplicados por CPF ──────────────────────────────
-- Pra cada grupo de duplicatas, elege o "canônico" (mais antigo por
-- created_at) e migra dependentes dos demais pra ele. Depois apaga.
DO $$
DECLARE
  cpf text;
  canonico uuid;
  dup uuid;
BEGIN
  FOR cpf IN
    SELECT cpf_cnpj FROM public.clientes
    WHERE cpf_cnpj IS NOT NULL
    GROUP BY cpf_cnpj HAVING COUNT(*) > 1
  LOOP
    SELECT id INTO canonico FROM public.clientes
      WHERE cpf_cnpj = cpf ORDER BY created_at ASC LIMIT 1;

    FOR dup IN
      SELECT id FROM public.clientes
      WHERE cpf_cnpj = cpf AND id != canonico
    LOOP
      -- Migra dependentes (só as tabelas que hoje têm FK pra clientes)
      UPDATE public.projetos            SET cliente_id = canonico WHERE cliente_id = dup;
      UPDATE public.projetos            SET titular_cliente_id = canonico WHERE titular_cliente_id = dup;
      UPDATE public.interacoes_cliente  SET cliente_id = canonico WHERE cliente_id = dup;
      UPDATE public.leads               SET cliente_id = canonico WHERE cliente_id = dup;
      UPDATE public.comissoes           SET cliente_id = canonico WHERE cliente_id = dup;
      DELETE FROM public.clientes WHERE id = dup;
    END LOOP;
  END LOOP;
END $$;

-- ─── 3. Backfill de projetos.cliente_id pelo CPF ou razão social ──────────
-- Casa primeiro por CPF (mais confiável), depois por razão social exata.
UPDATE public.projetos p
SET cliente_id = c.id
FROM public.clientes c
WHERE p.cliente_id IS NULL
  AND p.cliente_cpf_cnpj IS NOT NULL
  AND c.cpf_cnpj = p.cliente_cpf_cnpj;

UPDATE public.projetos p
SET cliente_id = c.id
FROM public.clientes c
WHERE p.cliente_id IS NULL
  AND p.cliente_razao_social IS NOT NULL
  AND lower(trim(c.razao_social)) = lower(trim(p.cliente_razao_social));

-- ─── 4. UNIQUE parcial em cpf_cnpj (só onde tem valor) ────────────────────
DROP INDEX IF EXISTS public.uniq_clientes_cpf_cnpj;
CREATE UNIQUE INDEX uniq_clientes_cpf_cnpj
  ON public.clientes (cpf_cnpj)
  WHERE cpf_cnpj IS NOT NULL;

-- ─── Auditoria (cole separado pra ver o resultado) ────────────────────────
--
-- Clientes com múltiplos projetos:
-- SELECT c.id, c.razao_social, c.cpf_cnpj, COUNT(p.id) AS projetos
-- FROM public.clientes c
-- LEFT JOIN public.projetos p ON p.cliente_id = c.id
-- GROUP BY 1,2,3
-- HAVING COUNT(p.id) > 1
-- ORDER BY 4 DESC;
--
-- Projetos ainda órfãos (sem cliente_id):
-- SELECT codigo, cliente_razao_social, cliente_cpf_cnpj
-- FROM public.projetos
-- WHERE cliente_id IS NULL;
