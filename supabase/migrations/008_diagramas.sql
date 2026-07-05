-- =================================================================
-- Migration 008 — Gerador de Diagramas
-- Tabelas: configuracoes_empresa, projetos_diagramas
-- Permissão: pode_gerar_diagramas em profiles
-- =================================================================

-- ===== 1. CONFIGURAÇÕES DA EMPRESA (dados fixos usados em todos diagramas) =====
CREATE TABLE IF NOT EXISTS public.configuracoes_empresa (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  singleton             boolean UNIQUE DEFAULT true,   -- só 1 registro na tabela

  -- Empresa
  razao_social          text NOT NULL DEFAULT 'Spin Solar Energias Renováveis Ltda',
  cnpj                  text,
  endereco              text,
  telefone              text,
  email                 text,
  site                  text,
  logo_url              text,                          -- Supabase Storage

  -- Responsável técnico (nome + CREA + contato)
  rt_nome               text NOT NULL DEFAULT '',
  rt_titulo             text DEFAULT 'Eletrotécnico', -- Engenheiro Eletricista / Eletrotécnico / etc
  rt_crea               text,                          -- ex: "SC-123456"
  rt_art_padrao         text,                          -- número da ART padrão (opcional)
  rt_telefone           text,
  rt_email              text,
  rt_assinatura_url     text,                          -- imagem PNG da assinatura escaneada

  updated_at            timestamptz NOT NULL DEFAULT now()
);

-- ===== 2. PERMISSÃO — quem pode gerar diagramas =====
ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS pode_gerar_diagramas boolean NOT NULL DEFAULT false;

-- Admin sempre pode. Outros usuários precisam de flag explícita.
-- (a lógica de "admin sempre" fica no app; a flag é pra dar acesso a não-admin)

-- ===== 3. DIAGRAMAS GERADOS (versionamento por projeto) =====
CREATE TABLE IF NOT EXISTS public.projetos_diagramas (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  projeto_id            uuid NOT NULL REFERENCES public.projetos(id) ON DELETE CASCADE,

  versao                int NOT NULL,                  -- 1, 2, 3... incrementa por regeração
  tipo_desenho          text NOT NULL,                 -- 'unifilar_ongrid' | 'unifilar_hibrido' | 'padrao_entrada' | 'layout'

  -- Arquivos (Supabase Storage)
  url_pdf               text,
  url_dxf               text,
  url_svg               text,
  url_dwg               text,                          -- opcional (via conversão ODA)

  -- Metadata técnica
  memoria_calculo       jsonb,                         -- output do /mestre-da-eletrica
  avisos                text[] DEFAULT '{}',           -- oversizing, bitola, enquadramento BT/MT etc

  -- Snapshot da config empresa no momento da geração (pra rastreabilidade)
  snapshot_empresa      jsonb,

  -- Auditoria
  gerado_por            uuid REFERENCES public.profiles(id),
  status                text NOT NULL DEFAULT 'gerando',  -- gerando | pronto | erro
  erro_mensagem         text,
  created_at            timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_diagramas_projeto ON public.projetos_diagramas(projeto_id);
CREATE INDEX IF NOT EXISTS idx_diagramas_versao ON public.projetos_diagramas(projeto_id, versao DESC);

-- ===== 4. RLS =====
ALTER TABLE public.configuracoes_empresa ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.projetos_diagramas ENABLE ROW LEVEL SECURITY;

-- Config empresa: todos autenticados leem (pra estampar em qq diagrama), só admin escreve
CREATE POLICY "empresa_auth_read" ON public.configuracoes_empresa
  FOR SELECT USING (auth.uid() IS NOT NULL);

CREATE POLICY "empresa_admin_write" ON public.configuracoes_empresa
  FOR ALL USING (public.is_admin());

-- Diagramas: admin + quem tem pode_gerar_diagramas
CREATE POLICY "diagramas_admin_all" ON public.projetos_diagramas
  FOR ALL USING (public.is_admin());

CREATE POLICY "diagramas_autorizado_read" ON public.projetos_diagramas
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid()
        AND (role = 'admin' OR pode_gerar_diagramas = true)
    )
  );

CREATE POLICY "diagramas_autorizado_insert" ON public.projetos_diagramas
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid()
        AND (role = 'admin' OR pode_gerar_diagramas = true)
    )
  );

-- ===== 5. SEED — insere registro único de configuracoes_empresa =====
INSERT INTO public.configuracoes_empresa (razao_social)
VALUES ('Spin Solar Energias Renováveis Ltda')
ON CONFLICT (singleton) DO NOTHING;
