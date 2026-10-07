-- ============================================================================
-- Migration 141 — Par de agenda: representante ↔ profissional de campo
-- ============================================================================
-- A tela da agenda (app/agenda/page.tsx) pareia representante com
-- profissional de campo da mesma zona, mas a função do RLS só aceitava
-- 'vendedor_servicos' (papel antigo, unificado em 'representante' em
-- 2026-09-07) — a agenda do par aparecia vazia. Aceita os dois.
-- Idempotente.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.eh_par_agenda(dono uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT
    CASE
      WHEN auth.uid() IS NULL THEN false
      WHEN auth.uid() = dono THEN true
      WHEN public.is_admin() THEN true
      ELSE EXISTS (
        SELECT 1
        FROM public.profiles me
        JOIN public.profiles peer ON peer.id = dono
        WHERE me.id = auth.uid()
          AND me.zona IS NOT NULL
          AND me.zona = peer.zona
          AND (
            (me.role IN ('vendedor_servicos'::public.user_role, 'representante'::public.user_role)
              AND peer.role = 'profissional_campo'::public.user_role)
            OR
            (me.role = 'profissional_campo'::public.user_role
              AND peer.role IN ('vendedor_servicos'::public.user_role, 'representante'::public.user_role))
          )
      )
    END;
$$;

SELECT proname FROM pg_proc WHERE proname = 'eh_par_agenda';
