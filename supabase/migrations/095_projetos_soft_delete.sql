-- ═══════════════════════════════════════════════════════════════════════
-- Migration 095 — Soft-delete de propostas
--
-- Kalebe 2026-08-29: 'vamos adicionar um botão para excluir proposta,
-- e quando o cliente aceitar uma proposta as demais serão excluídas
-- automaticamente'.
--
-- Soft-delete: coluna excluida_em timestamptz + motivo. Ativos = NULL.
-- Ao vender uma proposta ('vendido'), as outras propostas ATIVAS do
-- mesmo cliente que ainda não fecharam recebem excluida_em automático
-- com motivo 'proposta X aceita pelo cliente'.
--
-- Propostas VENDIDAS/EM_HOMOLOGAÇÃO/etc não são excluídas mesmo se
-- outra do mesmo cliente for aceita — protege histórico contratual.
-- ═══════════════════════════════════════════════════════════════════════

ALTER TABLE public.projetos
  ADD COLUMN IF NOT EXISTS excluida_em timestamptz,
  ADD COLUMN IF NOT EXISTS excluida_motivo text,
  ADD COLUMN IF NOT EXISTS excluida_por uuid REFERENCES public.profiles(id);

COMMENT ON COLUMN public.projetos.excluida_em IS
  'Soft-delete: null = ativo. Preenchido = escondido nas listas mas mantido no banco. Kalebe 2026-08-29.';
COMMENT ON COLUMN public.projetos.excluida_motivo IS
  'Motivo da exclusão: "manual" (consultor apagou) | "auto_aceita" (outra proposta do mesmo cliente foi aceita).';

-- Index parcial pra queries de propostas ativas
CREATE INDEX IF NOT EXISTS idx_projetos_ativos
  ON public.projetos(cliente_id, created_at DESC)
  WHERE excluida_em IS NULL;
