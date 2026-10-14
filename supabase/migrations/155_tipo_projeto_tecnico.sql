-- ═══════════════════════════════════════════════════════════════════════
-- Migration 155 — Tipo de item "Projeto técnico"
--
-- Kalebe 2026-10-14: as categorias principais de proposta ganharam
-- "Venda (ponto de venda)" e "Projetos técnicos". Venda usa o tipo
-- venda_equipamentos (já existe); projeto técnico precisa do valor novo
-- no enum. ADD VALUE não roda dentro de transação — comando isolado.
-- ═══════════════════════════════════════════════════════════════════════

ALTER TYPE tipo_item_projeto ADD VALUE IF NOT EXISTS 'srv_projeto_tecnico';
