-- ============================================================================
-- Migration 060 — Convites de trabalho (recrutamento de candidatos)
-- ============================================================================
-- Fluxo do candidato:
--   1. Admin gera 1 login+senha (role 'candidato') em /admin/vagas.
--   2. Candidato acessa /vaga/login — o login funciona SÓ 2 vezes e depois
--      EXPIRA (bloqueado=true). Contador em convites_trabalho.entradas_usadas.
--   3. Lê a apresentação da proposta e ACEITA.
--   4. Assina o contrato digitalmente (assinatura eletrônica simples).
--   5. Envia os documentos exigidos (bucket privado).
--
-- Tudo roda numa transação só. O ALTER TYPE ADD VALUE é permitido dentro de
-- transação no Postgres do Supabase (>=12), desde que o novo valor NÃO seja
-- usado como literal na mesma transação — e não é (só é usado no app).
-- Padrão do enum idêntico ao 057_role_vendedor_servicos.sql.
-- Aplicar via Supabase Dashboard > SQL Editor.
-- ============================================================================

BEGIN;

-- ─── 1. Novo papel: candidato (idempotente) ─────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum
    WHERE enumlabel = 'candidato'
      AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'user_role')
  ) THEN
    ALTER TYPE public.user_role ADD VALUE 'candidato';
  END IF;
END $$;

-- ─── 2. Enum de status do convite ───────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'convite_status') THEN
    CREATE TYPE public.convite_status AS ENUM (
      'enviado',            -- login gerado, aguardando candidato
      'proposta_aceita',    -- candidato leu e aceitou a proposta
      'contrato_assinado',  -- candidato assinou o contrato
      'docs_enviados',      -- candidato enviou os documentos
      'concluido',          -- Spin revisou e concluiu o onboarding
      'recusado'            -- candidato recusou a proposta
    );
  END IF;
END $$;

-- ─── 3. CONVITES DE TRABALHO ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.convites_trabalho (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id            uuid UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  nome_candidato     text NOT NULL,
  email_candidato    text NOT NULL,
  telefone           text,
  cargo              text NOT NULL DEFAULT 'Representante Comercial — Serviços de O&M',
  zona               text,
  status             public.convite_status NOT NULL DEFAULT 'enviado',

  -- Controle de acesso: 1 login, SÓ 2 entradas, depois expira
  entradas_usadas    int NOT NULL DEFAULT 0,
  max_entradas       int NOT NULL DEFAULT 2,
  bloqueado          boolean NOT NULL DEFAULT false,
  ultimo_acesso_em   timestamptz,

  -- URL do PDF da proposta (disponível pro candidato após aceitar)
  url_pdf_proposta   text,

  -- Marcos do funil
  proposta_aceita_em    timestamptz,
  contrato_assinado_em  timestamptz,
  docs_enviados_em      timestamptz,
  recusado_em           timestamptz,
  motivo_recusa         text,

  created_by         uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_convites_user ON public.convites_trabalho(user_id);
CREATE INDEX IF NOT EXISTS idx_convites_status ON public.convites_trabalho(status);

-- ─── 4. ASSINATURAS DO CONTRATO (assinatura eletrônica simples) ──────────────
-- Base legal: MP 2.200-2/2001 e Lei 14.063/2020 (assinatura eletrônica simples
-- com trilha de auditoria). Para assinatura qualificada/ICP-Brasil, plugar
-- provedor (Clicksign/D4Sign) depois.
CREATE TABLE IF NOT EXISTS public.assinaturas_contrato (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  convite_id       uuid NOT NULL REFERENCES public.convites_trabalho(id) ON DELETE CASCADE,
  nome_assinante   text NOT NULL,
  cpf              text NOT NULL,
  aceite_texto     text NOT NULL,
  documento_versao text NOT NULL DEFAULT 'v1',
  documento_hash   text,                   -- SHA-256 do texto do contrato assinado
  ip               text,
  user_agent       text,
  assinado_em      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_assinaturas_convite ON public.assinaturas_contrato(convite_id);

-- ─── 5. DOCUMENTOS ENVIADOS PELO CANDIDATO ──────────────────────────────────
CREATE TABLE IF NOT EXISTS public.documentos_candidato (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  convite_id    uuid NOT NULL REFERENCES public.convites_trabalho(id) ON DELETE CASCADE,
  tipo          text NOT NULL,             -- 'rg_cpf', 'cnpj', 'comprovante_endereco', 'dados_bancarios'
  nome_arquivo  text NOT NULL,
  arquivo_path  text NOT NULL,             -- caminho no bucket documentos-candidatos
  status        text NOT NULL DEFAULT 'enviado',  -- enviado | aprovado | reprovado
  observacao    text,
  enviado_em    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_docs_convite ON public.documentos_candidato(convite_id);

-- ─── 6. STORAGE — bucket privado dos documentos do candidato ────────────────
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'documentos-candidatos',
  'documentos-candidatos',
  false,   -- PRIVADO — contém dados pessoais
  10485760,
  ARRAY['application/pdf','image/jpeg','image/png','image/webp']
)
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- ─── 7. ROW LEVEL SECURITY ──────────────────────────────────────────────────
ALTER TABLE public.convites_trabalho    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.assinaturas_contrato ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.documentos_candidato ENABLE ROW LEVEL SECURITY;

-- convites: candidato vê/atualiza só o próprio; admin tudo (is_admin() da mig 001)
DROP POLICY IF EXISTS "convite_self_read" ON public.convites_trabalho;
CREATE POLICY "convite_self_read" ON public.convites_trabalho
  FOR SELECT USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "convite_self_update" ON public.convites_trabalho;
CREATE POLICY "convite_self_update" ON public.convites_trabalho
  FOR UPDATE USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "convite_admin_all" ON public.convites_trabalho;
CREATE POLICY "convite_admin_all" ON public.convites_trabalho
  FOR ALL USING (public.is_admin());

-- assinaturas: candidato insere/lê as do próprio convite; admin tudo
DROP POLICY IF EXISTS "assinatura_self_read" ON public.assinaturas_contrato;
CREATE POLICY "assinatura_self_read" ON public.assinaturas_contrato
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.convites_trabalho c
            WHERE c.id = convite_id AND c.user_id = auth.uid())
  );
DROP POLICY IF EXISTS "assinatura_self_insert" ON public.assinaturas_contrato;
CREATE POLICY "assinatura_self_insert" ON public.assinaturas_contrato
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM public.convites_trabalho c
            WHERE c.id = convite_id AND c.user_id = auth.uid())
  );
DROP POLICY IF EXISTS "assinatura_admin_all" ON public.assinaturas_contrato;
CREATE POLICY "assinatura_admin_all" ON public.assinaturas_contrato
  FOR ALL USING (public.is_admin());

-- documentos: candidato insere/lê os do próprio convite; admin tudo
DROP POLICY IF EXISTS "doc_self_read" ON public.documentos_candidato;
CREATE POLICY "doc_self_read" ON public.documentos_candidato
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.convites_trabalho c
            WHERE c.id = convite_id AND c.user_id = auth.uid())
  );
DROP POLICY IF EXISTS "doc_self_insert" ON public.documentos_candidato;
CREATE POLICY "doc_self_insert" ON public.documentos_candidato
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM public.convites_trabalho c
            WHERE c.id = convite_id AND c.user_id = auth.uid())
  );
DROP POLICY IF EXISTS "doc_admin_all" ON public.documentos_candidato;
CREATE POLICY "doc_admin_all" ON public.documentos_candidato
  FOR ALL USING (public.is_admin());

-- storage: acesso autenticado ao bucket privado (upload/leitura passam pelo
-- service role nas server actions; esta policy libera o acesso autenticado).
DROP POLICY IF EXISTS "docs_cand_auth_all" ON storage.objects;
CREATE POLICY "docs_cand_auth_all" ON storage.objects
  FOR ALL USING (
    bucket_id = 'documentos-candidatos' AND auth.uid() IS NOT NULL
  ) WITH CHECK (
    bucket_id = 'documentos-candidatos' AND auth.uid() IS NOT NULL
  );

COMMIT;
