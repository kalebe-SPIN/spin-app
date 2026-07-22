-- Migration 047: parametros de precificacao de servicos
-- Tabela singleton (1 linha por servico) que armazena os fatores e valores
-- editaveis pelo admin em /admin/precificacao/servicos.
--
-- Kalebe pediu o servico de RETIRADA E RECOLOCACAO de modulos primeiro.
-- Estrutura preparada pra receber outros servicos no futuro (instalacao,
-- readequacao) — cada um vira uma linha nova com sua propria chave.

CREATE TABLE IF NOT EXISTS public.parametros_precificacao_servicos (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  chave        text NOT NULL UNIQUE,     -- 'retirada_recolocacao', 'instalacao_placas', 'readequacao_planta'
  nome         text NOT NULL,            -- rotulo pra exibir
  descricao    text,
  parametros   jsonb NOT NULL DEFAULT '{}',
  ativo        boolean NOT NULL DEFAULT true,
  atualizado_por uuid REFERENCES auth.users(id),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  created_at   timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.parametros_precificacao_servicos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "params_precif_serv_read_all" ON public.parametros_precificacao_servicos;
CREATE POLICY "params_precif_serv_read_all"
  ON public.parametros_precificacao_servicos FOR SELECT
  USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "params_precif_serv_admin_all" ON public.parametros_precificacao_servicos;
CREATE POLICY "params_precif_serv_admin_all"
  ON public.parametros_precificacao_servicos FOR ALL
  USING (public.is_admin());

-- Seed inicial: RETIRADA E RECOLOCACAO com defaults sugeridos pelo Kalebe
INSERT INTO public.parametros_precificacao_servicos (chave, nome, descricao, parametros)
VALUES (
  'retirada_recolocacao',
  'Retirada e recolocacao de modulos',
  'Desmontagem temporaria de modulos + estrutura pra obra no telhado, e remontagem depois.',
  jsonb_build_object(
    -- Mao de obra por modulo
    'mao_obra_retirada_por_modulo', 25.00,
    'mao_obra_recolocacao_por_modulo', 35.00,

    -- Fatores multiplicadores por tipo de telhado
    'fator_telhado', jsonb_build_object(
      'fibrocimento', 1.0,
      'ceramico', 1.3,
      'metalico', 1.0,
      'zinco', 1.1,
      'laje', 1.5,
      'outro', 1.2
    ),

    -- Fatores por pavimento (aumenta risco/andaimes)
    'fator_pavimento', jsonb_build_object(
      'terreo', 1.0,
      'primeiro', 1.3,
      'segundo', 1.6,
      'terceiro_ou_mais', 2.0
    ),

    -- Fatores por horario/programacao
    'fator_programacao', jsonb_build_object(
      'normal', 1.0,
      'feriado', 1.5,
      'noite', 1.4,
      'urgencia', 1.5
    ),

    -- Deslocamento e diarias
    'valor_km_rodado', 3.50,
    'diaria_instalador', 250.00,
    'valor_realocacao_por_metro', 5.00,

    -- Materiais consumiveis
    'par_mc4', 15.00,
    'mangueira_corrugada_metro', 8.00,
    'suporte_fixacao_unidade', 45.00,
    'cabo_solar_6mm_metro', 15.00,

    -- Configuracoes de calculo
    'metros_mangueira_por_modulo', 1.0,   -- estimativa media
    'suportes_por_modulo', 0.5,           -- 2 modulos por suporte na maioria dos telhados
    'metros_cabo_estimado_por_modulo', 3.0
  )
)
ON CONFLICT (chave) DO NOTHING;
