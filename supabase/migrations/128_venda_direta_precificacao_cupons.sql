-- Kalebe 2026-09-30: estrutura de precificação PRÓPRIA da venda de
-- equipamentos + cupons de desconto.
--   • Fator, imposto e cartão deixam de ser os mesmos da proposta FV: ganham
--     cópias só da venda direta, começando com os valores vigentes hoje.
--   • Margem e comissão (já existentes) passam pro grupo 'venda_direta'.
--   • Cupom: só o admin cria e aplica; comissão e imposto incidem sobre o
--     valor COM desconto; trava de margem mínima configurável.

-- 1) Margem e comissão saem do grupo 'fotovoltaico' (inclusive o histórico)
UPDATE public.parametros_precificacao
SET grupo = 'venda_direta'
WHERE chave IN ('venda_direta_margem_perc', 'venda_direta_comissao_perc');

-- 2) Parâmetros próprios (valor inicial = o vigente da proposta FV)
INSERT INTO public.parametros_precificacao
  (grupo, chave, descricao, valor_numero, unidade, valor_minimo, valor_maximo, requer_aprovacao_kalebe, vigente_de)
SELECT v.grupo, v.chave, v.descricao, v.valor, v.unidade, v.minimo, v.maximo, true, current_date
FROM (VALUES
  ('venda_direta', 'venda_direta_fator',
   'VENDA DIRETA: fator sobre o preço de tabela da planilha WEG (custo = tabela × fator).',
   COALESCE((SELECT valor_numero FROM public.parametros_precificacao
             WHERE chave = 'fator_kit_weg_preco_cliente' AND vigente_ate IS NULL
             ORDER BY created_at DESC LIMIT 1), 0.4182),
   'decimal', 0.2, 1.0),
  ('venda_direta', 'venda_direta_imposto_perc',
   'VENDA DIRETA: imposto sobre o valor total da venda (a Spin fatura tudo).',
   COALESCE((SELECT valor_numero FROM public.parametros_precificacao
             WHERE chave = 'aliquota_simples_perc' AND vigente_ate IS NULL
             ORDER BY created_at DESC LIMIT 1), 15),
   '%', 0, 30),
  ('venda_direta', 'venda_direta_parcelas_cartao',
   'VENDA DIRETA: número de parcelas no cartão exibido na proposta.',
   COALESCE((SELECT valor_numero FROM public.parametros_precificacao
             WHERE chave = 'parcelas_cartao_padrao' AND vigente_ate IS NULL
             ORDER BY created_at DESC LIMIT 1), 12),
   'x', 1, 24),
  ('venda_direta', 'venda_direta_taxa_cartao_perc',
   'VENDA DIRETA: taxa total do parcelamento no cartão (por conta do cliente).',
   COALESCE((SELECT valor_numero FROM public.parametros_precificacao
             WHERE chave = 'juros_cartao_total_perc' AND vigente_ate IS NULL
             ORDER BY created_at DESC LIMIT 1), 8.99),
   '%', 0, 30),
  ('venda_direta', 'venda_direta_margem_minima_cupom_perc',
   'VENDA DIRETA: margem mínima da empresa depois do cupom. Cupom que deixar a margem abaixo disso é recusado.',
   0, '%', 0, 60)
) AS v(grupo, chave, descricao, valor, unidade, minimo, maximo)
WHERE NOT EXISTS (SELECT 1 FROM public.parametros_precificacao p WHERE p.chave = v.chave);

-- 3) Cupons de desconto
CREATE TABLE IF NOT EXISTS public.cupons_desconto (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  codigo       text NOT NULL UNIQUE CHECK (codigo = upper(codigo) AND length(codigo) BETWEEN 3 AND 30),
  descricao    text,
  tipo         text NOT NULL CHECK (tipo IN ('percentual', 'valor')),
  valor        numeric(12,2) NOT NULL CHECK (valor > 0),
  valido_de    date,
  valido_ate   date,
  limite_usos  int CHECK (limite_usos IS NULL OR limite_usos > 0),
  ativo        boolean NOT NULL DEFAULT true,
  aplica_em    text NOT NULL DEFAULT 'venda_direta' CHECK (aplica_em IN ('venda_direta')),
  criado_por   uuid REFERENCES public.profiles(id),
  criado_em    timestamptz NOT NULL DEFAULT now(),
  CHECK (tipo <> 'percentual' OR valor < 100)
);

-- Uso = cupom aplicado numa proposta (1 cupom por venda direta)
CREATE TABLE IF NOT EXISTS public.cupons_usos (
  cupom_id        uuid NOT NULL REFERENCES public.cupons_desconto(id) ON DELETE CASCADE,
  projeto_id      uuid NOT NULL REFERENCES public.projetos(id) ON DELETE CASCADE,
  desconto_valor  numeric(12,2),
  aplicado_por    uuid REFERENCES public.profiles(id),
  aplicado_em     timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (cupom_id, projeto_id)
);
CREATE INDEX IF NOT EXISTS idx_cupons_usos_projeto ON public.cupons_usos(projeto_id);

ALTER TABLE public.cupons_desconto ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cupons_usos     ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "cupons_admin" ON public.cupons_desconto;
CREATE POLICY "cupons_admin" ON public.cupons_desconto FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());
DROP POLICY IF EXISTS "cupons_usos_admin" ON public.cupons_usos;
CREATE POLICY "cupons_usos_admin" ON public.cupons_usos FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

-- Conferência
SELECT chave, valor_numero, unidade
FROM public.parametros_precificacao
WHERE grupo = 'venda_direta' AND vigente_ate IS NULL
ORDER BY chave;
