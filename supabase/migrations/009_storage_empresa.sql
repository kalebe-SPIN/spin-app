-- =================================================================
-- Migration 009 — Storage bucket empresa-assets
-- Guarda: logo, assinatura RT, ART digitalizada, etc.
-- Bucket público (leitura livre — precisa ser público pra estampar em PDFs)
-- Upload restrito a admin
-- =================================================================

-- 1. Cria bucket
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'empresa-assets',
  'empresa-assets',
  true,
  5242880,  -- 5 MB
  ARRAY['image/png', 'image/jpeg', 'image/jpg', 'image/webp', 'image/svg+xml', 'application/pdf']
)
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- 2. Policies em storage.objects
--    - Leitura: qualquer um (bucket público)
--    - Upload/Update/Delete: apenas admin

DROP POLICY IF EXISTS "empresa_assets_read_all" ON storage.objects;
CREATE POLICY "empresa_assets_read_all" ON storage.objects
  FOR SELECT USING (bucket_id = 'empresa-assets');

DROP POLICY IF EXISTS "empresa_assets_upload_admin" ON storage.objects;
CREATE POLICY "empresa_assets_upload_admin" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'empresa-assets'
    AND public.is_admin()
  );

DROP POLICY IF EXISTS "empresa_assets_update_admin" ON storage.objects;
CREATE POLICY "empresa_assets_update_admin" ON storage.objects
  FOR UPDATE USING (
    bucket_id = 'empresa-assets'
    AND public.is_admin()
  );

DROP POLICY IF EXISTS "empresa_assets_delete_admin" ON storage.objects;
CREATE POLICY "empresa_assets_delete_admin" ON storage.objects
  FOR DELETE USING (
    bucket_id = 'empresa-assets'
    AND public.is_admin()
  );
