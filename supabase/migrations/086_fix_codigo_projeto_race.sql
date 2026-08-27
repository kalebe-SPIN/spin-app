-- ═══════════════════════════════════════════════════════════════════════
-- Migration 086 — Corrige race condition na geração do código do projeto
--
-- Kalebe 2026-08-27: 'Erro ao criar projeto: duplicate key value violates
-- unique constraint projetos_codigo_key'.
--
-- Causa: trigger antigo (migration 005) fazia SELECT MAX + 1 sem lock.
-- Dois INSERTs simultâneos (dupli-click, aba dupla, retry) leem o mesmo
-- MAX e ambos tentam usar o mesmo próximo número → um insere, o outro
-- viola a UNIQUE.
--
-- Fix:
-- 1. pg_advisory_xact_lock por ano — serializa a geração dentro da tx
-- 2. Loop de retry até 10 tentativas — cobre também casos onde o
--    advisory falhe (ex: transação já commit'ada)
-- 3. Recheca se o código gerado já existe antes de setar
-- ═══════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.gerar_codigo_projeto()
RETURNS trigger AS $$
DECLARE
  v_ano text;
  v_sequencial int;
  v_codigo text;
  v_tentativas int := 0;
BEGIN
  v_ano := to_char(now(), 'YYYY');

  -- Lock por ano — mesmo hash → mesmo lock → serializa
  -- Usa hashtext pra caber no bigint. hashtext é determinístico.
  PERFORM pg_advisory_xact_lock(hashtext('projetos_codigo_' || v_ano)::bigint);

  LOOP
    -- Próximo sequencial baseado no MAX existente + tentativas anteriores
    SELECT COALESCE(MAX(
      CASE
        WHEN codigo ~ ('^SPIN-' || v_ano || '-[0-9]+$')
        THEN (split_part(codigo, '-', 3))::int
        ELSE 0
      END
    ), 0) + 1 + v_tentativas
    INTO v_sequencial
    FROM public.projetos;

    v_codigo := 'SPIN-' || v_ano || '-' || lpad(v_sequencial::text, 4, '0');

    -- Defesa extra: se por qualquer motivo o código já existe, tenta o próximo
    IF NOT EXISTS (SELECT 1 FROM public.projetos WHERE codigo = v_codigo) THEN
      NEW.codigo := v_codigo;
      RETURN NEW;
    END IF;

    v_tentativas := v_tentativas + 1;
    IF v_tentativas > 20 THEN
      RAISE EXCEPTION 'Não foi possível gerar código único após 20 tentativas (último: %)', v_codigo;
    END IF;
  END LOOP;
END;
$$ LANGUAGE plpgsql;

-- Trigger em si não mudou, mas dropa/recria pra garantir que aponta
-- pra função nova (caso o Postgres tenha cached plan).
DROP TRIGGER IF EXISTS trg_projetos_codigo ON public.projetos;
CREATE TRIGGER trg_projetos_codigo
  BEFORE INSERT ON public.projetos
  FOR EACH ROW
  WHEN (NEW.codigo IS NULL OR NEW.codigo = '')
  EXECUTE FUNCTION public.gerar_codigo_projeto();
