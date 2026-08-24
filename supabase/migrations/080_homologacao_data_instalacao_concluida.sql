-- ═══════════════════════════════════════════════════════════════════════
-- Migration 080 — Fase 5 (Instalação) sem módulo OS ainda
--
-- Enquanto o módulo Ordem de Serviço não existe, precisamos permitir
-- que o projetista marque a instalação como concluída manualmente
-- (sem precisar de OS vinculada). Quando o módulo OS ficar pronto,
-- essa data pode ser derivada da OS finalizada.
-- ═══════════════════════════════════════════════════════════════════════

ALTER TABLE public.homologacoes
  ADD COLUMN IF NOT EXISTS data_instalacao_concluida date;
