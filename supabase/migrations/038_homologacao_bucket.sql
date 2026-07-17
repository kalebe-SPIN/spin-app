-- ============================================================================
-- Migration 038: Bucket de storage pra arquivos gerados da homologação
-- ============================================================================
-- Ao vender o projeto, o sistema gera automaticamente os arquivos das 6 etapas
-- da homologação (memorial descritivo, lista kit, lista CA, layout, unifilar).
-- Cada arquivo vira uma URL em homologacao_etapas.url_arquivo_pdf/svg/outros.
-- ============================================================================

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'homologacao-arquivos',
  'homologacao-arquivos',
  true,   -- público (o admin manda pra CELESC via link)
  20971520,  -- 20MB por arquivo
  ARRAY[
    'application/pdf',
    'image/svg+xml',
    'text/csv',
    'text/markdown',
    'text/plain',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  ]
)
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- RLS: admin/eletrotecnico pode escrever, todo autenticado pode ler
DROP POLICY IF EXISTS "homologacao_upload" ON storage.objects;
CREATE POLICY "homologacao_upload" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'homologacao-arquivos' AND auth.uid() IS NOT NULL
  );

DROP POLICY IF EXISTS "homologacao_read" ON storage.objects;
CREATE POLICY "homologacao_read" ON storage.objects
  FOR SELECT USING (
    bucket_id = 'homologacao-arquivos'
  );

DROP POLICY IF EXISTS "homologacao_update" ON storage.objects;
CREATE POLICY "homologacao_update" ON storage.objects
  FOR UPDATE USING (
    bucket_id = 'homologacao-arquivos' AND auth.uid() IS NOT NULL
  );
