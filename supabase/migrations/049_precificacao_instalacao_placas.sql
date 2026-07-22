-- Migration 049: parametros de precificacao do servico srv_instalacao_placas
--
-- Servico: Instalacao de modulos fotovoltaicos em projeto onde o cliente
-- ja trouxe as placas + inversor (comprou fora ou de terceiros). Spin faz
-- SO a mao de obra + materiais consumiveis + opcionalmente assina o RT
-- pra homologacao CELESC.

INSERT INTO public.parametros_precificacao_servicos (chave, nome, descricao, parametros)
VALUES (
  'instalacao_placas',
  'Instalacao de modulos em projeto',
  'Cliente ja tem placas + inversor (comprou fora). Spin instala e opcionalmente assina o RT.',
  jsonb_build_object(
    -- Mao de obra base
    'mao_obra_instalacao_por_modulo', 80.00,

    -- Fatores multiplicadores (mesmos padrões que retirada+recolocacao)
    'fator_telhado', jsonb_build_object(
      'fibrocimento', 1.0,
      'ceramico', 1.3,
      'metalico', 1.0,
      'zinco', 1.1,
      'laje', 1.5,
      'outro', 1.2
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
    'diaria_instalador', 250.00,

    -- Materiais (novos SEMPRE — cliente trouxe so placas+inversor)
    'par_mc4', 15.00,
    'mangueira_corrugada_metro', 8.00,
    'suporte_fixacao_unidade', 45.00,
    'cabo_solar_6mm_metro', 15.00,
    'parafuso_fixacao_unidade', 3.00,       -- parafusos, arruelas, buchas

    -- Servicos opcionais
    'valor_art_rt', 400.00,                 -- se Spin assina RT/ART pra homologacao
    'valor_padrao_novo_upgrade', 800.00,    -- se precisa trocar padrao de entrada

    -- Estimativas de calculo
    'metros_mangueira_por_modulo', 1.5,     -- instalacao inteira precisa mais que retirada
    'suportes_por_modulo', 0.5,             -- ~2 modulos por par de suportes
    'parafusos_por_modulo', 4.0,            -- 4 parafusos por modulo (fixacao)
    'metros_cabo_estimado_por_modulo', 3.0
  )
)
ON CONFLICT (chave) DO NOTHING;
