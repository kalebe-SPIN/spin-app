-- ============================================================================
-- Migration 151 — Tarifas calculadas das faturas reais
-- ============================================================================
-- Kalebe 2026-10-13: "o valor do kWh: o sistema extrai do PDF do cliente e
-- calcula, porque tem as diferenças entre grupo, hora e subsídios". Cada
-- fatura lida (tela ou Laís) guarda aqui a tarifa efetiva calculada:
--   tarifa_media_kwh = (energia TE+TUSD+bandeira com tributos − descontos) ÷ kWh
--   tarifa_conta_kwh = valor total da conta ÷ kWh
--   por_posto        = ponta / fora de ponta / intermediário
-- Base de referência pra lead sem fatura: mediana dos últimos 6 meses no
-- mesmo perfil (grupo B convencional sem subsídio). Idempotente.
-- ============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.tarifas_extraidas (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  criado_em             timestamptz NOT NULL DEFAULT now(),
  origem                text NOT NULL CHECK (origem IN ('tela', 'lais')),
  usuario_id            uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  conversa_id           uuid REFERENCES public.wa_conversas(id) ON DELETE SET NULL,
  distribuidora         text NOT NULL DEFAULT 'CELESC',
  uc                    text,
  grupo                 text,
  subgrupo              text,
  classe                text,
  modalidade            text,
  tipo_ligacao          text,
  subsidio              text,
  mes_referencia        text,
  cidade                text,
  uf                    text,
  consumo_faturado_kwh  numeric(12,2),
  valor_energia         numeric(12,2),
  descontos             numeric(12,2),
  cip                   numeric(12,2),
  valor_total           numeric(12,2),
  tarifa_media_kwh      numeric(10,5),
  tarifa_conta_kwh      numeric(10,5),
  por_posto             jsonb,
  componentes           jsonb
);
CREATE INDEX IF NOT EXISTS idx_tarifas_extraidas_perfil ON public.tarifas_extraidas(grupo, subsidio, criado_em DESC);
CREATE INDEX IF NOT EXISTS idx_tarifas_extraidas_uc ON public.tarifas_extraidas(uc, mes_referencia);

ALTER TABLE public.tarifas_extraidas ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tarifas_extraidas_admin ON public.tarifas_extraidas;
CREATE POLICY tarifas_extraidas_admin ON public.tarifas_extraidas FOR ALL USING (public.is_admin());

COMMIT;

SELECT count(*) AS tarifas_na_base FROM public.tarifas_extraidas;
