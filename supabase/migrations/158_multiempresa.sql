-- =================================================================
-- 158 — Multiempresa (Kalebe 2026-10-19)
-- "Cadastrar uma nova empresa/marca com um novo fornecedor que atenda ela —
--  integração via chave de API pra tabela de preços e montagem de kits.
--  Tudo o resto se mantém igual: na hora do kit o usuário escolhe de qual CNPJ
--  é a proposta e isso define o fornecedor; o cliente ganha a etiqueta da
--  empresa no Spinzap."
--
--  - catalogo_fornecedores: de onde vem o catálogo/kit — WEG (planilha) e os
--    de API. (public.fornecedores é o cadastro do Financeiro; aqui só liga)
--  - catalogo_fornecedores_credenciais: chave da API, SÓ o servidor lê
--  - empresas: CNPJ/marca com os campos de configuracoes_empresa (o PDF da
--    proposta sai com a marca da empresa); uma é a padrão (Spin)
--  - produtos.catalogo_fornecedor_id: NULL = catálogo atual da Spin (planilha
--    WEG + cadastros manuais); produto do fornecedor de API leva o id dele
--  - projetos.empresa_id: de qual CNPJ é a proposta (NULL = empresa padrão)
-- Parâmetros de precificação continuam os mesmos pras duas empresas.
-- Tudo numa transação: ou aplica inteiro, ou nada.
-- =================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.catalogo_fornecedores (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome                     text NOT NULL UNIQUE,
  tipo                     text NOT NULL DEFAULT 'planilha' CHECK (tipo IN ('planilha', 'api')),
  -- Cadastro do Financeiro (contas a pagar, Spinzap)
  fornecedor_financeiro_id uuid REFERENCES public.fornecedores(id) ON DELETE SET NULL,
  api_base_url             text,
  -- Ajustes da integração (rotas, formato, fator de preço quando definido…)
  api_config               jsonb NOT NULL DEFAULT '{}'::jsonb,
  ultima_sincronizacao_em  timestamptz,
  ultima_sincronizacao_log text,
  ativo                    boolean NOT NULL DEFAULT true,
  criado_em                timestamptz NOT NULL DEFAULT now(),
  atualizado_em            timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.catalogo_fornecedores_credenciais (
  catalogo_fornecedor_id uuid PRIMARY KEY REFERENCES public.catalogo_fornecedores(id) ON DELETE CASCADE,
  api_chave              text,
  atualizado_em          timestamptz NOT NULL DEFAULT now(),
  atualizado_por         uuid REFERENCES public.profiles(id)
);

CREATE TABLE IF NOT EXISTS public.empresas (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome                   text NOT NULL,                 -- marca (etiqueta no Spinzap)
  razao_social           text NOT NULL,
  cnpj                   text NOT NULL UNIQUE,
  catalogo_fornecedor_id uuid REFERENCES public.catalogo_fornecedores(id),
  endereco               text,
  telefone               text,
  email                  text,
  site                   text,
  logo_url               text,
  papel_timbrado_url     text,
  rt_nome                text,
  rt_titulo              text,
  rt_crea                text,
  rt_art_padrao          text,
  rt_telefone            text,
  rt_email               text,
  rt_assinatura_url      text,
  cor                    text,                          -- borda da etiqueta
  padrao                 boolean NOT NULL DEFAULT false,
  ativo                  boolean NOT NULL DEFAULT true,
  criado_em              timestamptz NOT NULL DEFAULT now(),
  atualizado_em          timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS empresas_uma_padrao ON public.empresas (padrao) WHERE padrao;

ALTER TABLE public.produtos ADD COLUMN IF NOT EXISTS catalogo_fornecedor_id uuid REFERENCES public.catalogo_fornecedores(id);
-- Código do produto no fornecedor de API (sincroniza sem duplicar)
ALTER TABLE public.produtos ADD COLUMN IF NOT EXISTS fornecedor_codigo text;
CREATE INDEX IF NOT EXISTS idx_produtos_catalogo_fornecedor ON public.produtos (catalogo_fornecedor_id);
CREATE UNIQUE INDEX IF NOT EXISTS produtos_fornecedor_codigo_uk ON public.produtos (catalogo_fornecedor_id, fornecedor_codigo)
  WHERE catalogo_fornecedor_id IS NOT NULL AND fornecedor_codigo IS NOT NULL;

ALTER TABLE public.projetos ADD COLUMN IF NOT EXISTS empresa_id uuid REFERENCES public.empresas(id);
CREATE INDEX IF NOT EXISTS idx_projetos_empresa ON public.projetos (empresa_id);

-- RLS: equipe lê empresas e fornecedores de catálogo; admin grava.
-- Credenciais: nenhuma policy — só o servidor (service role).
ALTER TABLE public.catalogo_fornecedores ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.catalogo_fornecedores_credenciais ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.empresas ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS catalogo_fornecedores_auth_read ON public.catalogo_fornecedores;
CREATE POLICY catalogo_fornecedores_auth_read ON public.catalogo_fornecedores FOR SELECT USING (auth.uid() IS NOT NULL);
DROP POLICY IF EXISTS catalogo_fornecedores_admin_write ON public.catalogo_fornecedores;
CREATE POLICY catalogo_fornecedores_admin_write ON public.catalogo_fornecedores FOR ALL USING (public.is_admin());
DROP POLICY IF EXISTS empresas_auth_read ON public.empresas;
CREATE POLICY empresas_auth_read ON public.empresas FOR SELECT USING (auth.uid() IS NOT NULL);
DROP POLICY IF EXISTS empresas_admin_write ON public.empresas;
CREATE POLICY empresas_admin_write ON public.empresas FOR ALL USING (public.is_admin());

-- Dados atuais: WEG (planilha) e a Spin como empresa padrão, copiando configuracoes_empresa
INSERT INTO public.catalogo_fornecedores (nome, tipo) VALUES ('WEG', 'planilha') ON CONFLICT (nome) DO NOTHING;

INSERT INTO public.empresas (
  nome, razao_social, cnpj, catalogo_fornecedor_id, endereco, telefone, email, site, logo_url, papel_timbrado_url,
  rt_nome, rt_titulo, rt_crea, rt_art_padrao, rt_telefone, rt_email, rt_assinatura_url, padrao
)
SELECT 'Spin Solar', c.razao_social, COALESCE(NULLIF(c.cnpj, ''), 'SEM-CNPJ'),
       (SELECT id FROM public.catalogo_fornecedores WHERE nome = 'WEG'),
       c.endereco, c.telefone, c.email, c.site, c.logo_url, c.papel_timbrado_url,
       c.rt_nome, c.rt_titulo, c.rt_crea, c.rt_art_padrao, c.rt_telefone, c.rt_email, c.rt_assinatura_url, true
  FROM public.configuracoes_empresa c
 WHERE NOT EXISTS (SELECT 1 FROM public.empresas WHERE padrao)
 LIMIT 1;

COMMENT ON TABLE public.empresas IS 'CNPJs/marcas que emitem proposta (Kalebe 2026-10-19). A padrão é a Spin; a escolha no kit define o fornecedor.';
COMMENT ON TABLE public.catalogo_fornecedores IS 'De onde vem o catálogo e o kit de cada empresa: WEG por planilha, outros por API.';
COMMENT ON COLUMN public.produtos.catalogo_fornecedor_id IS 'NULL = catálogo da Spin (planilha WEG + cadastros manuais). Preenchido = produto do fornecedor de API.';
COMMENT ON COLUMN public.projetos.empresa_id IS 'De qual CNPJ é a proposta (NULL = empresa padrão).';

COMMIT;
