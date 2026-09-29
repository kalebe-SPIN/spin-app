-- Kalebe 2026-09-29: VENDA DIRETA DE EQUIPAMENTOS ao consumidor final.
-- Proposta só de equipamentos da planilha WEG — sem projeto/ART, sem mão de
-- obra de instalação, sem lista CA. A Spin fatura tudo, então o imposto
-- incide sobre o TOTAL (na proposta FV normal é só sobre a nota Spin).
--
--   custo = Σ(preço planilha × qtd) × fator_kit_weg_preco_cliente (0,4182) + frete digitado
--   PV    = custo / (1 − (margem 18% + comissão 3% + alíquota_simples_perc) / 100)
--
-- Margem e comissão ficam editáveis no painel de precificação fotovoltaica
-- (grupo 'fotovoltaico' aparece sozinho lá). Alíquota e fator são os mesmos
-- parâmetros da proposta normal.

-- 1) Novo tipo de item do projeto
ALTER TYPE tipo_item_projeto ADD VALUE IF NOT EXISTS 'venda_equipamentos';

-- 2) Parâmetros comerciais
INSERT INTO public.parametros_precificacao
  (grupo, chave, descricao, valor_numero, unidade, valor_minimo, valor_maximo, requer_aprovacao_kalebe, vigente_de)
VALUES
  ('fotovoltaico', 'venda_direta_margem_perc',
   'VENDA DIRETA de equipamentos: margem da empresa sobre o preço de venda. Não usa a matriz por kWp.',
   18.00, '%', 0.00, 60.00, true, current_date),

  ('fotovoltaico', 'venda_direta_comissao_perc',
   'VENDA DIRETA de equipamentos: comissão fixa do vendedor sobre o preço de venda.',
   3.00, '%', 0.00, 20.00, true, current_date)

ON CONFLICT (chave, vigente_de) DO NOTHING;

-- Conferência
SELECT chave, valor_numero, unidade
FROM public.parametros_precificacao
WHERE chave LIKE 'venda_direta_%' AND vigente_ate IS NULL;
