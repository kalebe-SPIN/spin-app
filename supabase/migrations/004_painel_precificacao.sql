-- =================================================================
-- Migration 004 — Painel de Controle de Precificação
-- Tabelas: parametros_precificacao, parametros_precificacao_log
-- RPC: editar_parametro_precificacao
-- View: v_parametros_vigentes
-- Aplicar via Supabase Dashboard > SQL Editor (uma vez)
-- =================================================================

-- ===== 1. PARÂMETROS DE PRECIFICAÇÃO =====

CREATE TABLE public.parametros_precificacao (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  grupo           text NOT NULL,           -- margem / comissao / instalacao / projeto / frete / impostos / descontos / limites / financiamento
  chave           text NOT NULL,           -- identificador único (snake_case)
  descricao       text NOT NULL,

  valor_numero    numeric(12,4),           -- maioria dos parâmetros numéricos
  valor_texto     text,                    -- strings (ex: "Anexo III")
  valor_json      jsonb,                   -- tabelas complexas (faixas instalação)
  unidade         text,                    -- '%', 'R$', 'R$/kWp', 'R$/placa', 'dias'

  valor_minimo    numeric(12,4),           -- limite operacional inferior
  valor_maximo    numeric(12,4),           -- limite operacional superior
  requer_aprovacao_kalebe boolean DEFAULT false,

  vigente_de      date NOT NULL DEFAULT current_date,
  vigente_ate     date,
  ativo           boolean NOT NULL DEFAULT true,

  alterado_por    uuid REFERENCES public.profiles(id),
  motivo_alteracao text,
  created_at      timestamptz NOT NULL DEFAULT now(),

  UNIQUE(chave, vigente_de)
);

CREATE INDEX idx_param_grupo ON public.parametros_precificacao(grupo);
CREATE INDEX idx_param_vigente ON public.parametros_precificacao(chave) WHERE vigente_ate IS NULL;

-- ===== 2. HISTÓRICO DE ALTERAÇÕES =====

CREATE TABLE public.parametros_precificacao_log (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  parametro_chave     text NOT NULL,
  valor_anterior      jsonb,
  valor_novo          jsonb,
  motivo              text,
  usuario_id          uuid REFERENCES public.profiles(id),
  ip                  text,
  user_agent          text,
  created_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_paramlog_chave ON public.parametros_precificacao_log(parametro_chave, created_at DESC);
CREATE INDEX idx_paramlog_usuario ON public.parametros_precificacao_log(usuario_id);

-- ===== 3. RLS =====

ALTER TABLE public.parametros_precificacao ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.parametros_precificacao_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "params_auth_read" ON public.parametros_precificacao
  FOR SELECT USING (auth.uid() IS NOT NULL);

CREATE POLICY "params_admin_write" ON public.parametros_precificacao
  FOR ALL USING (public.is_admin());

CREATE POLICY "paramlog_admin_read" ON public.parametros_precificacao_log
  FOR SELECT USING (public.is_admin());

CREATE POLICY "paramlog_auth_insert" ON public.parametros_precificacao_log
  FOR INSERT WITH CHECK (auth.uid() = usuario_id);

-- ===== 4. VIEW DE PARÂMETROS VIGENTES =====

CREATE OR REPLACE VIEW public.v_parametros_vigentes AS
SELECT
  grupo,
  chave,
  descricao,
  COALESCE(valor_numero::text, valor_texto, valor_json::text) AS valor,
  valor_numero,
  valor_texto,
  valor_json,
  unidade,
  vigente_de,
  alterado_por
FROM public.parametros_precificacao
WHERE vigente_ate IS NULL AND ativo = true
ORDER BY grupo, chave;

-- ===== 5. RPC PARA EDITAR PARÂMETRO (transação atômica) =====

CREATE OR REPLACE FUNCTION public.editar_parametro_precificacao(
  p_chave text,
  p_valor_numero numeric DEFAULT NULL,
  p_valor_texto text DEFAULT NULL,
  p_valor_json jsonb DEFAULT NULL,
  p_motivo text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_param record;
  v_valor_antigo jsonb;
  v_valor_novo jsonb;
BEGIN
  -- Só admin pode editar
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Permissão negada — apenas admin pode editar parâmetros';
  END IF;

  -- Motivo obrigatório
  IF p_motivo IS NULL OR length(p_motivo) < 10 THEN
    RAISE EXCEPTION 'Motivo da alteração obrigatório (mín 10 chars)';
  END IF;

  -- Buscar vigente
  SELECT * INTO v_param FROM public.parametros_precificacao
  WHERE chave = p_chave AND vigente_ate IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Parâmetro % não encontrado', p_chave;
  END IF;

  -- Snapshots
  v_valor_antigo := jsonb_build_object(
    'valor_numero', v_param.valor_numero,
    'valor_texto', v_param.valor_texto,
    'valor_json', v_param.valor_json
  );

  v_valor_novo := jsonb_build_object(
    'valor_numero', p_valor_numero,
    'valor_texto', p_valor_texto,
    'valor_json', p_valor_json
  );

  -- Log
  INSERT INTO public.parametros_precificacao_log
    (parametro_chave, valor_anterior, valor_novo, motivo, usuario_id)
  VALUES
    (p_chave, v_valor_antigo, v_valor_novo, p_motivo, auth.uid());

  -- Encerrar vigência antiga
  UPDATE public.parametros_precificacao
  SET vigente_ate = current_date - 1
  WHERE chave = p_chave AND vigente_ate IS NULL;

  -- Inserir novo registro
  INSERT INTO public.parametros_precificacao
    (grupo, chave, descricao, valor_numero, valor_texto, valor_json,
     unidade, valor_minimo, valor_maximo, requer_aprovacao_kalebe,
     alterado_por, motivo_alteracao)
  VALUES
    (v_param.grupo, p_chave, v_param.descricao,
     p_valor_numero, p_valor_texto, p_valor_json,
     v_param.unidade, v_param.valor_minimo, v_param.valor_maximo,
     v_param.requer_aprovacao_kalebe,
     auth.uid(), p_motivo);

  RETURN jsonb_build_object('sucesso', true, 'parametro', p_chave);
END;
$$;

-- ===== 6. SEED — Parâmetros vigentes da Spin Solar (junho/2026) =====

INSERT INTO public.parametros_precificacao
  (grupo, chave, descricao, valor_numero, unidade, valor_minimo, valor_maximo, requer_aprovacao_kalebe)
VALUES
  -- MARGEM
  ('margem', 'margem_contribuicao_perc', 'Margem de contribuição padrão sobre o PV', 20.00, '%', 15.00, 35.00, false),
  ('margem', 'margem_minima_negociacao_perc', 'Margem mínima permitida em negociação', 15.00, '%', 10.00, 20.00, true),

  -- COMISSÃO
  ('comissao', 'comissao_vendedor_perc', 'Comissão do vendedor sobre o PV', 5.00, '%', 3.00, 8.00, false),
  ('comissao', 'cashback_indicador_perc', 'Cashback p/ cliente que indicou venda', 2.00, '%', 0.00, 5.00, false),

  -- PROJETO
  ('projeto', 'projeto_valor_fixo_ate_30kwp', 'Projeto + ART para até 30 kWp (valor fixo)', 400.00, 'R$', 200.00, 800.00, false),
  ('projeto', 'projeto_rs_por_kwp_acima_30kwp', 'R$ por kWp acima de 30,01 kWp', 30.00, 'R$/kWp', 15.00, 50.00, false),

  -- FRETE
  ('frete', 'frete_ate_16_placas', 'Frete para projetos até 16 placas', 300.00, 'R$', 100.00, 1000.00, false),
  ('frete', 'frete_acima_16_placas', 'Frete para projetos com 17+ placas', 600.00, 'R$', 200.00, 2000.00, false),
  ('frete', 'frete_km_extra_fora_raio', 'R$ por km extra fora do raio SC (150km)', 2.80, 'R$/km', NULL, NULL, false),

  -- IMPOSTOS
  ('impostos', 'aliquota_simples_perc', 'Alíquota Simples Nacional vigente', 6.00, '%', 4.00, 19.00, true),
  ('impostos', 'iss_municipal_perc', 'ISS Tijucas (já embutido no Simples)', 2.00, '%', 2.00, 5.00, true),

  -- DESCONTOS
  ('descontos', 'desconto_pix_perc', 'Desconto para pagamento à vista PIX', 5.00, '%', 0.00, 10.00, false),
  ('descontos', 'desconto_ted_boleto_perc', 'Desconto para TED/boleto à vista', 3.00, '%', 0.00, 8.00, false),
  ('descontos', 'desconto_indicacao_perc', 'Desconto cliente indicado', 2.00, '%', 0.00, 5.00, false),
  ('descontos', 'desconto_recorrente_perc', 'Desconto cliente recorrente Spin', 3.00, '%', 0.00, 8.00, false),

  -- LIMITES
  ('limites', 'prazo_validade_orcamento_dias', 'Validade padrão do orçamento (dias)', 15.00, 'dias', 7.00, 60.00, false),
  ('limites', 'valor_minimo_orcamento_rs', 'Orçamento mínimo aceito (abaixo declina)', 3000.00, 'R$', NULL, NULL, true),
  ('limites', 'max_parcelas_cartao', 'Máximo parcelas no cartão sem juros', 18.00, 'parcelas', 1.00, 24.00, false),
  ('limites', 'max_parcelas_financiamento', 'Máximo parcelas no financiamento bancário', 72.00, 'parcelas', 12.00, 120.00, false),

  -- FINANCIAMENTO
  ('financiamento', 'taxa_juros_perc_mes_estimada', 'Taxa juros mensal estimada CDC solar', 1.49, '%/mês', 0.50, 3.00, false),

  -- KIT WEG (fator de conversão tabela → preço real cliente)
  ('kit_weg', 'fator_kit_weg_preco_cliente',
   'Fator que converte preço de tabela WEG no preço real ao cliente final. Vale pra TODOS itens do catálogo WEG. Reflete política de desconto integrador autorizado.',
   0.4182, 'decimal', 0.20, 0.80, true);

-- Tabela de instalação como JSON
INSERT INTO public.parametros_precificacao
  (grupo, chave, descricao, valor_json, unidade, requer_aprovacao_kalebe)
VALUES
  ('instalacao', 'tabela_instalacao_rs_placa',
   'Tabela R$ por placa instalada — em 5 faixas',
   '[
     {"faixa": 1, "placas_min": 1,   "placas_max": 15,    "rs_por_placa": 80},
     {"faixa": 2, "placas_min": 16,  "placas_max": 30,    "rs_por_placa": 70},
     {"faixa": 3, "placas_min": 31,  "placas_max": 100,   "rs_por_placa": 60},
     {"faixa": 4, "placas_min": 101, "placas_max": 200,   "rs_por_placa": 50},
     {"faixa": 5, "placas_min": 201, "placas_max": null,  "rs_por_placa": 45}
   ]'::jsonb,
   'R$/placa',
   false);

-- ===== FIM =====
