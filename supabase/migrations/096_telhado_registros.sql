-- Migration 096: Registros do telhado no cliente (Kalebe 2026-09-01)
-- Bucket público pra fotos aéreas/rua + polígonos + resultados Solar.
-- Coluna jsonb no cliente: array de {tipo, url, area_m2?, poligono?, solar?, criado_em}

-- 1) Bucket público (permite consultores enviarem prints via WhatsApp pro campo)
INSERT INTO storage.buckets (id, name, public)
VALUES ('telhado-registros', 'telhado-registros', true)
ON CONFLICT (id) DO NOTHING;

-- Políticas: authenticated podem tudo, anon lê (pra WhatsApp funcionar)
DROP POLICY IF EXISTS "telhado_registros_insert_auth" ON storage.objects;
CREATE POLICY "telhado_registros_insert_auth"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'telhado-registros');

DROP POLICY IF EXISTS "telhado_registros_select_all" ON storage.objects;
CREATE POLICY "telhado_registros_select_all"
  ON storage.objects FOR SELECT TO public
  USING (bucket_id = 'telhado-registros');

DROP POLICY IF EXISTS "telhado_registros_delete_auth" ON storage.objects;
CREATE POLICY "telhado_registros_delete_auth"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'telhado-registros');

-- 2) Coluna no cliente
ALTER TABLE public.clientes
  ADD COLUMN IF NOT EXISTS telhado_registros jsonb DEFAULT '[]'::jsonb;

COMMENT ON COLUMN public.clientes.telhado_registros IS
  'Array de registros do telhado: [{tipo, url, area_m2?, poligono?, solar?, lat, lng, criado_em}]';
