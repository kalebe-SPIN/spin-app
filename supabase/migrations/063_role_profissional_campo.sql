-- ============================================================================
-- Migration 063 — Role `profissional_campo` + campos de agenda em profiles
-- ============================================================================
-- Contexto: profissional de campo (executor de O&M, PJ com equipe própria) vira
-- role própria no sistema. Complementa `vendedor_servicos` (mig 057) —
-- vendedor vende os contratos, profissional executa em campo.
--
-- Também adiciona duas colunas em `profiles`:
--   • `zona`               — base geográfica (ex. "Grande Florianópolis"). Usada
--                             pra vincular vendedor↔campo (mesma zona = par).
--   • `limite_horas_agenda`— limite (em horas) pra o dia ser "cheio" no widget
--                             de ocupação da agenda. Default 6h.
--
-- Aplicar via Supabase Dashboard > SQL Editor.
-- ============================================================================

BEGIN;

-- ─── 1. Adiciona valor ao enum (idempotente) ────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum
    WHERE enumlabel = 'profissional_campo'
      AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'user_role')
  ) THEN
    ALTER TYPE public.user_role ADD VALUE 'profissional_campo';
  END IF;
END $$;

-- ─── 2. Colunas em profiles ─────────────────────────────────────────────────
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS zona TEXT,
  ADD COLUMN IF NOT EXISTS limite_horas_agenda NUMERIC(4,2) NOT NULL DEFAULT 6
    CHECK (limite_horas_agenda >= 2 AND limite_horas_agenda <= 12);

COMMENT ON COLUMN public.profiles.zona IS
  'Base geográfica do usuário (ex. "Grande Florianópolis"). Vendedor e '
  'profissional de campo com a MESMA zona formam par: um enxerga e agenda na '
  'agenda do outro (ver mig 064). Herdada do convite de trabalho quando o '
  'candidato é aprovado.';

COMMENT ON COLUMN public.profiles.limite_horas_agenda IS
  'Limite (em horas) para um dia ser considerado "cheio" no widget de ocupação '
  'da /agenda. Default 6h (dia útil de 8h com folga pra almoço/deslocamento). '
  'Configurável em /conta. Range: 2-12h.';

CREATE INDEX IF NOT EXISTS idx_profiles_zona ON public.profiles(zona) WHERE zona IS NOT NULL;

-- ─── 3. Helper: is_profissional_campo() ─────────────────────────────────────
-- Segue o padrão de is_admin() (mig 001) e is_vendedor_servicos() (mig 057).
CREATE OR REPLACE FUNCTION public.is_profissional_campo()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid()
      AND role = 'profissional_campo'::public.user_role
  );
$$;

COMMENT ON FUNCTION public.is_profissional_campo() IS
  'Retorna true se o usuário autenticado tem role profissional_campo. '
  'Introduzida em 063_role_profissional_campo.sql.';

REVOKE ALL ON FUNCTION public.is_profissional_campo() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_profissional_campo() TO authenticated;

-- ─── 4. Helper: eh_par_agenda(dono uuid) ────────────────────────────────────
-- Encapsula a regra de "quem pode ver/mexer na agenda de quem":
--   • admin sempre pode
--   • dono sempre pode
--   • vendedor_servicos ↔ profissional_campo com MESMA zona (não-nula)
--
-- Usada em policies RLS de agenda_eventos, agenda_tarefas e nas actions do
-- servidor pra decidir permissões antes de operar.
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
            (me.role = 'vendedor_servicos'::public.user_role
              AND peer.role = 'profissional_campo'::public.user_role)
            OR
            (me.role = 'profissional_campo'::public.user_role
              AND peer.role = 'vendedor_servicos'::public.user_role)
          )
      )
    END;
$$;

COMMENT ON FUNCTION public.eh_par_agenda(uuid) IS
  'Retorna true se o usuário autenticado pode ver/editar a agenda do dono '
  'passado como argumento. Regra: dono, admin, ou par vendedor↔campo da mesma '
  'zona. Introduzida em 063_role_profissional_campo.sql.';

REVOKE ALL ON FUNCTION public.eh_par_agenda(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.eh_par_agenda(uuid) TO authenticated;

COMMIT;

-- ============================================================================
-- COMO PROMOVER UMA CONTA A profissional_campo
-- ============================================================================
--   UPDATE public.profiles
--   SET role = 'profissional_campo'::public.user_role,
--       zona = 'Grande Florianópolis',   -- MESMA zona do vendedor pareado
--       updated_at = now()
--   WHERE id = (SELECT id FROM auth.users WHERE email = 'campo@spinsolar.com.br');
--
-- Depois disso, o vendedor_servicos com a MESMA zona já enxerga a agenda dele
-- automaticamente (via eh_par_agenda em RLS — ver mig 064).
-- ============================================================================
