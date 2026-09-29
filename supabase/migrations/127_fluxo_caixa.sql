-- Kalebe 2026-09-29: fluxo de caixa com PREVISTO × REALIZADO.
--   • Lançamentos manuais com cadastro dinâmico por tipo (fornecedor, imposto,
--     passivo bancário, capital de giro, pessoal, despesa operacional…).
--   • Integração com o dia a dia: venda fechada (projeto) vira recebimentos
--     previstos + custos previstos do orçamento (comissão, imposto, instalação,
--     frete, projeto/ART e kit quando passa pelo caixa). Na hora de pagar/receber
--     de fato, o admin "efetiva" com o valor e a data reais.
--   • Passivo bancário em contratos com parcelas; saldo devedor = parcelas em aberto.
-- Só admin (financeiro é exclusivo do admin).

-- 1) Configuração: saldo inicial e reserva mínima de capital de giro
CREATE TABLE IF NOT EXISTS public.fluxo_config (
  singleton       boolean PRIMARY KEY DEFAULT true CHECK (singleton),
  saldo_inicial   numeric(14,2) NOT NULL DEFAULT 0,
  data_inicio     date NOT NULL DEFAULT date_trunc('month', CURRENT_DATE)::date,
  reserva_minima  numeric(14,2) NOT NULL DEFAULT 0,   -- alerta de capital de giro
  -- Simples: DAS apurado na emissão da nota (competência) ou no recebimento (caixa)
  regime_imposto  text NOT NULL DEFAULT 'competencia' CHECK (regime_imposto IN ('competencia', 'caixa')),
  atualizado_em   timestamptz NOT NULL DEFAULT now()
);
INSERT INTO public.fluxo_config (singleton) VALUES (true) ON CONFLICT DO NOTHING;

-- 2) Passivo bancário (contratos)
CREATE TABLE IF NOT EXISTS public.fluxo_passivos (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  banco               text NOT NULL,
  modalidade          text NOT NULL CHECK (modalidade IN (
    'antecipacao_recebiveis', 'capital_giro_bancario', 'cartao_credito', 'cheque_especial',
    'consorcio', 'emprestimo', 'financiamento', 'outro')),
  numero_contrato     text,
  valor_contratado    numeric(14,2) NOT NULL CHECK (valor_contratado >= 0),
  data_contratacao    date NOT NULL,
  taxa_juros_mes      numeric(7,4),             -- % a.m. (informativo)
  parcelas_total      int NOT NULL DEFAULT 1 CHECK (parcelas_total >= 1),
  valor_parcela       numeric(14,2),
  primeiro_vencimento date,
  observacoes         text,
  criado_por          uuid REFERENCES public.profiles(id),
  criado_em           timestamptz NOT NULL DEFAULT now()
);

-- 3) Programação de recebimento de uma venda do sistema (1 por origem)
CREATE TABLE IF NOT EXISTS public.fluxo_programacoes (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  origem           text NOT NULL CHECK (origem IN ('projeto', 'venda_manual')),
  origem_id        uuid NOT NULL,
  situacao         text NOT NULL DEFAULT 'programado' CHECK (situacao IN ('programado', 'ignorado')),
  kit_passa_caixa  boolean,
  valor_venda      numeric(14,2),
  condicao         jsonb NOT NULL DEFAULT '{}',
  criado_por       uuid REFERENCES public.profiles(id),
  criado_em        timestamptz NOT NULL DEFAULT now(),
  UNIQUE (origem, origem_id)
);

-- 4) Lançamentos (previsto × realizado)
CREATE TABLE IF NOT EXISTS public.fluxo_lancamentos (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  direcao          text NOT NULL CHECK (direcao IN ('entrada', 'saida')),
  grupo            text NOT NULL CHECK (grupo IN (
    'receita_vendas', 'outras_receitas',
    'fornecedores', 'impostos', 'passivo_bancario', 'capital_giro', 'comissoes',
    'custos_projeto', 'pessoal', 'despesas_operacionais', 'outras_despesas')),
  categoria_id     uuid REFERENCES public.categorias_financeiras(id) ON DELETE SET NULL,
  descricao        text NOT NULL,
  valor_previsto   numeric(14,2) NOT NULL DEFAULT 0 CHECK (valor_previsto >= 0),
  data_prevista    date NOT NULL,
  valor_realizado  numeric(14,2) CHECK (valor_realizado IS NULL OR valor_realizado >= 0),
  data_realizada   date,
  forma_pagamento  text,
  parcela_num      int,
  parcelas_total   int,
  fornecedor_id    uuid REFERENCES public.fornecedores(id) ON DELETE SET NULL,
  passivo_id       uuid REFERENCES public.fluxo_passivos(id) ON DELETE CASCADE,
  projeto_id       uuid REFERENCES public.projetos(id) ON DELETE SET NULL,
  programacao_id   uuid REFERENCES public.fluxo_programacoes(id) ON DELETE CASCADE,
  origem           text NOT NULL DEFAULT 'manual' CHECK (origem IN ('manual', 'projeto', 'venda_manual', 'passivo')),
  lote_id          uuid,                        -- parcelas/recorrência geradas juntas
  detalhes         jsonb NOT NULL DEFAULT '{}', -- campos dinâmicos do tipo (imposto, competência, NF, subtipo…)
  observacoes      text,
  cancelado_em     timestamptz,
  criado_por       uuid REFERENCES public.profiles(id),
  criado_em        timestamptz NOT NULL DEFAULT now(),
  atualizado_em    timestamptz NOT NULL DEFAULT now(),
  CHECK ((valor_realizado IS NULL) = (data_realizada IS NULL))
);
CREATE INDEX IF NOT EXISTS idx_fluxo_lanc_prevista  ON public.fluxo_lancamentos(data_prevista) WHERE cancelado_em IS NULL;
CREATE INDEX IF NOT EXISTS idx_fluxo_lanc_realizada ON public.fluxo_lancamentos(data_realizada) WHERE cancelado_em IS NULL;
CREATE INDEX IF NOT EXISTS idx_fluxo_lanc_passivo   ON public.fluxo_lancamentos(passivo_id);
CREATE INDEX IF NOT EXISTS idx_fluxo_lanc_prog      ON public.fluxo_lancamentos(programacao_id);
CREATE INDEX IF NOT EXISTS idx_fluxo_lanc_fornec    ON public.fluxo_lancamentos(fornecedor_id);

-- 5) RLS: só admin
ALTER TABLE public.fluxo_config       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fluxo_passivos     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fluxo_programacoes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fluxo_lancamentos  ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "fluxo_config_admin" ON public.fluxo_config;
CREATE POLICY "fluxo_config_admin" ON public.fluxo_config FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());
DROP POLICY IF EXISTS "fluxo_passivos_admin" ON public.fluxo_passivos;
CREATE POLICY "fluxo_passivos_admin" ON public.fluxo_passivos FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());
DROP POLICY IF EXISTS "fluxo_prog_admin" ON public.fluxo_programacoes;
CREATE POLICY "fluxo_prog_admin" ON public.fluxo_programacoes FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());
DROP POLICY IF EXISTS "fluxo_lanc_admin" ON public.fluxo_lancamentos;
CREATE POLICY "fluxo_lanc_admin" ON public.fluxo_lancamentos FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

-- 6) Categorias extras (despesas operacionais comuns) — o admin cria mais pelo formulário
INSERT INTO public.categorias_financeiras (nome, tipo, cor)
SELECT v.nome, v.tipo, v.cor FROM (VALUES
  ('Combustível e manutenção de veículos', 'despesa', '#84cc16'),
  ('Contabilidade', 'despesa', '#8b5cf6'),
  ('Energia, água e internet', 'despesa', '#ec4899'),
  ('Ferramentas e EPIs', 'despesa', '#f59e0b'),
  ('Software e assinaturas', 'despesa', '#06b6d4'),
  ('Tarifas bancárias', 'despesa', '#ef4444'),
  ('Rendimentos de aplicação', 'receita', '#22c55e')
) AS v(nome, tipo, cor)
WHERE NOT EXISTS (SELECT 1 FROM public.categorias_financeiras c WHERE c.nome = v.nome);

-- Conferência
SELECT 'fluxo_config' AS tabela, count(*) FROM public.fluxo_config
UNION ALL SELECT 'categorias_financeiras', count(*) FROM public.categorias_financeiras
UNION ALL SELECT 'fluxo_lancamentos', count(*) FROM public.fluxo_lancamentos;
