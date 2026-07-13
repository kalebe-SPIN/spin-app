-- ============================================================================
-- Migration 027: Proposta dinamica — segmento cliente + parametros comparativo
-- ============================================================================

-- Segmento do cliente pra propostas
ALTER TABLE public.projetos
  ADD COLUMN IF NOT EXISTS segmento_cliente text CHECK (
    segmento_cliente IN ('residencial', 'comercial', 'industrial')
  ) DEFAULT 'residencial';

-- Parametros da proposta (CELESC, Lei 14.300, CDI etc)
CREATE TABLE IF NOT EXISTS public.parametros_proposta (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  chave text UNIQUE NOT NULL,
  valor_numero numeric(12,4),
  valor_texto text,
  descricao text NOT NULL,
  categoria text NOT NULL DEFAULT 'geral',
  atualizado_em timestamptz NOT NULL DEFAULT now(),
  atualizado_por uuid REFERENCES public.profiles(id)
);
CREATE INDEX IF NOT EXISTS idx_params_proposta_categoria ON public.parametros_proposta(categoria);

-- Seeds — valores 2026 aproximados. Admin ajusta no painel depois.
INSERT INTO public.parametros_proposta (chave, valor_numero, descricao, categoria) VALUES
  -- CELESC
  ('celesc_taxa_minima_mono_kwh', 30,   'Taxa minima disponibilidade monofasico (kWh/mes)', 'celesc'),
  ('celesc_taxa_minima_bi_kwh',   50,   'Taxa minima disponibilidade bifasico (kWh/mes)',   'celesc'),
  ('celesc_taxa_minima_tri_kwh',  100,  'Taxa minima disponibilidade trifasico (kWh/mes)',  'celesc'),
  ('celesc_fio_b_tusd_kwh',       0.35, 'Fio B TUSD por kWh (R\$)',                          'celesc'),
  ('celesc_tarifa_b1_kwh',        0.95, 'Tarifa B1 residencial (R\$/kWh com impostos)',      'celesc'),
  ('celesc_tarifa_b3_kwh',        0.85, 'Tarifa B3 comercial (R\$/kWh com impostos)',        'celesc'),

  -- Lei 14.300 — progressao anual do fio B compensado
  ('lei_14300_perc_2026', 0.45, '% do Fio B cobrado em 2026', 'lei_14300'),
  ('lei_14300_perc_2027', 0.60, '% do Fio B cobrado em 2027', 'lei_14300'),
  ('lei_14300_perc_2028', 0.75, '% do Fio B cobrado em 2028', 'lei_14300'),
  ('lei_14300_perc_2029', 0.90, '% do Fio B cobrado em 2029', 'lei_14300'),
  ('lei_14300_perc_2030', 1.00, '% do Fio B cobrado em 2030+', 'lei_14300'),

  -- Rendimentos pra comparacao
  ('cdi_atual_aa',                10.75, 'CDI anual atual (% a.a.)',                        'rendimento'),
  ('poupanca_aa',                  7.5,  'Rendimento poupanca anual (% a.a.)',              'rendimento'),
  ('cdi_ir_perc',                 15.0,  'IR sobre CDI apos 2 anos (%)',                    'rendimento'),

  -- Solar
  ('inflacao_energia_aa',           8.0,  'Inflacao anual energia eletrica (% a.a.)',        'solar'),
  ('degradacao_placa_aa',           0.5,  'Degradacao anual das placas (% a.a.)',            'solar'),
  ('vida_util_sistema_anos',       25,    'Vida util do sistema (anos)',                     'solar'),

  -- Financiamento
  ('taxa_juros_financiamento_aa', 22.0,  'Taxa juros solar 60x (% a.a.)',                   'financiamento'),
  ('prazo_maximo_meses',          60,    'Prazo maximo padrao financiamento (meses)',       'financiamento')
ON CONFLICT (chave) DO NOTHING;

ALTER TABLE public.parametros_proposta ENABLE ROW LEVEL SECURITY;
CREATE POLICY "params_proposta_admin_all" ON public.parametros_proposta FOR ALL USING (public.is_admin());
CREATE POLICY "params_proposta_read_auth" ON public.parametros_proposta FOR SELECT USING (auth.uid() IS NOT NULL);
