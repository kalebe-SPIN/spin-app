-- ═══════════════════════════════════════════════════════════════════════
-- Migration 081 — Fluxo Estação de Recarga VE no projeto
--
-- Kalebe pediu 2026-08-25: "habilite para o orçamento no projeto do
-- item estação de recargas possa acessar o catálogo WEG e a precificação
-- para criar a proposta".
--
-- Adiciona coluna JSONB pra guardar o wallbox WEG escolhido + acessórios +
-- preços calculados. Semelhante ao kit_selecionado do fluxo FV.
-- ═══════════════════════════════════════════════════════════════════════

ALTER TABLE public.projetos
  ADD COLUMN IF NOT EXISTS ve_recarga_selecionada jsonb;

COMMENT ON COLUMN public.projetos.ve_recarga_selecionada IS
  'Estação de recarga VE selecionada — { wallbox: {id, modelo, codigo_weg, potencia_kw, preco_unitario}, qtd, acessorios: [], preco_total, margem_pct }. Nova em 2026-08-25.';
