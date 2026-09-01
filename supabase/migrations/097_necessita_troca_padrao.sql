-- Migration 097: sinalização de troca de padrão (Kalebe 2026-09-01)
-- Padrão vive em projetos.padrao_entrada (JSONB) — não precisa DDL pra
-- aceitar a chave nova 'necessita_troca_padrao'. Precisamos SÓ das
-- colunas de fase preliminar em homologacoes.
--
-- Quando padrao_entrada->>'necessita_troca_padrao' = 'true':
--   - Gerador de diagramas inclui 'padrao_entrada' automaticamente
--   - Homologação inicia com fase 'troca_padrao' antes das 7 fases atuais

ALTER TABLE public.homologacoes
  ADD COLUMN IF NOT EXISTS troca_padrao_iniciada_em timestamptz,
  ADD COLUMN IF NOT EXISTS troca_padrao_concluida_em timestamptz,
  ADD COLUMN IF NOT EXISTS troca_padrao_observacoes text;

COMMENT ON COLUMN public.homologacoes.troca_padrao_iniciada_em IS
  'Fase 0 — só preenchida quando projetos.padrao_entrada->>necessita_troca_padrao = true';
