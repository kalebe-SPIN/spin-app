-- ═══════════════════════════════════════════════════════════════════════
-- Migration 087 — Trigger de código do projeto passa a SECURITY DEFINER
--
-- Kalebe 2026-08-27: erro 'duplicate key value violates unique
-- constraint projetos_codigo_key' persistiu mesmo após a 086 (advisory
-- lock + retry).
--
-- Causa raiz REAL: RLS de `projetos` restringe SELECT do consultor
-- (representante) só aos próprios projetos. Quando ele cria, o trigger
-- roda com auth do próprio usuário → SELECT MAX(codigo) enxerga só o
-- que RLS permite → conta os N projetos DELE, retorna N+1. Mas outros
-- consultores/admins já usaram códigos até 33+ → SPIN-2026-{N+1} já
-- existe → duplicate key.
--
-- Fix: SECURITY DEFINER faz a função rodar com os privilégios do OWNER
-- (postgres), ignorando RLS. Assim MAX() enxerga TODOS os projetos.
-- Combinado com o advisory lock da 086, elimina o duplicate key.
--
-- Segurança: SECURITY DEFINER é seguro aqui porque a função só LÊ MAX
-- e SETA NEW.codigo — não expõe dados de outros consultores pro
-- chamador nem permite escrita cruzada.
-- ═══════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.gerar_codigo_projeto()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ano text;
  v_sequencial int;
  v_codigo text;
  v_tentativas int := 0;
BEGIN
  v_ano := to_char(now(), 'YYYY');

  -- Lock por ano — serializa geração concorrente
  PERFORM pg_advisory_xact_lock(hashtext('projetos_codigo_' || v_ano)::bigint);

  LOOP
    -- MAX visto pelo OWNER (ignora RLS) — enxerga TODOS os projetos
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

    -- Defesa em profundidade — se ainda colidir, tenta o próximo
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
$$;

DROP TRIGGER IF EXISTS trg_projetos_codigo ON public.projetos;
CREATE TRIGGER trg_projetos_codigo
  BEFORE INSERT ON public.projetos
  FOR EACH ROW
  WHEN (NEW.codigo IS NULL OR NEW.codigo = '')
  EXECUTE FUNCTION public.gerar_codigo_projeto();
