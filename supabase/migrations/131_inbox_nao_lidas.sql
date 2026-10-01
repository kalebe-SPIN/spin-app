-- Kalebe 2026-09-30: inbox mostra na etiqueta de cada conversa quantas
-- mensagens do cliente ainda não foram lidas (como no WhatsApp).
-- Leitura é por pessoa: abrir a conversa zera pra quem abriu.
-- Kalebe 2026-10-01 (mesma migration): foto de perfil do contato/cliente.
-- A API oficial do WhatsApp NÃO entrega a foto do cliente — ela é enviada à
-- mão (clique no avatar no inbox, no projeto ou na ficha do cliente). Sem
-- foto, o portal mostra as iniciais numa cor fixa por contato.

CREATE TABLE IF NOT EXISTS public.wa_leituras (
  conversa_id  uuid NOT NULL REFERENCES public.wa_conversas(id) ON DELETE CASCADE,
  usuario_id   uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  lido_ate     timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (conversa_id, usuario_id)
);

ALTER TABLE public.wa_leituras ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "wa_leituras_proprio" ON public.wa_leituras;
CREATE POLICY "wa_leituras_proprio" ON public.wa_leituras FOR ALL
  USING (usuario_id = auth.uid()) WITH CHECK (usuario_id = auth.uid());

CREATE INDEX IF NOT EXISTS idx_wa_mensagens_inbound_conversa
  ON public.wa_mensagens(conversa_id, criada_em) WHERE direcao = 'inbound';

-- Não lidas por conversa pro usuário logado. SECURITY INVOKER: o RLS de
-- wa_mensagens vale (consultor só conta as conversas que ele enxerga).
-- Conversa nunca aberta conta a partir de hoje (não acende o histórico antigo).
CREATE OR REPLACE FUNCTION public.wa_nao_lidas()
RETURNS TABLE (conversa_id uuid, qtd bigint)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public AS $$
  SELECT m.conversa_id, count(*)::bigint
  FROM public.wa_mensagens m
  LEFT JOIN public.wa_leituras l ON l.conversa_id = m.conversa_id AND l.usuario_id = auth.uid()
  WHERE m.direcao = 'inbound'
    AND m.criada_em > COALESCE(l.lido_ate, '2026-09-30 00:00:00-03'::timestamptz)
  GROUP BY m.conversa_id
$$;
GRANT EXECUTE ON FUNCTION public.wa_nao_lidas() TO authenticated;

-- Foto de perfil: no contato do WhatsApp e no cadastro do cliente (quando o
-- contato está vinculado a um cliente, a foto vale pros dois)
ALTER TABLE public.wa_contatos ADD COLUMN IF NOT EXISTS foto_url text;
ALTER TABLE public.clientes    ADD COLUMN IF NOT EXISTS foto_url text;

-- Bucket público (avatar carrega direto na tela). Upload só pelo servidor
-- (service role) depois de conferir que o usuário enxerga o contato/cliente.
-- Fotos já chegam cortadas e reduzidas (256×256, JPEG) — teto de 2 MB.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('fotos-perfil', 'fotos-perfil', true, 2097152, ARRAY['image/jpeg', 'image/png', 'image/webp'])
ON CONFLICT (id) DO NOTHING;

-- Conferência: função de não lidas + 2 colunas de foto + bucket
SELECT 'funcao' AS item, proname AS nome FROM pg_proc WHERE proname = 'wa_nao_lidas'
UNION ALL
SELECT 'coluna', table_name || '.' || column_name FROM information_schema.columns
WHERE table_schema = 'public' AND column_name = 'foto_url' AND table_name IN ('wa_contatos', 'clientes')
UNION ALL
SELECT 'bucket', id FROM storage.buckets WHERE id = 'fotos-perfil';
