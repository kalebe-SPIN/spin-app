-- ============================================================================
-- Migration 064 — RLS cruzado da agenda + chat par-a-par (vendedor↔campo)
-- ============================================================================
-- Depende de 063 (helper eh_par_agenda + role profissional_campo).
--
-- 1. Adiciona `status` e `criado_por_usuario_id` em agenda_eventos e tarefas.
-- 2. Reescreve as policies RLS de agenda_eventos e agenda_tarefas usando
--    eh_par_agenda — dono, admin, ou par vendedor↔campo da mesma zona.
-- 3. Cria chat_par_threads + chat_par_mensagens com RLS restrito aos 2
--    participantes.
--
-- Aplicar via Supabase Dashboard > SQL Editor.
-- ============================================================================

BEGIN;

-- ─── 1. Novas colunas de rastreio nas agendas ───────────────────────────────
-- `criado_por_usuario_id`: quem CRIOU o registro (pode ser diferente do dono
--                          quando um par cria na agenda do outro).
-- (status de agenda_eventos e agenda_tarefas já existe — mig 037.)

ALTER TABLE public.agenda_eventos
  ADD COLUMN IF NOT EXISTS criado_por_usuario_id uuid REFERENCES public.profiles(id);

ALTER TABLE public.agenda_tarefas
  ADD COLUMN IF NOT EXISTS criado_por_usuario_id uuid REFERENCES public.profiles(id);

COMMENT ON COLUMN public.agenda_eventos.criado_por_usuario_id IS
  'Quem CRIOU o evento. Pode diferir de usuario_id (dono) quando um par cria '
  'na agenda do outro. Usado pelos gatilhos Bianca (mig 065) pra notificar o '
  'dono quando alguém agenda por ele.';

COMMENT ON COLUMN public.agenda_tarefas.criado_por_usuario_id IS
  'Mesma semântica de agenda_eventos.criado_por_usuario_id — quem originou o '
  'registro, distinto do dono.';

-- ─── 2. RLS agenda_eventos: reescreve usando eh_par_agenda ──────────────────
DROP POLICY IF EXISTS "agenda_ev_dono"       ON public.agenda_eventos;
DROP POLICY IF EXISTS "agenda_ev_admin_read" ON public.agenda_eventos;

CREATE POLICY "agenda_ev_par_select" ON public.agenda_eventos
  FOR SELECT USING (public.eh_par_agenda(usuario_id));

CREATE POLICY "agenda_ev_par_insert" ON public.agenda_eventos
  FOR INSERT WITH CHECK (public.eh_par_agenda(usuario_id));

CREATE POLICY "agenda_ev_par_update" ON public.agenda_eventos
  FOR UPDATE USING (public.eh_par_agenda(usuario_id))
             WITH CHECK (public.eh_par_agenda(usuario_id));

CREATE POLICY "agenda_ev_par_delete" ON public.agenda_eventos
  FOR DELETE USING (public.eh_par_agenda(usuario_id));

-- ─── 3. RLS agenda_tarefas: mesma regra ─────────────────────────────────────
DROP POLICY IF EXISTS "agenda_tar_dono"       ON public.agenda_tarefas;
DROP POLICY IF EXISTS "agenda_tar_admin_read" ON public.agenda_tarefas;

CREATE POLICY "agenda_tar_par_select" ON public.agenda_tarefas
  FOR SELECT USING (public.eh_par_agenda(usuario_id));

CREATE POLICY "agenda_tar_par_insert" ON public.agenda_tarefas
  FOR INSERT WITH CHECK (public.eh_par_agenda(usuario_id));

CREATE POLICY "agenda_tar_par_update" ON public.agenda_tarefas
  FOR UPDATE USING (public.eh_par_agenda(usuario_id))
             WITH CHECK (public.eh_par_agenda(usuario_id));

CREATE POLICY "agenda_tar_par_delete" ON public.agenda_tarefas
  FOR DELETE USING (public.eh_par_agenda(usuario_id));

-- ─── 4. Chat par-a-par: threads ─────────────────────────────────────────────
-- Uma thread é uma conversa aberta entre dois participantes (par vendedor↔
-- campo). Sempre há no máximo UMA thread ativa por par. Botão "Nova conversa"
-- fecha a atual (encerrada_em = now()) e cria uma nova — o histórico
-- permanece no banco pra auditoria, mas a UI mostra só a ativa.

CREATE TABLE IF NOT EXISTS public.chat_par_threads (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  participante_a  uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  participante_b  uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  aberta_em       timestamptz NOT NULL DEFAULT now(),
  encerrada_em    timestamptz,
  criada_por      uuid NOT NULL REFERENCES public.profiles(id),

  -- Convenção: participante_a sempre < participante_b (ordem lexicográfica
  -- do uuid) — garante que só existe UMA linha por par independente de quem
  -- iniciou a conversa.
  CONSTRAINT chat_par_ordem CHECK (participante_a < participante_b)
);

-- Só UMA thread ativa por par:
CREATE UNIQUE INDEX IF NOT EXISTS uq_chat_par_ativa
  ON public.chat_par_threads(participante_a, participante_b)
  WHERE encerrada_em IS NULL;

CREATE INDEX IF NOT EXISTS idx_chat_par_participante_a
  ON public.chat_par_threads(participante_a) WHERE encerrada_em IS NULL;
CREATE INDEX IF NOT EXISTS idx_chat_par_participante_b
  ON public.chat_par_threads(participante_b) WHERE encerrada_em IS NULL;

COMMENT ON TABLE public.chat_par_threads IS
  'Threads do chat par-a-par (vendedor↔profissional_campo). Uma thread ativa '
  'por par; encerrar cria espaço pra uma nova ("Nova conversa"). Histórico '
  'preservado no banco, oculto na UI. Introduzida em 064.';

-- ─── 5. Chat par-a-par: mensagens ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.chat_par_mensagens (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id    uuid NOT NULL REFERENCES public.chat_par_threads(id) ON DELETE CASCADE,
  autor_id     uuid NOT NULL REFERENCES public.profiles(id),
  conteudo     text NOT NULL CHECK (length(trim(conteudo)) > 0),
  lida_em      timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_chat_par_msg_thread
  ON public.chat_par_mensagens(thread_id, created_at);

COMMENT ON TABLE public.chat_par_mensagens IS
  'Mensagens do chat par-a-par. RLS: só os 2 participantes da thread vêem.';

-- ─── 6. RLS do chat par ─────────────────────────────────────────────────────
ALTER TABLE public.chat_par_threads   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_par_mensagens ENABLE ROW LEVEL SECURITY;

-- Threads: só os 2 participantes (+ admin) veem/mexem.
CREATE POLICY "chat_par_thread_participante_all" ON public.chat_par_threads
  FOR ALL USING (
    auth.uid() = participante_a
    OR auth.uid() = participante_b
    OR public.is_admin()
  );

-- Mensagens: só participantes da thread lêem/escrevem.
CREATE POLICY "chat_par_msg_participante_select" ON public.chat_par_mensagens
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.chat_par_threads t
      WHERE t.id = thread_id
        AND (auth.uid() = t.participante_a OR auth.uid() = t.participante_b OR public.is_admin())
    )
  );

CREATE POLICY "chat_par_msg_participante_insert" ON public.chat_par_mensagens
  FOR INSERT WITH CHECK (
    autor_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.chat_par_threads t
      WHERE t.id = thread_id
        AND t.encerrada_em IS NULL
        AND (auth.uid() = t.participante_a OR auth.uid() = t.participante_b)
    )
  );

-- Só admin apaga mensagens (usuário comum não apaga — mantém rastro).
CREATE POLICY "chat_par_msg_admin_delete" ON public.chat_par_mensagens
  FOR DELETE USING (public.is_admin());

COMMIT;
