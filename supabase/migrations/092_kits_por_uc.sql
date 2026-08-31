-- ═══════════════════════════════════════════════════════════════════════
-- Migration 092 — Kits por unidade consumidora (UC)
--
-- Kalebe 2026-08-29: 'quando cadastro mais de uma fatura, poder escolher
-- montar orçamento com todas as UCs em UM só, ou cada uma com seu kit
-- respectivo pra montar'.
--
-- Estrutura:
--  - modo_composicao: 'centralizado' (default, comportamento atual —
--    soma todos os consumos em 1 único kit) ou 'por_uc' (1 kit por UC).
--  - kits_por_uc: array [{ uc_ref, kit_selecionado, lista_ca_confirmada,
--    lista_complementos_cc, kit_weg_bruto_total, endereco_proprio?,
--    padrao_entrada_proprio?, telhado_secoes_proprio? }, …]
--    * uc_ref = 'principal' pra UC da fatura principal, ou o valor de
--      beneficiarias[i].uc pra cada beneficiária.
--    * endereco_proprio + padrao_entrada_proprio + telhado_secoes_proprio
--      só existem quando a UC fica em local diferente da principal.
--  - orcamento_consolidado: cache do último cálculo consolidado por UC
--    (pra o dashboard ler sem recomputar). Estrutura:
--    { por_uc: [{ uc_ref, pv_total, geracao_kwh_ano, potencia_cc_kwp,
--      kit_weg_com_fator, ... }], total_geral: { pv_total, potencia_cc,
--      geracao_kwh_ano, economia_mensal_estimada } }
--
-- Padrão idempotente.
-- ═══════════════════════════════════════════════════════════════════════

-- 1. modo_composicao
ALTER TABLE public.projetos
  ADD COLUMN IF NOT EXISTS modo_composicao text NOT NULL DEFAULT 'centralizado';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.projetos'::regclass
      AND conname = 'projetos_modo_composicao_check'
  ) THEN
    ALTER TABLE public.projetos
      ADD CONSTRAINT projetos_modo_composicao_check
      CHECK (modo_composicao IN ('centralizado', 'por_uc'));
  END IF;
END $$;

COMMENT ON COLUMN public.projetos.modo_composicao IS
  'centralizado (default) = 1 kit único cobrindo o consumo somado de todas as UCs. por_uc = 1 kit por UC (cada beneficiária + principal).';

-- 2. kits_por_uc
ALTER TABLE public.projetos
  ADD COLUMN IF NOT EXISTS kits_por_uc jsonb DEFAULT '[]'::jsonb;

COMMENT ON COLUMN public.projetos.kits_por_uc IS
  'Array de kits quando modo_composicao=por_uc. Cada item:
{
  uc_ref: string,                       -- "principal" | beneficiarias[i].uc
  kit_selecionado: {...},               -- mesma estrutura de projetos.kit_selecionado
  lista_ca_confirmada: [...],           -- items CA daquela UC
  lista_complementos_cc: {...},         -- complementos WEG daquela UC
  kit_weg_bruto_total: number,          -- total bruto WEG daquela UC
  endereco_proprio: boolean,            -- se UC tem endereço próprio
  padrao_entrada_proprio?: {...},       -- se endereco_proprio=true
  telhado_secoes_proprio?: [...]        -- se endereco_proprio=true
}';

-- 3. orcamento_consolidado (cache)
ALTER TABLE public.projetos
  ADD COLUMN IF NOT EXISTS orcamento_consolidado jsonb DEFAULT NULL;

COMMENT ON COLUMN public.projetos.orcamento_consolidado IS
  'Cache do último cálculo consolidado quando modo_composicao=por_uc.
Estrutura: { por_uc: [{uc_ref, pv_total, geracao_kwh_ano, potencia_cc_kwp, kit_weg_com_fator}], total_geral: {pv_total, potencia_cc, geracao_kwh_ano, economia_mensal_estimada} }.';
