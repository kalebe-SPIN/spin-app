-- =================================================================
-- 159 — Disparo em massa pelo Spinzap (Kalebe 2026-10-22)
-- "Depois de filtrar clientes/leads, os selecionados recebem uma mensagem,
--  criativo ou gravação de voz do próprio usuário — programado ou na hora —
--  enviado pela Laís ou pela Bianca (o usuário escolhe)."
-- Decisões: janela de 24h fechada → modelo de retomada antes (o conteúdo sai
-- quando o cliente responder); qualquer usuário dispara pras conversas que
-- enxerga; até 100 contatos por disparo.
--
--  - wa_disparos: o disparo (quem, agente, conteúdo, quando, filtros)
--  - wa_followups ganha disparo_id, mídia e agente: cada contato vira um
--    envio na fila que a Bianca já executa (cron de 5 em 5 min)
--  - bucket público wa-disparos: criativos e áudios (a Meta busca pelo link)
-- Tudo numa transação.
-- =================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.wa_disparos (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  criado_por   uuid REFERENCES public.profiles(id),
  agente       text NOT NULL CHECK (agente IN ('lais', 'bianca')),
  tipo         text NOT NULL CHECK (tipo IN ('texto', 'midia', 'audio')),
  texto        text,
  midia_url    text,
  midia_mime   text,
  midia_nome   text,
  executar_em  timestamptz NOT NULL,
  total        int NOT NULL DEFAULT 0,
  filtros      jsonb NOT NULL DEFAULT '{}'::jsonb,
  status       text NOT NULL DEFAULT 'agendado' CHECK (status IN ('agendado', 'cancelado')),
  criado_em    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_wa_disparos_criado ON public.wa_disparos (criado_em DESC);

ALTER TABLE public.wa_followups ADD COLUMN IF NOT EXISTS disparo_id uuid REFERENCES public.wa_disparos(id) ON DELETE SET NULL;
ALTER TABLE public.wa_followups ADD COLUMN IF NOT EXISTS midia_url text;
ALTER TABLE public.wa_followups ADD COLUMN IF NOT EXISTS midia_mime text;
ALTER TABLE public.wa_followups ADD COLUMN IF NOT EXISTS midia_nome text;
ALTER TABLE public.wa_followups ADD COLUMN IF NOT EXISTS agente text;
CREATE INDEX IF NOT EXISTS idx_wa_followups_disparo ON public.wa_followups (disparo_id) WHERE disparo_id IS NOT NULL;

-- Quem criou (e o admin) vê os disparos; a gravação é pelo servidor
ALTER TABLE public.wa_disparos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS wa_disparos_leitura ON public.wa_disparos;
CREATE POLICY wa_disparos_leitura ON public.wa_disparos FOR SELECT USING (criado_por = auth.uid() OR public.is_admin());

-- Criativos e áudios do disparo: leitura pública (a Meta baixa pelo link),
-- upload por quem está logado (até 16 MB — limite de vídeo/áudio do WhatsApp)
INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES ('wa-disparos', 'wa-disparos', true, 16777216)
ON CONFLICT (id) DO NOTHING;
DROP POLICY IF EXISTS wa_disparos_upload ON storage.objects;
CREATE POLICY wa_disparos_upload ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'wa-disparos');
DROP POLICY IF EXISTS wa_disparos_leitura_publica ON storage.objects;
CREATE POLICY wa_disparos_leitura_publica ON storage.objects FOR SELECT USING (bucket_id = 'wa-disparos');

COMMIT;
