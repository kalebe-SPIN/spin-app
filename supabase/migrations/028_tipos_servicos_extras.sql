-- ============================================================================
-- Migration 028: 4 novos tipos — servicos de construcao + aluguel maquinas
-- ============================================================================
-- srv_alvenaria: alvenaria / reforma / construcao civil
-- srv_serralheria: serralheria (portoes, gradis, estruturas metalicas)
-- srv_carpintaria: carpintaria (madeira, moveis, deck, pergolado)
-- aluguel_maquinas: aluguel de maquinas e equipamentos (andaime, gerador, etc)
-- ============================================================================

-- Cada ALTER TYPE deve rodar separadamente no SQL Editor Supabase
ALTER TYPE tipo_item_projeto ADD VALUE IF NOT EXISTS 'srv_alvenaria';
ALTER TYPE tipo_item_projeto ADD VALUE IF NOT EXISTS 'srv_serralheria';
ALTER TYPE tipo_item_projeto ADD VALUE IF NOT EXISTS 'srv_carpintaria';
ALTER TYPE tipo_item_projeto ADD VALUE IF NOT EXISTS 'aluguel_maquinas';
