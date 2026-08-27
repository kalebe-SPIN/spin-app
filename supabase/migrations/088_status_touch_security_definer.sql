-- ═══════════════════════════════════════════════════════════════════════
-- Migration 088 — Trigger de status_touch passa a SECURITY DEFINER
--
-- Kalebe 2026-08-27: consultor recebe 'new row violates row-level
-- security policy for table projeto_status_historico' ao confirmar
-- análise da fatura (Passo 2).
--
-- Causa: trigger projetos_status_touch (migration 085) faz
-- INSERT INTO projeto_status_historico quando status muda. A tabela
-- projeto_status_historico (migration 022) tem RLS que só permite ALL
-- pra is_admin() — consultor não passa.
--
-- Fix (mesmo padrão da 087): função vira SECURITY DEFINER pra rodar com
-- privilégios do owner, ignorando RLS na hora de gravar o histórico.
-- Isso é seguro porque a função só INSERE no histórico com dados que
-- ela mesma calcula (projeto_id, status novo/antigo, usuario_id), não
-- expõe nem permite escrita cruzada arbitrária.
-- ═══════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.projetos_status_touch()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    NEW.status_atualizado_em := now();
    INSERT INTO public.projeto_status_historico
      (projeto_id, status_anterior, status_novo, usuario_id)
    VALUES
      (NEW.id, OLD.status::text, NEW.status::text, auth.uid());
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_projetos_status_touch ON public.projetos;
CREATE TRIGGER trg_projetos_status_touch
  BEFORE UPDATE OF status ON public.projetos
  FOR EACH ROW EXECUTE FUNCTION public.projetos_status_touch();
