-- Kalebe 2026-09-17: bucket pra arquivos de fatura (PDF/imagem) que hoje
-- só passam pelo OCR e somem. Agora ficam guardados e acessíveis do card
-- do projeto com pré-visualização.
--
-- Estrutura: faturas/{projeto_id}/principal_{timestamp}.pdf
--           faturas/{projeto_id}/ben_{idx}_{timestamp}.pdf
--
-- A URL fica em analise_fatura.arquivo_url (jsonb já existente) e em
-- beneficiarias[i].arquivo_url. Nenhuma coluna nova.

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'faturas',
  'faturas',
  true,  -- público: URLs diretas funcionam sem token. RLS controla escrita.
  10485760,  -- 10 MB
  ARRAY['application/pdf', 'image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- Policies: usuário autenticado escreve/lê. Admin/consultor sem restrição.
DROP POLICY IF EXISTS faturas_auth_read ON storage.objects;
CREATE POLICY faturas_auth_read ON storage.objects
  FOR SELECT
  USING (bucket_id = 'faturas' AND auth.role() = 'authenticated');

DROP POLICY IF EXISTS faturas_auth_insert ON storage.objects;
CREATE POLICY faturas_auth_insert ON storage.objects
  FOR INSERT
  WITH CHECK (bucket_id = 'faturas' AND auth.role() = 'authenticated');

DROP POLICY IF EXISTS faturas_auth_update ON storage.objects;
CREATE POLICY faturas_auth_update ON storage.objects
  FOR UPDATE
  USING (bucket_id = 'faturas' AND auth.role() = 'authenticated');

DROP POLICY IF EXISTS faturas_auth_delete ON storage.objects;
CREATE POLICY faturas_auth_delete ON storage.objects
  FOR DELETE
  USING (bucket_id = 'faturas' AND auth.role() = 'authenticated');
