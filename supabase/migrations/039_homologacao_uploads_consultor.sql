-- ============================================================================
-- Migration 039: Uploads obrigatórios do consultor pra liberar homologação
-- ============================================================================
-- Kalebe: consultor deve enviar 4 documentos antes de o sistema gerar os
-- arquivos das etapas da homologação. Sem os 4, tudo fica bloqueado.
--
-- Documentos obrigatórios:
--   1. Foto do disjuntor geral do padrão de entrada
--   2. Foto do padrão de entrada (todo)
--   3. Foto da fachada do imóvel
--   4. PDF da fatura da instalação
-- ============================================================================

-- Colunas com URLs dos uploads (nullable até serem enviados)
ALTER TABLE public.homologacoes
  ADD COLUMN IF NOT EXISTS foto_disjuntor_url          text,
  ADD COLUMN IF NOT EXISTS foto_disjuntor_enviado_em   timestamptz,
  ADD COLUMN IF NOT EXISTS foto_padrao_entrada_url     text,
  ADD COLUMN IF NOT EXISTS foto_padrao_entrada_enviado_em timestamptz,
  ADD COLUMN IF NOT EXISTS foto_fachada_url            text,
  ADD COLUMN IF NOT EXISTS foto_fachada_enviado_em     timestamptz,
  ADD COLUMN IF NOT EXISTS pdf_fatura_instalacao_url   text,
  ADD COLUMN IF NOT EXISTS pdf_fatura_enviado_em       timestamptz,
  ADD COLUMN IF NOT EXISTS documentos_completos_em     timestamptz;

COMMENT ON COLUMN public.homologacoes.documentos_completos_em IS
  'Timestamp quando o consultor completou os 4 uploads. Preenchido automaticamente. Dispara geração dos arquivos das etapas.';

-- Bucket pra uploads do consultor (privado, mais restrito que o bucket dos arquivos gerados)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'homologacao-consultor',
  'homologacao-consultor',
  false,  -- privado (fotos e fatura são dados sensíveis do cliente)
  10485760,  -- 10MB por arquivo
  ARRAY[
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/heic',
    'application/pdf'
  ]
)
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- RLS bucket consultor
DROP POLICY IF EXISTS "homologacao_consultor_upload" ON storage.objects;
CREATE POLICY "homologacao_consultor_upload" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'homologacao-consultor' AND auth.uid() IS NOT NULL
  );

DROP POLICY IF EXISTS "homologacao_consultor_read" ON storage.objects;
CREATE POLICY "homologacao_consultor_read" ON storage.objects
  FOR SELECT USING (
    bucket_id = 'homologacao-consultor' AND auth.uid() IS NOT NULL
  );

DROP POLICY IF EXISTS "homologacao_consultor_update" ON storage.objects;
CREATE POLICY "homologacao_consultor_update" ON storage.objects
  FOR UPDATE USING (
    bucket_id = 'homologacao-consultor' AND auth.uid() IS NOT NULL
  );

DROP POLICY IF EXISTS "homologacao_consultor_delete" ON storage.objects;
CREATE POLICY "homologacao_consultor_delete" ON storage.objects
  FOR DELETE USING (
    bucket_id = 'homologacao-consultor' AND auth.uid() IS NOT NULL
  );
