-- ============================================================================
-- Migration 139 — Sino da Bianca só com atendimentos
-- ============================================================================
-- Kalebe 2026-10-06: o sino estava poluído. Fica reservado às conversas com
-- cliente que ESPERAM RESPOSTA (última mensagem é do cliente) ou que estão
-- EM STANDBY (a última foi nossa e o cliente sumiu há mais de 48h). Os demais
-- recados a Bianca mostra quando o usuário abre o card do cliente.
--
-- wa_atendimentos_pendentes(): calculado na hora, pro usuário logado
-- (responsável; admin vê também as sem responsável). Conversa com IA no
-- comando (nova / em qualificação / IA atendendo) não é pendência humana.
-- wa_pendencias_dispensadas: "dispensar" tira do sino até chegar mensagem nova.
-- Idempotente.
-- ============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.wa_pendencias_dispensadas (
  conversa_id    uuid NOT NULL REFERENCES public.wa_conversas(id) ON DELETE CASCADE,
  usuario_id     uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  dispensada_em  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (conversa_id, usuario_id)
);
ALTER TABLE public.wa_pendencias_dispensadas ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "wa_pend_disp_proprio" ON public.wa_pendencias_dispensadas;
CREATE POLICY "wa_pend_disp_proprio" ON public.wa_pendencias_dispensadas FOR ALL
  USING (usuario_id = auth.uid()) WITH CHECK (usuario_id = auth.uid());

-- Última mensagem de cada conversa sem varrer a tabela
CREATE INDEX IF NOT EXISTS idx_wa_mensagens_conversa_data
  ON public.wa_mensagens(conversa_id, criada_em DESC);

CREATE OR REPLACE FUNCTION public.wa_atendimentos_pendentes(p_standby_horas int DEFAULT 48)
RETURNS TABLE (
  conversa_id uuid, situacao text, desde timestamptz, responsavel_id uuid,
  contato_nome text, telefone text, projeto_id uuid, cliente_id uuid, previa text
)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public AS $$
  WITH minhas AS (
    SELECT c.id, c.responsavel_id, c.contato_id
    FROM public.wa_conversas c
    WHERE c.encerrada_em IS NULL
      AND c.status NOT IN ('nova', 'em_qualificacao', 'em_atendimento_ia')
      AND (c.responsavel_id = auth.uid() OR (c.responsavel_id IS NULL AND public.is_admin()))
  ),
  ult AS (
    SELECT DISTINCT ON (m.conversa_id) m.conversa_id, m.direcao, m.criada_em, m.texto, m.tipo
    FROM public.wa_mensagens m
    JOIN minhas ON minhas.id = m.conversa_id
    WHERE m.tipo <> 'system'
    ORDER BY m.conversa_id, m.criada_em DESC
  )
  SELECT
    u.conversa_id,
    CASE WHEN u.direcao = 'inbound'
         THEN CASE WHEN mi.responsavel_id IS NULL THEN 'sem_responsavel' ELSE 'esperando' END
         ELSE 'standby' END,
    u.criada_em,
    mi.responsavel_id,
    ct.nome_exibicao,
    ct.telefone,
    ct.projeto_id,
    ct.cliente_id,
    left(COALESCE(NULLIF(u.texto, ''), '[' || u.tipo || ']'), 140)
  FROM ult u
  JOIN minhas mi ON mi.id = u.conversa_id
  JOIN public.wa_contatos ct ON ct.id = mi.contato_id
  LEFT JOIN public.wa_pendencias_dispensadas d
    ON d.conversa_id = u.conversa_id AND d.usuario_id = auth.uid()
  WHERE (u.direcao = 'inbound' OR u.criada_em < now() - make_interval(hours => p_standby_horas))
    AND (d.dispensada_em IS NULL OR d.dispensada_em < u.criada_em)
  ORDER BY (u.direcao = 'inbound') DESC, u.criada_em ASC
$$;
GRANT EXECUTE ON FUNCTION public.wa_atendimentos_pendentes(int) TO authenticated;

COMMIT;

-- Conferência: o que o seu sino mostraria agora (rodando como service role
-- auth.uid() é nulo → só confere que a função existe)
SELECT proname FROM pg_proc WHERE proname = 'wa_atendimentos_pendentes';
