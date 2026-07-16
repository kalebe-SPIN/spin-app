-- ============================================================================
-- Migration 032: Lista CA adicional para sistemas híbridos (JSONB)
-- ============================================================================
-- A lista CA on-grid fica em projetos.lista_ca_confirmada (jsonb).
-- Aqui adicionamos uma nova coluna dedicada aos itens do BESS híbrido —
-- não misturamos porque o consultor precisa poder editar/rejeitar cada
-- lista separadamente e o kit fotovoltaico WEG é sagrado.
--
-- Itens gerados por lib/hibrido/lista-ca-hibrida.ts:
--   • Cabos comunicação BLINDADOS (Modbus/CAN)
--   • Cabo HEPR 90°C pra saída EPS
--   • Cabo força CC (bateria→inversor)
--   • Terminais tubulares CC
--   • Chave seccionadora DC
--   • Disjuntor carga crítica (proteção redundante)
--   • Quadro carga crítica separado
--   • Se paralelismo: barramento + 2 disjuntores extras
--   • Placas advertência BESS
-- ============================================================================

ALTER TABLE public.projetos
  ADD COLUMN IF NOT EXISTS lista_ca_hibrida_confirmada jsonb;

COMMENT ON COLUMN public.projetos.lista_ca_hibrida_confirmada IS
  'Lista CA adicional específica de sistemas híbridos BESS. Materiais que complementam a lista_ca_confirmada quando o projeto tem item Solar híbrido.';
