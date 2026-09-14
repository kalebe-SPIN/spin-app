-- Migration 108: modelo de conversas WhatsApp (Sprint 1 do WhatsApp integrado)
--
-- Kalebe 2026-09-12: 'quero integrar o sistema no whatsapp da empresa
-- para receber leads que venham de campanhas ou mesmo que entrem em
-- contato direto no número da empresa'.
--
-- ARQUITETURA
--
-- wa_contatos    → 1 linha por telefone. Guarda vínculo com cliente/projeto,
--                  tipo (lead/cliente/representante/colaborador) e último visto.
-- wa_conversas   → thread ativa com um contato. Status controla fluxo
--                  (nova → em_qualificacao → aguardando_representante →
--                  em_atendimento → encerrada). Guarda responsavel_id,
--                  agente_ativo (IA no comando), janela_24h.
-- wa_mensagens   → cada mensagem (inbound e outbound, texto/áudio/imagem/etc).
--                  Dedup por meta_message_id. Guarda remetente humano OU IA,
--                  origem_agente_nome pra multi-persona no mesmo canal.
--
-- Coexiste com bianca_comunicacoes (não substitui) — Bianca continua
-- gravando lá; o novo modelo cobre TODA a conversa (não só outbound).

-- ============================================================================
-- wa_contatos
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.wa_contatos (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Chave: telefone em E.164 (com 55, só dígitos). Meta manda assim.
  telefone            text NOT NULL UNIQUE,
  nome_exibicao       text,   -- nome que o cliente configurou no wpp

  -- Vínculos opcionais (populados durante qualificação ou associação manual)
  cliente_id          uuid REFERENCES public.clientes(id) ON DELETE SET NULL,
  projeto_id          uuid REFERENCES public.projetos(id) ON DELETE SET NULL,

  -- Classificação
  tipo                text NOT NULL DEFAULT 'desconhecido' CHECK (tipo IN (
    'lead',           -- entrou pelo canal, ainda não vinculou a nada
    'cliente',        -- já é cliente cadastrado
    'representante',  -- integrante da equipe Spin (usa canal pra comunicação interna)
    'colaborador',    -- outro colaborador Spin
    'desconhecido'    -- ainda não classificado
  )),
  bloqueado           boolean NOT NULL DEFAULT false,
  observacao          text,

  criado_em           timestamptz NOT NULL DEFAULT now(),
  atualizado_em       timestamptz NOT NULL DEFAULT now(),
  ultima_atividade_em timestamptz
);

CREATE INDEX IF NOT EXISTS idx_wa_contatos_cliente ON public.wa_contatos(cliente_id);
CREATE INDEX IF NOT EXISTS idx_wa_contatos_projeto ON public.wa_contatos(projeto_id);
CREATE INDEX IF NOT EXISTS idx_wa_contatos_tipo    ON public.wa_contatos(tipo);

-- ============================================================================
-- wa_conversas
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.wa_conversas (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contato_id            uuid NOT NULL REFERENCES public.wa_contatos(id) ON DELETE CASCADE,

  status                text NOT NULL DEFAULT 'nova' CHECK (status IN (
    'nova',                       -- primeira mensagem, IA nem entrou ainda
    'em_qualificacao',            -- agente de qualificação IA no comando
    'aguardando_representante',   -- broadcast disparado, esperando quem aceita
    'em_atendimento',             -- representante assumiu, humano no volante
    'em_atendimento_ia',          -- outro agente IA (Bianca, follow-up) respondendo
    'encerrada'                   -- fechada (sem resposta ou finalizada)
  )),

  -- Quem está no comando agora
  responsavel_id        uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  agente_ativo          text,   -- 'bianca'|'qualificacao'|null

  -- Contexto do fluxo (pra a IA reler)
  contexto_qualificacao jsonb NOT NULL DEFAULT '{}',
  origem_campanha       text,   -- nome da campanha se veio de ads/promo

  -- Janelas
  ultima_mensagem_em    timestamptz,
  janela_24h_expira_em  timestamptz,  -- reset toda vez que cliente responde
  sla_prazo_em          timestamptz,  -- SLA de resposta (ex: 8min)

  criada_em             timestamptz NOT NULL DEFAULT now(),
  encerrada_em          timestamptz,
  encerrada_por         uuid REFERENCES public.profiles(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_wa_conversas_contato       ON public.wa_conversas(contato_id);
CREATE INDEX IF NOT EXISTS idx_wa_conversas_status        ON public.wa_conversas(status);
CREATE INDEX IF NOT EXISTS idx_wa_conversas_responsavel   ON public.wa_conversas(responsavel_id);
CREATE INDEX IF NOT EXISTS idx_wa_conversas_ultima_msg    ON public.wa_conversas(ultima_mensagem_em DESC);

-- Só UMA conversa ativa por contato — encerradas viram histórico.
CREATE UNIQUE INDEX IF NOT EXISTS uq_wa_conversas_ativa_por_contato
  ON public.wa_conversas(contato_id) WHERE encerrada_em IS NULL;

-- ============================================================================
-- wa_mensagens
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.wa_mensagens (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversa_id           uuid NOT NULL REFERENCES public.wa_conversas(id) ON DELETE CASCADE,

  direcao               text NOT NULL CHECK (direcao IN ('inbound', 'outbound')),
  tipo                  text NOT NULL DEFAULT 'text' CHECK (tipo IN (
    'text','audio','image','video','document','template','system','interactive'
  )),

  -- Identidade Meta (dedup e correlação com status update)
  meta_message_id       text UNIQUE,

  -- Conteúdo
  texto                 text,
  midia_url             text,       -- URL no Supabase Storage (se baixada)
  midia_meta_id         text,       -- id do arquivo no Meta Media API
  midia_mime            text,
  midia_duracao_seg     integer,    -- pra áudio/vídeo

  -- Remetente (mutuamente exclusivos: humano OU agente IA OU cliente)
  remetente_id          uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  remetente_agente      text,       -- 'bianca'|'qualificacao'|null
  origem_agente_nome    text,       -- nome que aparece pro cliente ("Kalebe Grün")

  -- Entrega (só faz sentido pra outbound; inbound sempre 'lida')
  status_entrega        text NOT NULL DEFAULT 'pendente' CHECK (status_entrega IN (
    'pendente','enviada','entregue','lida','falhou'
  )),
  erro                  text,

  -- Referência opcional a bianca_comunicacoes (transição — vai poder ser
  -- removida quando Bianca migrar de tabela)
  bianca_comunicacao_id uuid REFERENCES public.bianca_comunicacoes(id) ON DELETE SET NULL,

  criada_em             timestamptz NOT NULL DEFAULT now(),
  entregue_em           timestamptz,
  lida_em               timestamptz,
  respondida_em         timestamptz
);

CREATE INDEX IF NOT EXISTS idx_wa_mensagens_conversa
  ON public.wa_mensagens(conversa_id, criada_em DESC);
CREATE INDEX IF NOT EXISTS idx_wa_mensagens_meta_id
  ON public.wa_mensagens(meta_message_id) WHERE meta_message_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_wa_mensagens_bianca_comunicacao
  ON public.wa_mensagens(bianca_comunicacao_id) WHERE bianca_comunicacao_id IS NOT NULL;

-- ============================================================================
-- Helper: atualiza wa_conversas.ultima_mensagem_em + janela_24h ao gravar msg
-- ============================================================================
CREATE OR REPLACE FUNCTION public.wa_touch_conversa()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  UPDATE public.wa_conversas
     SET ultima_mensagem_em = NEW.criada_em,
         janela_24h_expira_em = CASE
           WHEN NEW.direcao = 'inbound' THEN NEW.criada_em + INTERVAL '24 hours'
           ELSE janela_24h_expira_em
         END
   WHERE id = NEW.conversa_id;

  -- Atualiza última atividade no contato também
  UPDATE public.wa_contatos c
     SET ultima_atividade_em = NEW.criada_em,
         atualizado_em = now()
    FROM public.wa_conversas conv
   WHERE conv.id = NEW.conversa_id
     AND c.id = conv.contato_id;

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_wa_touch_conversa ON public.wa_mensagens;
CREATE TRIGGER trg_wa_touch_conversa
  AFTER INSERT ON public.wa_mensagens
  FOR EACH ROW EXECUTE FUNCTION public.wa_touch_conversa();

-- ============================================================================
-- RLS
-- ============================================================================
ALTER TABLE public.wa_contatos  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wa_conversas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wa_mensagens ENABLE ROW LEVEL SECURITY;

-- Admin lê e escreve tudo
DROP POLICY IF EXISTS wa_contatos_admin_all  ON public.wa_contatos;
CREATE POLICY wa_contatos_admin_all  ON public.wa_contatos
  FOR ALL
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'));

DROP POLICY IF EXISTS wa_conversas_admin_all ON public.wa_conversas;
CREATE POLICY wa_conversas_admin_all ON public.wa_conversas
  FOR ALL
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'));

DROP POLICY IF EXISTS wa_mensagens_admin_all ON public.wa_mensagens;
CREATE POLICY wa_mensagens_admin_all ON public.wa_mensagens
  FOR ALL
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'));

-- Consultor/representante lê SÓ conversas onde é responsável OU broadcast aberto
DROP POLICY IF EXISTS wa_conversas_consultor_read ON public.wa_conversas;
CREATE POLICY wa_conversas_consultor_read ON public.wa_conversas
  FOR SELECT
  USING (
    responsavel_id = auth.uid()
    OR status = 'aguardando_representante'
  );

DROP POLICY IF EXISTS wa_mensagens_consultor_read ON public.wa_mensagens;
CREATE POLICY wa_mensagens_consultor_read ON public.wa_mensagens
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.wa_conversas c
      WHERE c.id = wa_mensagens.conversa_id
        AND (c.responsavel_id = auth.uid() OR c.status = 'aguardando_representante')
    )
  );

DROP POLICY IF EXISTS wa_contatos_consultor_read ON public.wa_contatos;
CREATE POLICY wa_contatos_consultor_read ON public.wa_contatos
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.wa_conversas c
      WHERE c.contato_id = wa_contatos.id
        AND (c.responsavel_id = auth.uid() OR c.status = 'aguardando_representante')
    )
  );

-- ============================================================================
-- Realtime — painel/inbox atualiza sozinho quando chega mensagem
-- ============================================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename IN ('wa_contatos','wa_conversas','wa_mensagens')
    GROUP BY tablename
    HAVING COUNT(*) = 3
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.wa_contatos;
    ALTER PUBLICATION supabase_realtime ADD TABLE public.wa_conversas;
    ALTER PUBLICATION supabase_realtime ADD TABLE public.wa_mensagens;
  END IF;
EXCEPTION WHEN duplicate_object THEN
  NULL;  -- alguma já publicada, ignora
END $$;

NOTIFY pgrst, 'reload schema';
