-- ═══════════════════════════════════════════════════════════════════════
-- Migration 085 — Triggers pra consolidar dados do painel executivo
--
-- Kalebe 2026-08-26: 'precisamos fazer a integração entre as informações
-- do sistema e consolidação de números' — painel /dashboard admin
-- aparecia tudo zerado apesar de existirem projetos, vendas, telhados.
--
-- Diagnóstico:
-- 1. status_atualizado_em só era setado em 1 action (etapa/actions.ts) —
--    todas as outras (kit, orçamento, VE, telhado, fatura, hibrido...)
--    faziam .update({ status: 'X' }) sem tocar no timestamp. Resultado:
--    fica no DEFAULT now() da migration 022, cai fora do "mês corrente".
-- 2. pv_total NUNCA era populado por nenhuma action. O valor real da
--    venda mora em orcamento_final->>'valor_total' (JSON). Painel
--    somava pv_total → sempre 0.
--
-- Solução: 2 triggers BEFORE UPDATE em projetos + backfill.
--   • trg_projetos_status_touch: quando status muda, seta timestamp e
--     grava histórico em projeto_status_historico (aproveita a tabela
--     que a migration 022 criou).
--   • trg_projetos_pv_total_sync: mantém pv_total sincronizado com
--     orcamento_final->>'valor_total'. Rodado em INSERT e UPDATE.
--
-- Impacto: qualquer action que mudar status ou orcamento_final passa a
-- alimentar o painel automaticamente — sem tocar em cada arquivo.
-- ═══════════════════════════════════════════════════════════════════════

-- ─── Coluna pv_total (fantasma até agora — nenhuma migration criou) ────
-- O painel/actions leem `projetos.pv_total` mas ele nunca foi criado
-- na tabela. Criamos aqui como numeric(14,2), populado pelo trigger 2
-- abaixo e pelo backfill.
ALTER TABLE public.projetos
  ADD COLUMN IF NOT EXISTS pv_total numeric(14, 2);

-- ─── Trigger 1: status_atualizado_em + histórico ────────────────────────
CREATE OR REPLACE FUNCTION public.projetos_status_touch()
RETURNS trigger LANGUAGE plpgsql AS $$
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

-- ─── Trigger 2: pv_total sincronizado com orcamento_final ───────────────
CREATE OR REPLACE FUNCTION public.projetos_pv_total_sync()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  valor_json numeric;
BEGIN
  -- Tenta valor_total; se ausente cai pra preco_final ou valor_final
  valor_json := COALESCE(
    NULLIF(NEW.orcamento_final->>'valor_total', '')::numeric,
    NULLIF(NEW.orcamento_final->>'preco_final', '')::numeric,
    NULLIF(NEW.orcamento_final->>'valor_final', '')::numeric,
    NULLIF(NEW.orcamento_final->>'pv_total', '')::numeric
  );
  IF valor_json IS NOT NULL AND valor_json > 0 THEN
    NEW.pv_total := valor_json;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_projetos_pv_total_sync ON public.projetos;
CREATE TRIGGER trg_projetos_pv_total_sync
  BEFORE INSERT OR UPDATE OF orcamento_final ON public.projetos
  FOR EACH ROW EXECUTE FUNCTION public.projetos_pv_total_sync();

-- ─── Backfill 1: pv_total a partir de orcamento_final existente ────────
UPDATE public.projetos
SET pv_total = COALESCE(
  NULLIF(orcamento_final->>'valor_total', '')::numeric,
  NULLIF(orcamento_final->>'preco_final', '')::numeric,
  NULLIF(orcamento_final->>'valor_final', '')::numeric,
  NULLIF(orcamento_final->>'pv_total', '')::numeric
)
WHERE orcamento_final IS NOT NULL
  AND (pv_total IS NULL OR pv_total = 0)
  AND COALESCE(
    NULLIF(orcamento_final->>'valor_total', '')::numeric,
    NULLIF(orcamento_final->>'preco_final', '')::numeric,
    NULLIF(orcamento_final->>'valor_final', '')::numeric,
    NULLIF(orcamento_final->>'pv_total', '')::numeric
  ) > 0;

-- ─── Backfill 2: status_atualizado_em pra projetos ‘fechados’ que ficaram
-- no DEFAULT now() antigo — usa updated_at (última modificação real do
-- registro) como aproximação
UPDATE public.projetos
SET status_atualizado_em = updated_at
WHERE status IN ('vendido', 'aceito', 'em_homologacao', 'em_execucao', 'instalado', 'ativo_pos_venda')
  AND (status_atualizado_em IS NULL OR status_atualizado_em = created_at)
  AND updated_at > created_at;
