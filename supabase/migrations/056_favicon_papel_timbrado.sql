-- Migration 056: favicon + papel timbrado da empresa
-- Kalebe: adicionar campos de favicon e logo pra usar no site,
-- PDFs e papel timbrado dos contratos e procuracoes.

ALTER TABLE public.configuracoes_empresa
  ADD COLUMN IF NOT EXISTS favicon_url text,
  ADD COLUMN IF NOT EXISTS papel_timbrado_url text;

COMMENT ON COLUMN public.configuracoes_empresa.favicon_url IS
'Icone quadrado (256x256 PNG) usado como favicon do portal. Aparece na aba do browser.';

COMMENT ON COLUMN public.configuracoes_empresa.papel_timbrado_url IS
'Imagem PNG usada como fundo (papel timbrado) em contratos, procuracoes e docs oficiais. Dimensao A4 recomendada.';

-- Bucket pra assets da empresa (logo, favicon, papel timbrado, assinatura RT)
INSERT INTO storage.buckets (id, name, public)
VALUES ('assets-empresa', 'assets-empresa', true)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "assets_empresa_admin_all" ON storage.objects;
CREATE POLICY "assets_empresa_admin_all" ON storage.objects
  FOR ALL USING (bucket_id = 'assets-empresa' AND public.is_admin());

DROP POLICY IF EXISTS "assets_empresa_public_read" ON storage.objects;
CREATE POLICY "assets_empresa_public_read" ON storage.objects
  FOR SELECT USING (bucket_id = 'assets-empresa');

-- Bucket pra fotos de perfil dos usuarios (avatar)
INSERT INTO storage.buckets (id, name, public)
VALUES ('perfis-usuarios', 'perfis-usuarios', true)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "perfis_owner_all" ON storage.objects;
CREATE POLICY "perfis_owner_all" ON storage.objects
  FOR ALL USING (
    bucket_id = 'perfis-usuarios'
    AND auth.uid() IS NOT NULL
  );

DROP POLICY IF EXISTS "perfis_public_read" ON storage.objects;
CREATE POLICY "perfis_public_read" ON storage.objects
  FOR SELECT USING (bucket_id = 'perfis-usuarios');
