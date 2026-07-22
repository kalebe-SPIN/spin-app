-- Migration 050: parametros pra 2 novos servicos
--   1. limpeza_fotovoltaica (srv_limpeza)
--   2. revisao_manutencao   (srv_manutencao)
--
-- Kalebe pediu: cobrar por qtd placas + KM + pavimentos + tipo telhado.
-- LIMPEZA: variavel adicional 'ponto de agua' (se cliente nao tem, precisa pipa).
-- REVISAO: variavel 'ponto de energia' (pra ferramentas — se nao tem, precisa gerador).

-- ============================================================================
-- 1. LIMPEZA FOTOVOLTAICA
-- ============================================================================

INSERT INTO public.parametros_precificacao_servicos (chave, nome, descricao, parametros)
VALUES (
  'limpeza_fotovoltaica',
  'Limpeza fotovoltaica',
  'Limpeza tecnica de modulos — pontual ou contrato de manutencao preventiva.',
  jsonb_build_object(
    -- Mao de obra base
    'mao_obra_limpeza_por_modulo', 15.00,

    -- Fatores (mesmos padroes dos outros servicos)
    'fator_telhado', jsonb_build_object(
      'fibrocimento', 1.0,
      'ceramico', 1.2,
      'metalico', 1.0,
      'zinco', 1.1,
      'laje', 1.3,
      'outro', 1.15
    ),
    'fator_pavimento', jsonb_build_object(
      'terreo', 1.0,
      'primeiro', 1.3,
      'segundo', 1.6,
      'terceiro_ou_mais', 2.0
    ),
    'fator_programacao', jsonb_build_object(
      'normal', 1.0,
      'feriado', 1.5,
      'noite', 1.4,
      'urgencia', 1.5
    ),

    -- Deslocamento e diarias
    'valor_km_rodado', 3.50,
    'diaria_instalador', 200.00,

    -- Agua (se cliente NAO tem ponto de agua no local)
    'litros_agua_por_modulo', 5.0,               -- estimativa media
    'valor_caminhao_pipa_diaria', 500.00,        -- pra jobs medios/grandes
    'usa_caminhao_pipa_se_placas_mais_que', 30,  -- gatilho automatico

    -- Insumos por modulo
    'valor_detergente_por_modulo', 2.50,         -- detergente biodegradavel
    'valor_epi_e_ferramentas_por_dia', 30.00,    -- desgaste/limpeza equipamentos

    -- Gerador portatil (se cliente NAO tem ponto de energia p/ bomba)
    'valor_gerador_diaria', 150.00,

    -- Adicional visita minima (evitar prejuizo em jobs pequenos)
    'valor_minimo_visita', 300.00
  )
)
ON CONFLICT (chave) DO NOTHING;

-- ============================================================================
-- 2. REVISAO / MANUTENCAO DE USINA
-- ============================================================================

INSERT INTO public.parametros_precificacao_servicos (chave, nome, descricao, parametros)
VALUES (
  'revisao_manutencao',
  'Revisao e manutencao de usina FV',
  'Inspecao tecnica + limpeza basica + testes eletricos + relatorio tecnico.',
  jsonb_build_object(
    -- Mao de obra base
    'mao_obra_revisao_por_modulo', 25.00,        -- inspecao visual + limpeza rapida

    -- Fatores
    'fator_telhado', jsonb_build_object(
      'fibrocimento', 1.0,
      'ceramico', 1.2,
      'metalico', 1.0,
      'zinco', 1.1,
      'laje', 1.3,
      'outro', 1.15
    ),
    'fator_pavimento', jsonb_build_object(
      'terreo', 1.0,
      'primeiro', 1.3,
      'segundo', 1.6,
      'terceiro_ou_mais', 2.0
    ),
    'fator_programacao', jsonb_build_object(
      'normal', 1.0,
      'feriado', 1.5,
      'noite', 1.4,
      'urgencia', 1.5
    ),

    -- Deslocamento e diarias
    'valor_km_rodado', 3.50,
    'diaria_instalador', 250.00,                 -- tecnico especializado

    -- Testes especificos (opcionais — consultor marca)
    'valor_termografia_por_modulo', 8.00,        -- inspecao com camera termica
    'valor_teste_string_por_string', 80.00,      -- multimetro + osciloscopio
    'valor_teste_inversor_por_inversor', 120.00, -- monitoramento + firmware
    'valor_relatorio_tecnico', 350.00,           -- documento assinado por RT

    -- Ferramentas / consumiveis
    'valor_epi_e_ferramentas_por_dia', 50.00,

    -- Gerador portatil (se sem ponto energia — necessario pros equipamentos)
    'valor_gerador_diaria', 150.00,

    -- Adicional visita minima
    'valor_minimo_visita', 500.00
  )
)
ON CONFLICT (chave) DO NOTHING;
