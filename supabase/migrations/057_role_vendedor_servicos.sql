-- ============================================================================
-- Migration 057 — Role `vendedor_servicos` no enum user_role
-- ============================================================================
-- Contexto: primeiro passo da Fundação do Módulo Serviços (Fase 2 do PROMPT ÚNICO).
-- Segundo a decisão pendente #2 do DIAGNOSTICO.md, o vendedor de serviços tem
-- responsabilidades e visibilidade DIFERENTES do consultor/representante de solar
-- (ver seção 12: "vendedor de Serviços NÃO vê pipeline de solar, propostas, margem
-- ou custo"), então merece role próprio ao invés de reaproveitar `representante`.
--
-- Esta migration APENAS acrescenta o valor no enum + helper function.
-- As policies RLS específicas do Módulo Serviços serão criadas na Fase 2 completa,
-- quando as tabelas `telhados`, `oportunidades`, `contratos` e afins existirem.
--
-- ─── REVERSIBILIDADE ────────────────────────────────────────────────────────
-- Postgres NÃO permite REMOVER valor de enum via ALTER TYPE.
-- Para reverter, seria necessário: (1) atualizar todos profiles com esse role para
-- outro valor, (2) criar enum novo sem o valor, (3) alterar coluna, (4) dropar
-- enum antigo. Ver bloco DOWN comentado no final desta migration.
-- ============================================================================

BEGIN;

-- ─── 1. Adiciona valor ao enum (idempotente) ────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum
    WHERE enumlabel = 'vendedor_servicos'
      AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'user_role')
  ) THEN
    ALTER TYPE public.user_role ADD VALUE 'vendedor_servicos';
  END IF;
END $$;


-- ─── 2. Helper function: is_vendedor_servicos() ─────────────────────────────
-- Segue o padrão de `is_admin()` (mig 001:97).
-- SECURITY DEFINER + STABLE porque a checagem é usada em policies RLS.
CREATE OR REPLACE FUNCTION public.is_vendedor_servicos()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid()
      AND role = 'vendedor_servicos'::public.user_role
  );
$$;

COMMENT ON FUNCTION public.is_vendedor_servicos() IS
  'Retorna true se o usuário autenticado tem role vendedor_servicos.
   Usar em policies RLS do Módulo Serviços — telhados, oportunidades, contratos.
   Introduzida em 057_role_vendedor_servicos.sql.';

REVOKE ALL ON FUNCTION public.is_vendedor_servicos() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_vendedor_servicos() TO authenticated;


COMMIT;


-- ============================================================================
-- COMO PROMOVER UMA CONTA A vendedor_servicos APÓS APLICAR ESTA MIGRATION
-- ============================================================================
-- Fluxo recomendado (Opção A do plano de fase 0):
--   1. Kalebe cria o usuário no Supabase Auth Dashboard (Authentication → Users →
--      Add user), definindo email e senha. Ex: kalebe.servicos@spinsolar.com.br
--   2. O trigger existente em `profiles` (mig 001) já cria a linha correspondente
--      com role = 'colaborador' (default).
--   3. Kalebe (ou admin) executa o UPDATE abaixo no SQL Editor do Supabase,
--      substituindo o email:
--
--        UPDATE public.profiles
--        SET role = 'vendedor_servicos'::public.user_role,
--            updated_at = now()
--        WHERE id = (
--          SELECT id FROM auth.users
--          WHERE email = 'kalebe.servicos@spinsolar.com.br'
--          LIMIT 1
--        );
--
--   4. Verificar:
--        SELECT p.id, u.email, p.role, p.updated_at
--        FROM public.profiles p
--        JOIN auth.users u ON u.id = p.id
--        WHERE p.role = 'vendedor_servicos';
--
-- Enquanto as policies RLS específicas do Módulo Serviços não existirem
-- (Fase 2 completa), o vendedor_servicos vai enxergar apenas o que as policies
-- genéricas permitem — na prática, equivalente a um `colaborador` autenticado.
-- Isso é intencional: role sem escopo definido não deve ganhar acesso amplo.
-- ============================================================================


-- ============================================================================
-- DOWN (reversão manual — Postgres não faz ALTER TYPE DROP VALUE)
-- ============================================================================
-- Se precisar remover o role no futuro, os passos são:
--
--   BEGIN;
--     -- 1. Move todo profile com role vendedor_servicos para colaborador
--     UPDATE public.profiles
--     SET role = 'colaborador'::public.user_role
--     WHERE role = 'vendedor_servicos'::public.user_role;
--
--     -- 2. Cria enum novo sem o valor removido
--     CREATE TYPE public.user_role_novo AS ENUM (
--       'admin', 'representante', 'instalador', 'colaborador'
--     );
--
--     -- 3. Altera coluna e default
--     ALTER TABLE public.profiles
--       ALTER COLUMN role DROP DEFAULT,
--       ALTER COLUMN role TYPE public.user_role_novo
--         USING role::text::public.user_role_novo,
--       ALTER COLUMN role SET DEFAULT 'colaborador'::public.user_role_novo;
--
--     -- 4. Dropa enum antigo, renomeia o novo
--     DROP FUNCTION IF EXISTS public.is_vendedor_servicos();
--     DROP TYPE public.user_role;
--     ALTER TYPE public.user_role_novo RENAME TO user_role;
--   COMMIT;
-- ============================================================================
