-- =================================================================
-- Migration 016 — Catálogo Admin (uploads centralizados)
-- - Bucket 'datasheets' (público, PDF) - datasheets de produtos individuais
-- - Bucket 'catalogo-uploads' (privado, XLSX/PDF) - planilhas e estoque
-- - Tabela catalogo_uploads_historico - trilha de auditoria
-- - Colunas em produtos: url_datasheet já existia. Confirmar
-- =================================================================

-- ===== 1. BUCKET DATASHEETS =====
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'datasheets',
  'datasheets',
  true,
  10485760,  -- 10 MB
  ARRAY['application/pdf']
)
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS "datasheets_read_all" ON storage.objects;
CREATE POLICY "datasheets_read_all" ON storage.objects
  FOR SELECT USING (bucket_id = 'datasheets');

DROP POLICY IF EXISTS "datasheets_admin_write" ON storage.objects;
CREATE POLICY "datasheets_admin_write" ON storage.objects
  FOR INSERT WITH CHECK (bucket_id = 'datasheets' AND public.is_admin());

DROP POLICY IF EXISTS "datasheets_admin_delete" ON storage.objects;
CREATE POLICY "datasheets_admin_delete" ON storage.objects
  FOR DELETE USING (bucket_id = 'datasheets' AND public.is_admin());

-- ===== 2. BUCKET CATALOGO-UPLOADS (privado, planilhas e PDFs de estoque) =====
-- Diferente do weg-catalogo (que já existe): esse é focado em processamento
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'catalogo-uploads',
  'catalogo-uploads',
  false,  -- privado
  52428800,  -- 50 MB
  ARRAY[
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/pdf',
    'text/csv'
  ]
)
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS "catalogo_uploads_admin_all" ON storage.objects;
CREATE POLICY "catalogo_uploads_admin_all" ON storage.objects
  FOR ALL USING (bucket_id = 'catalogo-uploads' AND public.is_admin());

-- ===== 3. HISTÓRICO DE UPLOADS =====
CREATE TABLE IF NOT EXISTS public.catalogo_uploads_historico (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  tipo                  text NOT NULL,     -- 'planilha_precos' | 'pdf_estoque' | 'datasheet'
  arquivo_nome_original text NOT NULL,
  arquivo_url           text,              -- Path no bucket
  arquivo_tamanho_kb    int,

  -- Se for datasheet, vincula ao produto
  produto_id            uuid REFERENCES public.produtos(id) ON DELETE CASCADE,

  -- Resultado do processamento
  status                text NOT NULL DEFAULT 'pendente',  -- pendente | processando | concluido | erro
  produtos_atualizados  int DEFAULT 0,
  produtos_criados      int DEFAULT 0,
  produtos_removidos    int DEFAULT 0,
  erro_mensagem         text,
  detalhes              jsonb,

  enviado_por           uuid REFERENCES public.profiles(id),
  processado_em         timestamptz,
  created_at            timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_catalogo_uploads_tipo_data
  ON public.catalogo_uploads_historico(tipo, created_at DESC);

ALTER TABLE public.catalogo_uploads_historico ENABLE ROW LEVEL SECURITY;

CREATE POLICY "catalogo_uploads_hist_admin_all" ON public.catalogo_uploads_historico
  FOR ALL USING (public.is_admin());

-- ===== 4. CONFIRMAR COLUNA url_datasheet em produtos =====
-- (já existe do migration 002, garantia extra)
ALTER TABLE public.produtos
ADD COLUMN IF NOT EXISTS url_datasheet text;

COMMENT ON COLUMN public.produtos.url_datasheet IS
'URL pública do datasheet PDF do produto (bucket datasheets). Usado nos cards do Kit no lugar de preço.';
