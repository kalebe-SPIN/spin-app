-- ============================================================================
-- Migration 037: Agenda com status + tabela de comunicações Bianca
-- ============================================================================
-- Kalebe: agenda precisa de:
--   1. Mudar status de tarefas E de eventos
--   2. Acompanhar registro/histórico de comunicações (Bianca ↔ pessoas)
--   3. Bianca deve enviar mensagens via WhatsApp
--
-- Mudanças:
--   - agenda_eventos ganha coluna status (agendado/confirmado/realizado/cancelado)
--   - bianca_comunicacoes: registro de cada mensagem que Bianca envia/sugere
-- ============================================================================

-- 1. STATUS em eventos (tarefas já tinham)
ALTER TABLE public.agenda_eventos
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'agendado';

ALTER TABLE public.agenda_eventos
  DROP CONSTRAINT IF EXISTS agenda_eventos_status_check;

ALTER TABLE public.agenda_eventos
  ADD CONSTRAINT agenda_eventos_status_check
  CHECK (status IN ('agendado', 'confirmado', 'em_andamento', 'realizado', 'cancelado', 'adiado'));

CREATE INDEX IF NOT EXISTS idx_agenda_eventos_status
  ON public.agenda_eventos(usuario_id, status);

COMMENT ON COLUMN public.agenda_eventos.status IS
  'agendado (padrão) | confirmado (cliente confirmou) | em_andamento | realizado | cancelado | adiado';


-- 2. COMUNICAÇÕES da Bianca — registro de mensagens sugeridas/enviadas
CREATE TABLE IF NOT EXISTS public.bianca_comunicacoes (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Origem
  usuario_id            uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  conversa_id           uuid,     -- vínculo com bianca_conversas se aplicável

  -- Contexto (opcional — pode ser sobre uma tarefa/evento/projeto)
  tarefa_id             uuid REFERENCES public.agenda_tarefas(id) ON DELETE SET NULL,
  evento_id             uuid REFERENCES public.agenda_eventos(id) ON DELETE SET NULL,
  projeto_id            uuid REFERENCES public.projetos(id) ON DELETE SET NULL,

  -- Destinatário
  destinatario_nome     text,
  destinatario_telefone text,     -- E.164 sem símbolos (ex: 5548999998888)
  destinatario_email    text,

  -- Canal + mensagem
  canal                 text NOT NULL CHECK (canal IN ('whatsapp', 'email', 'sms', 'ligacao_lembrete')),
  assunto               text,     -- pra emails
  mensagem              text NOT NULL,
  link_wa               text,     -- gerado (wa.me/...?text=...)

  -- Estado do envio
  status                text NOT NULL DEFAULT 'sugerida'
    CHECK (status IN ('sugerida', 'enviada_manualmente', 'enviada_bianca', 'lida', 'respondida', 'falhou')),
  enviada_em            timestamptz,

  -- Metadata
  criado_em             timestamptz NOT NULL DEFAULT now(),
  atualizado_em         timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_bianca_comunicacoes_usuario ON public.bianca_comunicacoes(usuario_id, criado_em DESC);
CREATE INDEX IF NOT EXISTS idx_bianca_comunicacoes_tarefa ON public.bianca_comunicacoes(tarefa_id) WHERE tarefa_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_bianca_comunicacoes_evento ON public.bianca_comunicacoes(evento_id) WHERE evento_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_bianca_comunicacoes_projeto ON public.bianca_comunicacoes(projeto_id) WHERE projeto_id IS NOT NULL;

-- RLS
ALTER TABLE public.bianca_comunicacoes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "bianca_comunicacoes_owner" ON public.bianca_comunicacoes;
CREATE POLICY "bianca_comunicacoes_owner" ON public.bianca_comunicacoes
  FOR ALL USING (usuario_id = auth.uid())
  WITH CHECK (usuario_id = auth.uid());


-- 3. HISTÓRICO de mudanças de status (auditoria)
CREATE TABLE IF NOT EXISTS public.agenda_historico (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  usuario_id            uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,

  tarefa_id             uuid REFERENCES public.agenda_tarefas(id) ON DELETE CASCADE,
  evento_id             uuid REFERENCES public.agenda_eventos(id) ON DELETE CASCADE,

  acao                  text NOT NULL,        -- 'criada' | 'status_alterado' | 'editada' | 'concluida' | 'cancelada' | 'comentario'
  status_anterior       text,
  status_novo           text,
  observacao            text,                 -- comentário livre
  origem                text NOT NULL DEFAULT 'usuario' CHECK (origem IN ('usuario', 'bianca', 'sistema')),

  criado_em             timestamptz NOT NULL DEFAULT now(),

  CHECK (tarefa_id IS NOT NULL OR evento_id IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS idx_agenda_hist_tarefa ON public.agenda_historico(tarefa_id, criado_em DESC) WHERE tarefa_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_agenda_hist_evento ON public.agenda_historico(evento_id, criado_em DESC) WHERE evento_id IS NOT NULL;

ALTER TABLE public.agenda_historico ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "agenda_historico_owner" ON public.agenda_historico;
CREATE POLICY "agenda_historico_owner" ON public.agenda_historico
  FOR ALL USING (usuario_id = auth.uid())
  WITH CHECK (usuario_id = auth.uid());
