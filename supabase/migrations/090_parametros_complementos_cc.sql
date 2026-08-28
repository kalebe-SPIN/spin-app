-- ═══════════════════════════════════════════════════════════════════════
-- Migration 090 — Parâmetros de complementos CC (cabo, estrutura, MC4)
--
-- Kalebe pediu 2026-08-27: 'preciso que o sistema cadastre e calcule
-- sozinho baseado em parâmetros' — trocar a lógica anterior (buscar
-- produto no catálogo) por parâmetros editáveis em /admin/precificacao.
-- Valores padrão são referências de mercado 2026 (SC/PR).
--
-- Padrão idempotente (UNIQUE composta chave+vigente_de).
-- ═══════════════════════════════════════════════════════════════════════

-- Cabo solar 6mm² — R$/metro (usado 2× distância_qgbt + 30m folga)
INSERT INTO public.parametros_precificacao
  (grupo, chave, descricao, valor_numero, unidade, valor_minimo, valor_maximo, requer_aprovacao_kalebe)
SELECT 'complementos_cc', 'preco_metro_cabo_solar_6mm2',
  'Cabo solar 6mm² (preto ou vermelho) por metro — usado no CC das strings',
  12.00, 'R$/m', 5.00, 30.00, false
WHERE NOT EXISTS (
  SELECT 1 FROM public.parametros_precificacao
  WHERE chave = 'preco_metro_cabo_solar_6mm2' AND vigente_ate IS NULL
);

-- Estruturas de fixação — R$/kit pra cada 4 placas, por tipo de telhado
INSERT INTO public.parametros_precificacao
  (grupo, chave, descricao, valor_numero, unidade, valor_minimo, valor_maximo, requer_aprovacao_kalebe)
SELECT 'complementos_cc', 'preco_kit_estrutura_fibrocimento',
  'Kit estrutura fibrocimento (perfil + gancho + terminais) pra 4 placas',
  320.00, 'R$/kit', 100.00, 800.00, false
WHERE NOT EXISTS (
  SELECT 1 FROM public.parametros_precificacao
  WHERE chave = 'preco_kit_estrutura_fibrocimento' AND vigente_ate IS NULL
);

INSERT INTO public.parametros_precificacao
  (grupo, chave, descricao, valor_numero, unidade, valor_minimo, valor_maximo, requer_aprovacao_kalebe)
SELECT 'complementos_cc', 'preco_kit_estrutura_metal',
  'Kit estrutura telhado metálico (perfil + gancho + terminais) pra 4 placas',
  380.00, 'R$/kit', 100.00, 800.00, false
WHERE NOT EXISTS (
  SELECT 1 FROM public.parametros_precificacao
  WHERE chave = 'preco_kit_estrutura_metal' AND vigente_ate IS NULL
);

INSERT INTO public.parametros_precificacao
  (grupo, chave, descricao, valor_numero, unidade, valor_minimo, valor_maximo, requer_aprovacao_kalebe)
SELECT 'complementos_cc', 'preco_kit_estrutura_ceramica',
  'Kit estrutura telha cerâmica (perfil + gancho + terminais) pra 4 placas',
  350.00, 'R$/kit', 100.00, 800.00, false
WHERE NOT EXISTS (
  SELECT 1 FROM public.parametros_precificacao
  WHERE chave = 'preco_kit_estrutura_ceramica' AND vigente_ate IS NULL
);

INSERT INTO public.parametros_precificacao
  (grupo, chave, descricao, valor_numero, unidade, valor_minimo, valor_maximo, requer_aprovacao_kalebe)
SELECT 'complementos_cc', 'preco_kit_estrutura_laje',
  'Kit estrutura laje/concreto (perfil + suporte inclinado) pra 4 placas',
  420.00, 'R$/kit', 100.00, 800.00, false
WHERE NOT EXISTS (
  SELECT 1 FROM public.parametros_precificacao
  WHERE chave = 'preco_kit_estrutura_laje' AND vigente_ate IS NULL
);

-- Conector MC4 — R$/par (2 pares por string ≈ 12 placas)
INSERT INTO public.parametros_precificacao
  (grupo, chave, descricao, valor_numero, unidade, valor_minimo, valor_maximo, requer_aprovacao_kalebe)
SELECT 'complementos_cc', 'preco_par_mc4',
  'Conector MC4 macho+fêmea por par (2 pares por string)',
  25.00, 'R$/par', 5.00, 100.00, false
WHERE NOT EXISTS (
  SELECT 1 FROM public.parametros_precificacao
  WHERE chave = 'preco_par_mc4' AND vigente_ate IS NULL
);
