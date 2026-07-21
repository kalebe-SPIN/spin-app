-- Migration 044: bucket pra imagens PNG dos produtos WEG
-- Kalebe pediu 3 melhorias no /admin/catalogo:
--   1. Anexar imagem PNG por produto (usa produtos.url_imagem que ja existe)
--   2. Toggle ativo/inativo (usa produtos.ativo que ja existe)
--   3. Botao pontos criticos eletricos (le produtos.specs jsonb que ja existe)
--
-- Aqui so falta o bucket + policies (colunas todas existem desde migration 002).

INSERT INTO storage.buckets (id, name, public)
VALUES ('produtos-imagens', 'produtos-imagens', true)
ON CONFLICT (id) DO NOTHING;

-- Politicas: admin le/escreve tudo; consultor le publico
DROP POLICY IF EXISTS "produtos_imagens_admin_all" ON storage.objects;
CREATE POLICY "produtos_imagens_admin_all" ON storage.objects
  FOR ALL USING (bucket_id = 'produtos-imagens' AND public.is_admin());

DROP POLICY IF EXISTS "produtos_imagens_public_read" ON storage.objects;
CREATE POLICY "produtos_imagens_public_read" ON storage.objects
  FOR SELECT USING (bucket_id = 'produtos-imagens');
