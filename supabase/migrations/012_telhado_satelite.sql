-- =================================================================
-- Migration 012 — Imagem satélite do telhado
-- Adiciona coluna url_satelite em projetos_telhado_secoes
-- Cria bucket telhado-satelite (público, PNG/JPG)
-- =================================================================

-- 1. Coluna nova pra guardar URL da imagem satélite capturada
ALTER TABLE public.projetos_telhado_secoes
ADD COLUMN IF NOT EXISTS url_satelite text;

COMMENT ON COLUMN public.projetos_telhado_secoes.url_satelite IS
'URL pública da imagem satélite capturada pelo consultor (com polígono desenhado). Usada no PDF de proposta e como comprovação técnica.';

-- 2. Bucket público pras imagens satélite dos telhados
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'telhado-satelite',
  'telhado-satelite',
  true,
  10485760,  -- 10 MB
  ARRAY['image/png', 'image/jpeg', 'image/webp']
)
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- Leitura pública (aparece no PDF público)
DROP POLICY IF EXISTS "telhado_satelite_read_all" ON storage.objects;
CREATE POLICY "telhado_satelite_read_all" ON storage.objects
  FOR SELECT USING (bucket_id = 'telhado-satelite');

-- Upload por qualquer autenticado (consultores precisam salvar)
DROP POLICY IF EXISTS "telhado_satelite_auth_upload" ON storage.objects;
CREATE POLICY "telhado_satelite_auth_upload" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'telhado-satelite' AND auth.uid() IS NOT NULL
  );

-- Delete só admin
DROP POLICY IF EXISTS "telhado_satelite_admin_delete" ON storage.objects;
CREATE POLICY "telhado_satelite_admin_delete" ON storage.objects
  FOR DELETE USING (
    bucket_id = 'telhado-satelite' AND public.is_admin()
  );
