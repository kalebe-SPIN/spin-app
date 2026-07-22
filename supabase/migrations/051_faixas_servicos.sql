-- Migration 051: tabela de faixas de preco por servico
--
-- Kalebe: alem do calculo detalhado, quer tabela de REFERENCIA por faixa:
--   - Limpeza: faixas por qtd de placas
--   - Revisao: faixas por potencia (kWp) que reflete complexidade
--
-- Uso:
--   1. Referencia rapida no form (mostra faixa aplicavel)
--   2. Piso minimo opcional (se calculo detalhado < faixa, usa faixa)
--   3. Cotacao rapida sem preencher form completo

CREATE TABLE IF NOT EXISTS public.faixas_precificacao_servicos (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  chave_servico  text NOT NULL,     -- 'limpeza_fotovoltaica' | 'revisao_manutencao' | outros
  unidade        text NOT NULL CHECK (unidade IN ('placas', 'kwp', 'kva', 'strings', 'inversores')),
  faixa_min      numeric NOT NULL,  -- inclusivo
  faixa_max      numeric,           -- inclusivo. NULL = sem limite superior
  valor          numeric NOT NULL,  -- R$ referencia
  descricao      text,              -- ex: "Residencial pequeno"
  ordem          int NOT NULL DEFAULT 0,
  ativo          boolean NOT NULL DEFAULT true,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_faixas_servico_ordem
  ON public.faixas_precificacao_servicos(chave_servico, ordem)
  WHERE ativo = true;

ALTER TABLE public.faixas_precificacao_servicos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "faixas_servico_read_all" ON public.faixas_precificacao_servicos;
CREATE POLICY "faixas_servico_read_all"
  ON public.faixas_precificacao_servicos FOR SELECT
  USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "faixas_servico_admin_all" ON public.faixas_precificacao_servicos;
CREATE POLICY "faixas_servico_admin_all"
  ON public.faixas_precificacao_servicos FOR ALL
  USING (public.is_admin());

-- ============================================================================
-- SEEDS: Limpeza por qtd de placas
-- ============================================================================
INSERT INTO public.faixas_precificacao_servicos (chave_servico, unidade, faixa_min, faixa_max, valor, descricao, ordem) VALUES
  ('limpeza_fotovoltaica', 'placas', 1,   10,  500.00,  'Residencial pequeno', 1),
  ('limpeza_fotovoltaica', 'placas', 11,  25,  800.00,  'Residencial medio', 2),
  ('limpeza_fotovoltaica', 'placas', 26,  50,  1400.00, 'Residencial grande / comercial pequeno', 3),
  ('limpeza_fotovoltaica', 'placas', 51,  100, 2500.00, 'Comercial medio', 4),
  ('limpeza_fotovoltaica', 'placas', 101, 200, 4500.00, 'Comercial grande', 5),
  ('limpeza_fotovoltaica', 'placas', 201, 500, 9000.00, 'Industrial pequeno', 6),
  ('limpeza_fotovoltaica', 'placas', 501, NULL, 18000.00, 'Industrial / usina — sob consulta', 7)
ON CONFLICT DO NOTHING;

-- ============================================================================
-- SEEDS: Revisao por potencia kWp
-- ============================================================================
INSERT INTO public.faixas_precificacao_servicos (chave_servico, unidade, faixa_min, faixa_max, valor, descricao, ordem) VALUES
  ('revisao_manutencao', 'kwp', 0,    5,    800.00,   'Residencial pequeno', 1),
  ('revisao_manutencao', 'kwp', 5,    10,   1200.00,  'Residencial medio', 2),
  ('revisao_manutencao', 'kwp', 10,   30,   2000.00,  'Comercial pequeno', 3),
  ('revisao_manutencao', 'kwp', 30,   75,   4000.00,  'Comercial medio (grupo B)', 4),
  ('revisao_manutencao', 'kwp', 75,   150,  8000.00,  'Industrial pequeno (grupo A entrada)', 5),
  ('revisao_manutencao', 'kwp', 150,  500,  15000.00, 'Industrial medio', 6),
  ('revisao_manutencao', 'kwp', 500,  NULL, 30000.00, 'Usina — sob consulta', 7)
ON CONFLICT DO NOTHING;
