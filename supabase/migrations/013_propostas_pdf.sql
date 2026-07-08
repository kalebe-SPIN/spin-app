-- =================================================================
-- Migration 013 — Propostas PDF
-- Adiciona url_pdf_proposta em projetos + bucket propostas-pdf
-- =================================================================

ALTER TABLE public.projetos
ADD COLUMN IF NOT EXISTS url_pdf_proposta text;

COMMENT ON COLUMN public.projetos.url_pdf_proposta IS
'URL pública do PDF da proposta gerada. Usada no botão "Baixar PDF" e no link do WhatsApp.';

-- Bucket público pra PDFs de proposta
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'propostas-pdf',
  'propostas-pdf',
  true,
  10485760,  -- 10 MB
  ARRAY['application/pdf']
)
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS "propostas_read_all" ON storage.objects;
CREATE POLICY "propostas_read_all" ON storage.objects
  FOR SELECT USING (bucket_id = 'propostas-pdf');

DROP POLICY IF EXISTS "propostas_auth_upload" ON storage.objects;
CREATE POLICY "propostas_auth_upload" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'propostas-pdf' AND auth.uid() IS NOT NULL
  );

DROP POLICY IF EXISTS "propostas_admin_delete" ON storage.objects;
CREATE POLICY "propostas_admin_delete" ON storage.objects
  FOR DELETE USING (
    bucket_id = 'propostas-pdf' AND public.is_admin()
  );
