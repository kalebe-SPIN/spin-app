-- =================================================================
-- Migration 005 — Projetos (workflow proposta on-grid + híbrido)
-- Aplicar via Supabase Dashboard > SQL Editor
-- =================================================================

-- ===== 1. ENUM de status do projeto =====

CREATE TYPE projeto_status AS ENUM (
  'rascunho',                -- Consultor criou mas ainda não concluiu form
  'fatura_analisada',        -- /analista-de-faturas rodou
  'telhado_preenchido',      -- Form telhado completo
  'dimensionado',            -- /mestre-da-eletrica gerou candidatos
  'kit_selecionado',         -- Consultor escolheu placa + inversor
  'lista_ca_confirmada',     -- Consultor passou pelo pop-up
  'orcamento_gerado',        -- /orcamentista calculou PV final
  'proposta_enviada',        -- PDF enviado ao cliente
  'aceito',                  -- Cliente assinou
  'recusado',                -- Cliente recusou
  'cancelado',               -- Cancelado por algum motivo
  'expirado'                 -- Passou da validade (15 dias)
);

-- ===== 2. PROJETOS — tabela principal =====

CREATE TABLE public.projetos (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  codigo          text UNIQUE NOT NULL,        -- ex: "SPIN-2026-0001" (gerado por trigger)

  -- ===== Dados básicos do cliente =====
  cliente_razao_social  text NOT NULL,
  cliente_cpf_cnpj      text NOT NULL,
  cliente_email         text,
  cliente_telefone      text NOT NULL,
  cliente_endereco      jsonb,                -- {logradouro, bairro, cidade, uf, cep, coordenadas_gps}

  -- ===== UC geradora + beneficiárias =====
  uc_geradora           text NOT NULL,        -- UC principal CELESC
  ucs_beneficiarias     text[] DEFAULT '{}',  -- lista de UCs

  -- ===== Tipo de projeto =====
  tipo_projeto          text NOT NULL,        -- 'ongrid' | 'hibrido_bess' | 'expansao_ongrid' | 'expansao_hibrido'
  motivacao_cliente     text,                 -- 'reduzir_conta' | 'sustentabilidade' | 'independencia' | etc

  -- ===== Status workflow =====
  status                projeto_status NOT NULL DEFAULT 'rascunho',

  -- ===== Outputs das skills (snapshots em JSONB) =====
  analise_fatura        jsonb,                -- output do /analista-de-faturas
  projeto_tecnico       jsonb,                -- output do /mestre-da-eletrica (dimensionamento+candidatos)
  kit_selecionado       jsonb,                -- escolha do consultor (placa+inversor)
  lista_ca_confirmada   jsonb,                -- lista CA após pop-up
  orcamento_final       jsonb,                -- output do /orcamentista-on-grid

  -- ===== Consultor responsável =====
  consultor_id          uuid NOT NULL REFERENCES public.profiles(id),

  -- ===== Datas-chave =====
  data_inicio           timestamptz NOT NULL DEFAULT now(),
  data_orcamento_gerado timestamptz,
  data_validade         date,                  -- validade da proposta
  data_aceito           timestamptz,
  data_instalacao_prevista date,

  -- ===== Observações livres =====
  observacoes_consultor text,
  observacoes_tecnicas  text,

  -- ===== Metadados =====
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_projetos_consultor ON public.projetos(consultor_id);
CREATE INDEX idx_projetos_status ON public.projetos(status);
CREATE INDEX idx_projetos_cliente_cpf ON public.projetos(cliente_cpf_cnpj);
CREATE INDEX idx_projetos_codigo ON public.projetos(codigo);
CREATE INDEX idx_projetos_uc ON public.projetos(uc_geradora);

-- ===== 3. SEÇÕES DO TELHADO — múltiplas faces possíveis =====

CREATE TABLE public.projetos_telhado_secoes (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  projeto_id      uuid NOT NULL REFERENCES public.projetos(id) ON DELETE CASCADE,

  ordem           int NOT NULL,               -- 1, 2, 3...
  identificador   text,                        -- "Galpão fundos", "Casa principal"

  -- Características físicas
  tipo_cobertura  text NOT NULL,              -- 'fibrocimento' | 'ceramica_colonial' | 'metalico_trapezoidal' | etc
  idade_anos      int,
  area_m2         numeric(8,2) NOT NULL,
  orientacao      text NOT NULL,              -- 'N' | 'NE' | 'NO' | 'L' | 'O' | 'SE' | 'SO' | 'S' | 'horizontal'
  inclinacao_graus numeric(4,1),

  -- Sombreamento
  tem_sombreamento boolean DEFAULT false,
  sombreamento_descricao text,
  sombreamento_horario text,                  -- ex: "8-9h da manhã"
  sombreamento_severidade text,               -- 'leve' | 'moderada' | 'pesada'

  -- Estrutura
  material_estrutura text,                    -- 'madeira' | 'metalica' | 'concreto'
  altura_telhado_m numeric(5,2),              -- vs QGBT
  observacoes     text,

  -- Cálculo (preenchido pelo /mestre-da-eletrica)
  qtd_placas_alocadas int,
  potencia_alocada_kwp numeric(8,3),
  geracao_estimada_kwh_mes numeric(10,2),
  eficiencia_relativa_perc numeric(5,2),
  estrutura_kit_codigo_weg text,

  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_telhado_secoes_projeto ON public.projetos_telhado_secoes(projeto_id);

-- ===== 4. ANEXOS — fotos, faturas, plantas =====

CREATE TABLE public.projetos_anexos (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  projeto_id      uuid NOT NULL REFERENCES public.projetos(id) ON DELETE CASCADE,

  categoria       text NOT NULL,              -- 'fatura_celesc' | 'foto_telhado' | 'foto_padrao_entrada' | 'foto_qgbt' | 'planta_arquitetonica' | 'outro'
  descricao       text,

  url_storage     text NOT NULL,              -- caminho no Supabase Storage
  nome_arquivo    text NOT NULL,
  tamanho_bytes   bigint,
  mime_type       text,

  uploaded_by     uuid REFERENCES public.profiles(id),
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_anexos_projeto ON public.projetos_anexos(projeto_id);
CREATE INDEX idx_anexos_categoria ON public.projetos_anexos(categoria);

-- ===== 5. RLS — quem vê o quê =====

ALTER TABLE public.projetos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.projetos_telhado_secoes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.projetos_anexos ENABLE ROW LEVEL SECURITY;

-- Consultor vê só seus próprios projetos
CREATE POLICY "projetos_consultor_read" ON public.projetos
  FOR SELECT USING (consultor_id = auth.uid());

CREATE POLICY "projetos_consultor_write" ON public.projetos
  FOR ALL USING (consultor_id = auth.uid());

-- Admin vê tudo
CREATE POLICY "projetos_admin_all" ON public.projetos
  FOR ALL USING (public.is_admin());

-- Seções e anexos: mesmas regras (via FK)
CREATE POLICY "telhado_secoes_read" ON public.projetos_telhado_secoes
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.projetos
            WHERE id = projeto_id AND (consultor_id = auth.uid() OR public.is_admin()))
  );

CREATE POLICY "telhado_secoes_write" ON public.projetos_telhado_secoes
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.projetos
            WHERE id = projeto_id AND (consultor_id = auth.uid() OR public.is_admin()))
  );

CREATE POLICY "anexos_read" ON public.projetos_anexos
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.projetos
            WHERE id = projeto_id AND (consultor_id = auth.uid() OR public.is_admin()))
  );

CREATE POLICY "anexos_write" ON public.projetos_anexos
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.projetos
            WHERE id = projeto_id AND (consultor_id = auth.uid() OR public.is_admin()))
  );

-- ===== 6. TRIGGER pra gerar código sequencial =====

CREATE OR REPLACE FUNCTION public.gerar_codigo_projeto()
RETURNS trigger AS $$
DECLARE
  v_ano text;
  v_sequencial int;
  v_codigo text;
BEGIN
  v_ano := to_char(now(), 'YYYY');

  -- Pega o próximo sequencial do ano
  SELECT COALESCE(MAX(
    CASE
      WHEN codigo ~ ('^SPIN-' || v_ano || '-[0-9]+$')
      THEN (split_part(codigo, '-', 3))::int
      ELSE 0
    END
  ), 0) + 1
  INTO v_sequencial
  FROM public.projetos;

  v_codigo := 'SPIN-' || v_ano || '-' || lpad(v_sequencial::text, 4, '0');
  NEW.codigo := v_codigo;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_projetos_codigo
  BEFORE INSERT ON public.projetos
  FOR EACH ROW
  WHEN (NEW.codigo IS NULL OR NEW.codigo = '')
  EXECUTE FUNCTION public.gerar_codigo_projeto();

-- ===== 7. TRIGGER updated_at =====

CREATE TRIGGER projetos_updated_at
  BEFORE UPDATE ON public.projetos
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER telhado_secoes_updated_at
  BEFORE UPDATE ON public.projetos_telhado_secoes
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ===== 8. STORAGE BUCKET para anexos =====
-- Executar manualmente no Supabase Dashboard > Storage:
--   1. Criar bucket "projetos-anexos" (private)
--   2. RLS policy: usuário só lê/escreve em paths que começam com seu user_id

-- ===== FIM =====
