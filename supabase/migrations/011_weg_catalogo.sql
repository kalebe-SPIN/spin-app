-- =================================================================
-- Migration 011 — Storage bucket weg-catalogo + tabela weg_imports
-- Guarda: planilhas Excel/CSV + PDFs de estoque WEG
-- Rastro histórico de todas as importações
-- =================================================================

-- 1. Bucket pros arquivos WEG
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'weg-catalogo',
  'weg-catalogo',
  false,  -- PRIVADO — só admin acessa (contém preços de custo confidenciais)
  52428800,  -- 50 MB (planilhas grandes)
  ARRAY[
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'text/csv',
    'text/plain',
    'application/pdf'
  ]
)
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- Policies: só admin pode ler/escrever
DROP POLICY IF EXISTS "weg_catalogo_admin_read" ON storage.objects;
CREATE POLICY "weg_catalogo_admin_read" ON storage.objects
  FOR SELECT USING (
    bucket_id = 'weg-catalogo' AND public.is_admin()
  );

DROP POLICY IF EXISTS "weg_catalogo_admin_all" ON storage.objects;
CREATE POLICY "weg_catalogo_admin_all" ON storage.objects
  FOR ALL USING (
    bucket_id = 'weg-catalogo' AND public.is_admin()
  );

-- 2. Tabela de imports (rastro histórico)
CREATE TABLE IF NOT EXISTS public.weg_imports (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  tipo                  text NOT NULL,     -- 'planilha_completa' | 'estoque_atualizacao'
  arquivo_url           text NOT NULL,     -- URL no bucket
  arquivo_nome_original text,

  -- Resultado do processamento
  status                text NOT NULL DEFAULT 'pendente',  -- pendente | processando | concluido | erro
  produtos_importados   int DEFAULT 0,
  produtos_atualizados  int DEFAULT 0,
  linhas_com_erro       int DEFAULT 0,
  erro_mensagem         text,
  detalhes              jsonb,             -- linhas processadas, erros específicos

  -- Auditoria
  enviado_por           uuid REFERENCES public.profiles(id),
  created_at            timestamptz NOT NULL DEFAULT now(),
  processado_em         timestamptz
);

CREATE INDEX IF NOT EXISTS idx_weg_imports_created ON public.weg_imports(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_weg_imports_tipo ON public.weg_imports(tipo, created_at DESC);

ALTER TABLE public.weg_imports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "weg_imports_admin_all" ON public.weg_imports
  FOR ALL USING (public.is_admin());
