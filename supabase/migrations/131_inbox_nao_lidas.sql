-- Kalebe 2026-09-30: inbox mostra na etiqueta de cada conversa quantas
-- mensagens do cliente ainda não foram lidas (como no WhatsApp).
-- Leitura é por pessoa: abrir a conversa zera pra quem abriu.

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

-- Conferência (como service role não há usuário: só confirma que a função existe)
SELECT proname FROM pg_proc WHERE proname = 'wa_nao_lidas';
