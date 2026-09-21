-- ============================================================================
-- Migration 117 — Bucket wa_midia pra arquivos recebidos/enviados pelo canal
-- ============================================================================
-- Kalebe 2026-09-21: cliente envia PDF/imagem/áudio no WhatsApp e não aparece
-- no histórico do inbox. Motivo: webhook grava só o midia_meta_id (temporário
-- da Meta, expira em 5 min) sem baixar o arquivo. Este bucket recebe o binário
-- e o webhook grava a URL pública em wa_mensagens.midia_url pra o inbox
-- renderizar preview.
--
-- Idempotente.
-- ============================================================================

BEGIN;

-- Cria bucket (10 MB max, permite tipos comuns de mídia WhatsApp)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'wa_midia',
  'wa_midia',
  true,     -- público pra leitura (o inbox mostra preview)
  10485760, -- 10 MB
  ARRAY[
    'application/pdf',
    'image/jpeg', 'image/png', 'image/webp', 'image/gif',
    'audio/ogg', 'audio/mpeg', 'audio/mp4', 'audio/aac', 'audio/webm',
    'video/mp4', 'video/webm', 'video/3gpp',
    'text/plain'
  ]
)
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- Leitura pública (bucket é public=true mas policy garante)
DROP POLICY IF EXISTS "wa_midia_public_read" ON storage.objects;
CREATE POLICY "wa_midia_public_read"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'wa_midia');

-- Escrita: apenas via service_role (webhook usa createAdminClient)
DROP POLICY IF EXISTS "wa_midia_service_write" ON storage.objects;
CREATE POLICY "wa_midia_service_write"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'wa_midia' AND auth.role() = 'service_role');

DROP POLICY IF EXISTS "wa_midia_service_update" ON storage.objects;
CREATE POLICY "wa_midia_service_update"
  ON storage.objects FOR UPDATE
  USING (bucket_id = 'wa_midia' AND auth.role() = 'service_role');

DROP POLICY IF EXISTS "wa_midia_service_delete" ON storage.objects;
CREATE POLICY "wa_midia_service_delete"
  ON storage.objects FOR DELETE
  USING (bucket_id = 'wa_midia' AND auth.role() = 'service_role');

COMMIT;
