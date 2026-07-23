-- Migration 052: expande unidades + seeds pra TODOS os servicos
--
-- Kalebe: quer tabela editavel pra todos os servicos. Adicionar unidades
-- flexiveis (hora, m2, m linear, dia, km) e seeds iniciais pra todos.

-- ============================================================================
-- 1. Expandir CHECK constraint da unidade
-- ============================================================================

ALTER TABLE public.faixas_precificacao_servicos
  DROP CONSTRAINT IF EXISTS faixas_precificacao_servicos_unidade_check;

ALTER TABLE public.faixas_precificacao_servicos
  ADD CONSTRAINT faixas_precificacao_servicos_unidade_check
  CHECK (unidade IN (
    'placas', 'kwp', 'kva', 'strings', 'inversores',
    'hora', 'dia', 'm2', 'm_linear', 'km',
    'amperes', 'evento', 'unidade', 'diagnostico'
  ));

-- ============================================================================
-- 2. SEEDS de faixas pra todos os outros servicos
-- ============================================================================

-- Retirada + recolocacao (por qtd placas — mais caro que limpeza)
INSERT INTO public.faixas_precificacao_servicos (chave_servico, unidade, faixa_min, faixa_max, valor, descricao, ordem) VALUES
  ('retirada_recolocacao', 'placas', 1,   10,  2500.00, 'Ate 10 placas — residencial pequeno', 1),
  ('retirada_recolocacao', 'placas', 11,  25,  4000.00, '11-25 placas — residencial medio', 2),
  ('retirada_recolocacao', 'placas', 26,  50,  7000.00, '26-50 placas — residencial grande', 3),
  ('retirada_recolocacao', 'placas', 51,  100, 12000.00, '51-100 — comercial pequeno', 4),
  ('retirada_recolocacao', 'placas', 101, 200, 20000.00, '101-200 — comercial medio', 5),
  ('retirada_recolocacao', 'placas', 201, NULL, 35000.00, '200+ — sob consulta', 6)
ON CONFLICT DO NOTHING;

-- Instalacao de placas (por qtd placas)
INSERT INTO public.faixas_precificacao_servicos (chave_servico, unidade, faixa_min, faixa_max, valor, descricao, ordem) VALUES
  ('instalacao_placas', 'placas', 1,   10,  3000.00, 'Ate 10 placas', 1),
  ('instalacao_placas', 'placas', 11,  25,  6000.00, '11-25 placas', 2),
  ('instalacao_placas', 'placas', 26,  50,  11000.00, '26-50 placas', 3),
  ('instalacao_placas', 'placas', 51,  100, 20000.00, '51-100 placas', 4),
  ('instalacao_placas', 'placas', 101, 200, 35000.00, '101-200 placas', 5),
  ('instalacao_placas', 'placas', 201, NULL, 60000.00, '200+ — sob consulta', 6)
ON CONFLICT DO NOTHING;

-- Eletrica predial (por hora tecnica)
INSERT INTO public.faixas_precificacao_servicos (chave_servico, unidade, faixa_min, faixa_max, valor, descricao, ordem) VALUES
  ('eletrica_predial', 'hora', 1, 4, 180.00, 'Ate 4h — servico rapido', 1),
  ('eletrica_predial', 'hora', 4, 8, 150.00, 'Meio periodo (por hora)', 2),
  ('eletrica_predial', 'hora', 8, 24, 130.00, 'Ate 3 dias (por hora)', 3),
  ('eletrica_predial', 'hora', 24, NULL, 110.00, 'Obras longas (por hora)', 4)
ON CONFLICT DO NOTHING;

-- Padrao de entrada (por amperagem)
INSERT INTO public.faixas_precificacao_servicos (chave_servico, unidade, faixa_min, faixa_max, valor, descricao, ordem) VALUES
  ('padrao_entrada', 'amperes', 32,  63,  1800.00, 'Padrao BT 32-63A monofasico', 1),
  ('padrao_entrada', 'amperes', 63,  100, 2800.00, 'Padrao BT 63-100A monofasico ou bifasico', 2),
  ('padrao_entrada', 'amperes', 100, 150, 4500.00, 'Padrao BT 100-150A trifasico', 3),
  ('padrao_entrada', 'amperes', 150, 250, 8000.00, 'Padrao BT 150-250A trifasico', 4),
  ('padrao_entrada', 'amperes', 250, NULL, 15000.00, 'Grupo A (MT com trafo) — sob consulta', 5)
ON CONFLICT DO NOTHING;

-- Laudo tecnico (por complexidade — usa unidade 'diagnostico')
INSERT INTO public.faixas_precificacao_servicos (chave_servico, unidade, faixa_min, faixa_max, valor, descricao, ordem) VALUES
  ('laudo_tecnico', 'diagnostico', 1, 1, 800.00, 'Laudo simples (residencial)', 1),
  ('laudo_tecnico', 'diagnostico', 2, 2, 1500.00, 'Laudo medio (comercial)', 2),
  ('laudo_tecnico', 'diagnostico', 3, 3, 3000.00, 'Laudo complexo (industrial)', 3),
  ('laudo_tecnico', 'diagnostico', 4, NULL, 5000.00, 'Laudo pericial / judicial', 4)
ON CONFLICT DO NOTHING;

-- Analise de rede (por dia)
INSERT INTO public.faixas_precificacao_servicos (chave_servico, unidade, faixa_min, faixa_max, valor, descricao, ordem) VALUES
  ('analise_rede', 'dia', 1, 1, 1500.00, '1 dia de coleta + relatorio', 1),
  ('analise_rede', 'dia', 2, 3, 2800.00, '2-3 dias', 2),
  ('analise_rede', 'dia', 4, 7, 5000.00, 'Ate 1 semana', 3),
  ('analise_rede', 'dia', 7, NULL, 8000.00, 'Mais de 1 semana — sob consulta', 4)
ON CONFLICT DO NOTHING;

-- Alvenaria (por m2)
INSERT INTO public.faixas_precificacao_servicos (chave_servico, unidade, faixa_min, faixa_max, valor, descricao, ordem) VALUES
  ('alvenaria', 'm2', 1, 10, 400.00, 'Ate 10 m2 — servico pontual', 1),
  ('alvenaria', 'm2', 11, 30, 320.00, '11-30 m2 (R$/m2)', 2),
  ('alvenaria', 'm2', 31, 100, 260.00, '31-100 m2 (R$/m2)', 3),
  ('alvenaria', 'm2', 101, NULL, 220.00, '100+ m2 (R$/m2 escala)', 4)
ON CONFLICT DO NOTHING;

-- Serralheria (por m linear — cercamento/gradil/portao)
INSERT INTO public.faixas_precificacao_servicos (chave_servico, unidade, faixa_min, faixa_max, valor, descricao, ordem) VALUES
  ('serralheria', 'm_linear', 1, 5, 500.00, 'Ate 5m — servico pontual', 1),
  ('serralheria', 'm_linear', 6, 20, 350.00, '6-20m (R$/m)', 2),
  ('serralheria', 'm_linear', 21, 50, 280.00, '21-50m (R$/m)', 3),
  ('serralheria', 'm_linear', 51, NULL, 230.00, '50+ m (R$/m escala)', 4)
ON CONFLICT DO NOTHING;

-- Carpintaria (por m2 — deck/pergolado/telhado)
INSERT INTO public.faixas_precificacao_servicos (chave_servico, unidade, faixa_min, faixa_max, valor, descricao, ordem) VALUES
  ('carpintaria', 'm2', 1, 10, 550.00, 'Ate 10 m2', 1),
  ('carpintaria', 'm2', 11, 30, 450.00, '11-30 m2 (R$/m2)', 2),
  ('carpintaria', 'm2', 31, 100, 380.00, '31-100 m2 (R$/m2)', 3),
  ('carpintaria', 'm2', 101, NULL, 320.00, '100+ m2 (R$/m2 escala)', 4)
ON CONFLICT DO NOTHING;

-- Aluguel maquinas pesadas (por dia)
INSERT INTO public.faixas_precificacao_servicos (chave_servico, unidade, faixa_min, faixa_max, valor, descricao, ordem) VALUES
  ('aluguel_maquinas', 'dia', 1, 1, 1200.00, 'Diaria retroescavadeira', 1),
  ('aluguel_maquinas', 'dia', 1, 1, 1500.00, 'Diaria munck ate 6t', 2),
  ('aluguel_maquinas', 'dia', 1, 1, 2500.00, 'Diaria guindaste 20t', 3),
  ('aluguel_maquinas', 'dia', 1, 1, 1800.00, 'Diaria escavadeira 20t', 4),
  ('aluguel_maquinas', 'dia', 1, 1, 800.00, 'Diaria rolo compactador', 5)
ON CONFLICT DO NOTHING;

-- Aluguel equipamentos leves (por dia)
INSERT INTO public.faixas_precificacao_servicos (chave_servico, unidade, faixa_min, faixa_max, valor, descricao, ordem) VALUES
  ('aluguel_equipamentos', 'dia', 1, 1, 80.00, 'Andaime 2m — diaria', 1),
  ('aluguel_equipamentos', 'dia', 1, 1, 250.00, 'Plataforma elevatoria — diaria', 2),
  ('aluguel_equipamentos', 'dia', 1, 1, 150.00, 'Gerador portatil — diaria', 3),
  ('aluguel_equipamentos', 'dia', 1, 1, 60.00, 'Betoneira — diaria', 4),
  ('aluguel_equipamentos', 'dia', 1, 1, 50.00, 'Serra circular — diaria', 5)
ON CONFLICT DO NOTHING;
