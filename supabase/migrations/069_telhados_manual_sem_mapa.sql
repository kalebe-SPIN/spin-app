-- ============================================================================
-- Migration 069 — Cadastro manual de telhados (sem mapa)
-- ============================================================================
-- Enquanto o Google Maps não está configurado no Vercel (2FA travado), o
-- vendedor precisa cadastrar telhados manualmente: mede no Google Earth
-- externo, salva a imagem, e cadastra pelo formulário com foto anexada.
-- Neste modo não há coordenadas (lat/lng) — vira NULL na tabela.
--
-- Também: qtd_placas_estimada vira opcional (o vendedor pode não ter
-- contado ainda no primeiro cadastro).
--
-- Aplicar via Supabase Dashboard > SQL Editor.
-- ============================================================================

BEGIN;

ALTER TABLE public.telhados
  ALTER COLUMN latitude  DROP NOT NULL,
  ALTER COLUMN longitude DROP NOT NULL;

COMMENT ON COLUMN public.telhados.latitude IS
  'Latitude do pin no mapa. NULL quando o cadastro foi manual (sem Google Maps).';
COMMENT ON COLUMN public.telhados.longitude IS
  'Longitude do pin no mapa. NULL quando o cadastro foi manual (sem Google Maps).';

COMMIT;
