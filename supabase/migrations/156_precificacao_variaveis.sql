-- ═══════════════════════════════════════════════════════════════════════
-- Migration 156 — Variáveis de precificação por item (dinâmicas)
--
-- Kalebe 2026-10-14: "adicionar a precificação à sessão de variáveis que
-- cada item pode ter e que o admin vai estruturar; campos dinâmicos que
-- se adaptam à precificação em termos de grandezas, unidades de medida e
-- valores por faixas".
--
-- Cada item (chave_servico — alvenaria, aluguel, elétrica predial, laudo…)
-- tem N variáveis (rótulo, unidade, modo de cobrança) e cada variável tem
-- suas faixas em faixas_precificacao_servicos (coluna nova "variavel").
-- Modos: por_unidade (valor da faixa × quantidade), faixa_total (valor da
-- faixa), por_item (escolhe um item da tabela × quantidade), fixo (valor).
-- As faixas que já existem viram a variável principal de cada item.
-- ═══════════════════════════════════════════════════════════════════════

BEGIN;

CREATE TABLE IF NOT EXISTS public.precificacao_variaveis (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  chave_servico text NOT NULL,
  chave         text NOT NULL,
  rotulo        text NOT NULL,
  unidade       text NOT NULL DEFAULT '',
  modo          text NOT NULL DEFAULT 'por_unidade' CHECK (modo IN ('por_unidade', 'faixa_total', 'por_item', 'fixo')),
  ordem         int  NOT NULL DEFAULT 0,
  ativo         boolean NOT NULL DEFAULT true,
  criado_em     timestamptz NOT NULL DEFAULT now(),
  atualizado_em timestamptz NOT NULL DEFAULT now(),
  UNIQUE (chave_servico, chave)
);

ALTER TABLE public.precificacao_variaveis ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "prec_var_read_all" ON public.precificacao_variaveis;
CREATE POLICY "prec_var_read_all" ON public.precificacao_variaveis FOR SELECT USING (auth.uid() IS NOT NULL);
DROP POLICY IF EXISTS "prec_var_admin_all" ON public.precificacao_variaveis;
CREATE POLICY "prec_var_admin_all" ON public.precificacao_variaveis FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

-- Faixas ligadas à variável; unidade passa a ser livre (grandeza definida pelo admin)
ALTER TABLE public.faixas_precificacao_servicos ADD COLUMN IF NOT EXISTS variavel text;
ALTER TABLE public.faixas_precificacao_servicos DROP CONSTRAINT IF EXISTS faixas_precificacao_servicos_unidade_check;

-- Variável principal dos itens que já têm faixas (mesmo comportamento de hoje)
INSERT INTO public.precificacao_variaveis (chave_servico, chave, rotulo, unidade, modo, ordem) VALUES
  ('alvenaria',            'area',         'Área',             'm²',       'por_unidade', 0),
  ('carpintaria',          'area',         'Área',             'm²',       'por_unidade', 0),
  ('serralheria',          'comprimento',  'Comprimento',      'm',        'por_unidade', 0),
  ('eletrica_predial',     'horas',        'Horas',            'h',        'por_unidade', 0),
  ('padrao_entrada',       'disjuntor',    'Disjuntor geral',  'A',        'faixa_total', 0),
  ('aluguel_maquinas',     'diarias',      'Diárias',          'dia',      'por_item',    0),
  ('aluguel_equipamentos', 'diarias',      'Diárias',          'dia',      'por_item',    0),
  ('laudo_tecnico',        'tipo',         'Tipo de laudo',    'laudo',    'por_item',    0),
  ('analise_rede',         'dias',         'Dias de coleta',   'dia',      'faixa_total', 0),
  ('limpeza_fotovoltaica', 'placas',       'Placas',           'placas',   'faixa_total', 0),
  ('revisao_manutencao',   'potencia',     'Potência',         'kWp',      'faixa_total', 0),
  ('retirada_recolocacao', 'placas',       'Placas',           'placas',   'faixa_total', 0),
  ('instalacao_placas',    'placas',       'Placas',           'placas',   'faixa_total', 0)
ON CONFLICT (chave_servico, chave) DO NOTHING;

UPDATE public.faixas_precificacao_servicos f SET variavel = v.chave
FROM public.precificacao_variaveis v
WHERE f.chave_servico = v.chave_servico AND f.variavel IS NULL AND v.ordem = 0;

COMMIT;

SELECT v.chave_servico, v.chave, v.unidade, v.modo, count(f.id) AS faixas
FROM public.precificacao_variaveis v
LEFT JOIN public.faixas_precificacao_servicos f ON f.chave_servico = v.chave_servico AND f.variavel = v.chave
GROUP BY 1, 2, 3, 4 ORDER BY 1, 2;
