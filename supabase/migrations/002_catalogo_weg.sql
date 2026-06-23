-- =================================================================
-- Migration 002 — Catálogo de produtos WEG
-- Tabelas: categorias_produto, produtos, precos_historico, estoque
-- Aplicar via Supabase Dashboard > SQL Editor
-- =================================================================

-- ===== 1. CATEGORIAS DE PRODUTO =====
-- Hierarquia: categoria principal (placa, inversor, bateria, estrutura, etc) → subcategorias

CREATE TYPE categoria_principal AS ENUM (
  'placa',                 -- módulos fotovoltaicos
  'inversor',              -- inversor string / micro / central
  'bateria',               -- BESS
  'estrutura',             -- perfis, ganchos, fixadores
  'cabo_cc',               -- cabos lado CC (4mm² solar, etc)
  'cabo_ca',               -- cabos lado CA (EPR, PVC, etc)
  'conector',              -- MC4, terminais
  'string_box',            -- caixa de strings
  'disjuntor',             -- proteção CA/CC
  'dps',                   -- protetor surto
  'eletroduto',            -- conduítes
  'aterramento',           -- haste, cabo nu
  'quadro',                -- Q-FV, subquadros
  'smart_meter',           -- medidor anti-injeção
  'monitoramento',         -- gateway, sensor
  'mao_de_obra',           -- serviços (homem-hora)
  'projeto_engenharia',    -- ART, projeto, homologação
  'frete',                 -- logística
  'identificacao',         -- placas NR-10, etiquetas
  'outro'
);

-- ===== 2. PRODUTOS — tabela principal do catálogo WEG =====

CREATE TABLE public.produtos (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  codigo_weg          text UNIQUE,                  -- código oficial WEG (SKU)
  codigo_interno_spin text UNIQUE,                  -- código interno opcional
  modelo              text NOT NULL,                -- ex: "SIW400H-ST040-N4"
  fabricante          text NOT NULL DEFAULT 'WEG',  -- WEG / outro
  categoria           categoria_principal NOT NULL,
  subcategoria        text,                         -- ex: "string trifásico", "monofacial 575W"

  descricao_curta     text NOT NULL,                -- aparece em proposta
  descricao_tecnica   text,                         -- ficha técnica completa

  -- ===== Especs técnicas — específicas por categoria =====
  -- Usando JSONB pra flexibilidade. Schema esperado por categoria:
  --
  -- placa: {
  --   potencia_w, tecnologia, voc_v, vmp_v, isc_a, imp_a,
  --   dimensoes_mm{l,c,h}, peso_kg, eficiencia_perc, garantia_produto_anos,
  --   garantia_geracao_anos, certificacao_inmetro, classe_a_inmetro
  -- }
  --
  -- inversor: {
  --   potencia_nominal_ca_kw, potencia_max_cc_kwp, qtd_mppt,
  --   qtd_entradas_por_mppt, tensao_partida_v, faixa_mppt_v{min,max},
  --   tensao_max_cc_v, corrente_max_mppt_a, tensao_saida, fases,
  --   eficiencia_max_perc, ip_protecao, garantia_anos, comunicacao[],
  --   tem_anti_injecao, suporta_bess
  -- }
  --
  -- bateria: {
  --   tecnologia, capacidade_kwh, potencia_kw, tensao_v,
  --   ciclos_garantidos, c_rate, eficiencia_round_trip_perc,
  --   tempo_vida_anos, garantia_anos, ip_protecao,
  --   topologia_compativel[]
  -- }
  --
  -- estrutura: { material, formato, comprimento_mm, capacidade_kg, telhado_compativel[] }
  -- cabo: { bitola_mm2, isolacao, tensao_max_v, cor, embalagem_m }
  -- disjuntor: { polos, corrente_a, curva, tensao_v }
  -- dps: { classe, corrente_max_a, tensao_v }
  -- aterramento: { tipo, dimensoes, material }

  specs               jsonb NOT NULL DEFAULT '{}',

  -- ===== Status =====
  ativo               boolean NOT NULL DEFAULT true,    -- catalogado pra venda?
  disponivel_estoque  boolean NOT NULL DEFAULT false,   -- tem em estoque?
  descontinuado       boolean NOT NULL DEFAULT false,   -- linha encerrada?

  -- ===== URLs =====
  url_datasheet       text,                            -- PDF do datasheet
  url_imagem          text,                            -- foto do produto
  url_manual          text,                            -- manual instalação

  -- ===== Metadados =====
  observacoes         text,
  tags                text[] DEFAULT '{}',             -- pra busca livre

  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_produtos_categoria ON public.produtos(categoria);
CREATE INDEX idx_produtos_ativo ON public.produtos(ativo) WHERE ativo = true;
CREATE INDEX idx_produtos_codigo_weg ON public.produtos(codigo_weg);
CREATE INDEX idx_produtos_specs ON public.produtos USING gin(specs);
CREATE INDEX idx_produtos_tags ON public.produtos USING gin(tags);

-- ===== 3. PREÇOS — histórico, pra rastreabilidade =====
-- Preços mudam frequentemente. Manter histórico permite reproduzir orçamentos antigos.

CREATE TABLE public.precos_produtos (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  produto_id          uuid NOT NULL REFERENCES public.produtos(id) ON DELETE CASCADE,

  -- Preços
  preco_custo         numeric(12,4) NOT NULL,         -- custo aquisição WEG
  preco_lista         numeric(12,4),                  -- preço sugerido revenda WEG
  preco_venda         numeric(12,4) NOT NULL,         -- preço final cliente (com margem Spin)
  margem_perc         numeric(5,2),                   -- margem aplicada (calculada)
  moeda               text NOT NULL DEFAULT 'BRL',

  -- Custos adicionais embutidos
  frete_origem_perc   numeric(5,2) DEFAULT 0,         -- % de frete WEG até Spin
  impostos_perc       numeric(5,2) DEFAULT 0,         -- ICMS/IPI embutido se aplicável

  unidade             text NOT NULL DEFAULT 'un',     -- un, m, kg, kit, hora

  -- Validade do preço
  vigente_de          date NOT NULL DEFAULT current_date,
  vigente_ate         date,                           -- null = atual

  -- Fonte
  fonte_planilha      text,                           -- ex: "Tabela WEG 2026-06"
  origem              text,                           -- "weg", "distribuidor_x", "manual"

  observacoes         text,
  created_at          timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT preco_positivo CHECK (preco_venda > 0)
);

CREATE INDEX idx_precos_produto ON public.precos_produtos(produto_id);
CREATE INDEX idx_precos_vigente ON public.precos_produtos(produto_id, vigente_de DESC) WHERE vigente_ate IS NULL;

-- ===== 4. ESTOQUE — controle simples por produto =====

CREATE TABLE public.estoque (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  produto_id          uuid NOT NULL REFERENCES public.produtos(id) ON DELETE CASCADE,

  quantidade_disponivel  numeric(12,3) NOT NULL DEFAULT 0,
  quantidade_reservada   numeric(12,3) NOT NULL DEFAULT 0, -- em propostas pendentes
  quantidade_minima      numeric(12,3) DEFAULT 0,           -- alerta de reposição

  localizacao         text,                                 -- "Galpão Tijucas", "Almoxarifado"

  ultima_entrada      timestamptz,
  ultima_saida        timestamptz,
  updated_at          timestamptz NOT NULL DEFAULT now(),

  UNIQUE(produto_id)
);

CREATE INDEX idx_estoque_baixo ON public.estoque(produto_id) WHERE quantidade_disponivel < quantidade_minima;

-- ===== 5. VIEW: produtos_com_preco_atual =====
-- Atalho pra consultar produto + preço vigente em uma query

CREATE OR REPLACE VIEW public.v_produtos_ativos AS
SELECT
  p.id,
  p.codigo_weg,
  p.modelo,
  p.categoria,
  p.subcategoria,
  p.descricao_curta,
  p.specs,
  pp.preco_venda,
  pp.preco_custo,
  pp.margem_perc,
  pp.unidade,
  pp.vigente_de,
  e.quantidade_disponivel,
  e.disponivel_estoque,
  p.url_datasheet,
  p.url_imagem
FROM public.produtos p
LEFT JOIN LATERAL (
  SELECT *
  FROM public.precos_produtos
  WHERE produto_id = p.id
    AND vigente_de <= current_date
    AND (vigente_ate IS NULL OR vigente_ate >= current_date)
  ORDER BY vigente_de DESC
  LIMIT 1
) pp ON true
LEFT JOIN public.estoque e ON e.produto_id = p.id
WHERE p.ativo = true
  AND p.descontinuado = false;

-- ===== 6. RLS — permissões =====

ALTER TABLE public.produtos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.precos_produtos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.estoque ENABLE ROW LEVEL SECURITY;

-- Todos os usuários autenticados leem catálogo
CREATE POLICY "produtos_auth_read" ON public.produtos
  FOR SELECT USING (auth.uid() IS NOT NULL);

CREATE POLICY "precos_auth_read" ON public.precos_produtos
  FOR SELECT USING (auth.uid() IS NOT NULL);

CREATE POLICY "estoque_auth_read" ON public.estoque
  FOR SELECT USING (auth.uid() IS NOT NULL);

-- Só admin modifica catálogo
CREATE POLICY "produtos_admin_all" ON public.produtos
  FOR ALL USING (public.is_admin());

CREATE POLICY "precos_admin_all" ON public.precos_produtos
  FOR ALL USING (public.is_admin());

CREATE POLICY "estoque_admin_all" ON public.estoque
  FOR ALL USING (public.is_admin());

-- ===== 7. CIDADES_ISOPLETA — base do cálculo de estrutura =====
-- Velocidade básica do vento (V0) por município — ABNT NBR 6123.
-- Carregado da planilha WEG "Cadastro cidades" — 5509 municípios brasileiros.
-- Usado pelo /mestre-da-eletrica pra dimensionar perfis e fixações da estrutura.

CREATE TABLE public.cidades_isopleta (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  municipio       text NOT NULL,
  uf              text NOT NULL,                   -- sigla 2 letras
  isopleta_ms     numeric(4,1) NOT NULL,           -- V0 em m/s (30, 35, 40, 45, 50)
  fonte           text DEFAULT 'planilha-weg',
  created_at      timestamptz NOT NULL DEFAULT now(),

  UNIQUE(municipio, uf)
);

CREATE INDEX idx_cidades_uf ON public.cidades_isopleta(uf);
CREATE INDEX idx_cidades_municipio ON public.cidades_isopleta(municipio);

ALTER TABLE public.cidades_isopleta ENABLE ROW LEVEL SECURITY;

CREATE POLICY "cidades_auth_read" ON public.cidades_isopleta
  FOR SELECT USING (auth.uid() IS NOT NULL);

CREATE POLICY "cidades_admin_all" ON public.cidades_isopleta
  FOR ALL USING (public.is_admin());

-- ===== 8. VERSÕES DA PLANILHA WEG — rastreabilidade =====
-- Cada vez que o admin sobe nova planilha, registra versão pra histórico.

CREATE TABLE public.planilha_weg_versoes (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome_arquivo      text NOT NULL,
  url_storage       text,                              -- supabase storage
  data_planilha     date,                              -- ex: "Junho/2026"
  qtd_produtos      int,                               -- produtos importados
  qtd_atualizados   int,                               -- preços atualizados
  qtd_novos         int,                               -- produtos novos
  importado_por     uuid REFERENCES public.profiles(id),
  observacoes       text,
  vigente           boolean NOT NULL DEFAULT false,    -- só uma versão vigente por vez
  created_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_planilha_vigente ON public.planilha_weg_versoes(vigente) WHERE vigente = true;

ALTER TABLE public.planilha_weg_versoes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "planilha_admin_all" ON public.planilha_weg_versoes
  FOR ALL USING (public.is_admin());

-- ===== 9. TRIGGER updated_at =====

CREATE TRIGGER produtos_updated_at
  BEFORE UPDATE ON public.produtos
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER estoque_updated_at
  BEFORE UPDATE ON public.estoque
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ===== FIM =====
