-- =================================================================
-- Migration 010 — Storage bucket projetos-diagramas
-- Guarda os arquivos gerados: SVG, PDF, DXF, DWG
-- Bucket público (URLs vão pro dashboard e podem ser enviadas por email)
-- Upload feito server-side com service_role_key (bypass RLS)
-- =================================================================

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'projetos-diagramas',
  'projetos-diagramas',
  true,
  20971520,  -- 20 MB (SVG grande, PDF multi-página)
  ARRAY[
    'image/svg+xml',
    'application/pdf',
    'application/dxf',
    'application/octet-stream',
    'text/plain',
    'image/vnd.dwg'
  ]
)
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- Leitura pública (arquivos são acessados via URL pública)
DROP POLICY IF EXISTS "projetos_diagramas_read_all" ON storage.objects;
CREATE POLICY "projetos_diagramas_read_all" ON storage.objects
  FOR SELECT USING (bucket_id = 'projetos-diagramas');

-- Uploads apenas por service_role (server-side) — sem policy pública de INSERT
-- service_role bypassa RLS automaticamente
