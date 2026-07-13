-- ============================================================================
-- Migration 026: Adiciona 3 tipos extras
-- ============================================================================
-- srv_laudo_tecnico: laudo tecnico de sistema FV ou eletrico
-- srv_analise_rede: analise de rede eletrica (qualidade energia, harmonicos)
-- outros: tipo generico com titulo livre (consultor descreve)
-- ============================================================================

-- Cada ALTER TYPE deve rodar separadamente no SQL Editor Supabase
ALTER TYPE tipo_item_projeto ADD VALUE IF NOT EXISTS 'srv_laudo_tecnico';
ALTER TYPE tipo_item_projeto ADD VALUE IF NOT EXISTS 'srv_analise_rede';
ALTER TYPE tipo_item_projeto ADD VALUE IF NOT EXISTS 'outros';
