-- ============================================================================
-- Migration 029: Split aluguel — pesadas + equipamentos leves
-- ============================================================================
-- Renomeia semanticamente: aluguel_maquinas (existente) fica pra pesadas
-- e adiciona aluguel_equipamentos pra leves (andaime, gerador, plataforma).
-- ============================================================================

-- Renomeia label do existente ficando so pra maquinas pesadas — via lib/tipos-projeto.ts
-- Aqui so adiciona o novo valor:
ALTER TYPE tipo_item_projeto ADD VALUE IF NOT EXISTS 'aluguel_equipamentos';
