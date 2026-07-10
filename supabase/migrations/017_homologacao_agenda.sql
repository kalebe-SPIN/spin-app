-- =================================================================
-- Migration 017 — Homologação + Agenda (schemas base)
-- =================================================================

-- ===== 1. HOMOLOGAÇÕES =====
-- Pipeline de aprovação CELESC. Cada projeto aceito vira uma homologação.

CREATE TABLE IF NOT EXISTS public.homologacoes (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  projeto_id            uuid NOT NULL REFERENCES public.projetos(id) ON DELETE CASCADE,

  -- Metadados CELESC
  protocolo_celesc      text,                -- número do protocolo emitido pela CELESC
  data_solicitacao      date,                -- quando protocolamos
  data_aprovacao        date,                -- quando CELESC aprovou
  data_prevista_troca_medidor  date,

  -- Etapa atual (0-5) pra facilitar filtros
  etapa_atual           int NOT NULL DEFAULT 0,
  status_geral          text NOT NULL DEFAULT 'iniciado',  -- iniciado | em_andamento | aprovada | rejeitada | cancelada

  -- Responsável técnico atribuído
  eletrotecnico_id      uuid REFERENCES public.profiles(id),

  observacoes           text,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),

  UNIQUE(projeto_id)
);

CREATE INDEX IF NOT EXISTS idx_homologacoes_status ON public.homologacoes(status_geral);
CREATE INDEX IF NOT EXISTS idx_homologacoes_etapa ON public.homologacoes(etapa_atual);
CREATE INDEX IF NOT EXISTS idx_homologacoes_eletrotecnico ON public.homologacoes(eletrotecnico_id);

-- ===== 2. ETAPAS DA HOMOLOGAÇÃO =====
-- Uma linha por etapa (6 etapas fixas por projeto)

CREATE TABLE IF NOT EXISTS public.homologacao_etapas (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  homologacao_id        uuid NOT NULL REFERENCES public.homologacoes(id) ON DELETE CASCADE,

  ordem                 int NOT NULL,          -- 1 a 6
  chave                 text NOT NULL,         -- 'diagrama_unifilar' | 'layout_instalacao' | 'memorial_descritivo' | 'lista_kit' | 'lista_ca' | 'aprovacao_celesc'
  nome_exibicao         text NOT NULL,

  status                text NOT NULL DEFAULT 'pendente',   -- pendente | em_andamento | concluido | erro | bloqueado

  -- Arquivos gerados nessa etapa
  url_arquivo_pdf       text,
  url_arquivo_dwg       text,
  url_arquivo_svg       text,
  url_arquivo_outros    text[],  -- ART, boleto, etc

  -- Responsável e datas
  responsavel_id        uuid REFERENCES public.profiles(id),
  iniciado_em           timestamptz,
  concluido_em          timestamptz,

  observacoes           text,
  dados_extra           jsonb,   -- payload específico da etapa

  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),

  UNIQUE(homologacao_id, chave)
);

CREATE INDEX IF NOT EXISTS idx_hom_etapas_homologacao ON public.homologacao_etapas(homologacao_id, ordem);
CREATE INDEX IF NOT EXISTS idx_hom_etapas_status ON public.homologacao_etapas(status);

-- ===== 3. AGENDA — EVENTOS =====
-- Eventos com hora marcada (reuniões, instalações, etc)

CREATE TABLE IF NOT EXISTS public.agenda_eventos (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  titulo                text NOT NULL,
  descricao             text,

  -- Data e hora
  data_hora_inicio      timestamptz NOT NULL,
  data_hora_fim         timestamptz,
  dia_inteiro           boolean NOT NULL DEFAULT false,

  -- Localização
  local                 text,                   -- endereço ou "Online"
  url_reuniao           text,                   -- link Google Meet/Zoom

  -- Categoria
  tipo                  text NOT NULL DEFAULT 'geral',  -- reuniao | visita_tecnica | instalacao | cliente | ligacao | outro
  cor                   text DEFAULT '#587FFF', -- hex color pra calendar

  -- Vínculos
  usuario_id            uuid NOT NULL REFERENCES public.profiles(id),
  projeto_id            uuid REFERENCES public.projetos(id) ON DELETE SET NULL,
  cliente_nome          text,                   -- se não tiver projeto vinculado

  -- Alertas
  lembrete_min_antes    int,                    -- 15, 30, 60 etc — antes do evento
  notificacao_enviada   boolean NOT NULL DEFAULT false,

  -- Origem
  criado_por_bianca     boolean NOT NULL DEFAULT false,
  origem_conversa_id    uuid,                   -- conversa com Bianca que gerou o evento

  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_agenda_ev_usuario_data ON public.agenda_eventos(usuario_id, data_hora_inicio);
CREATE INDEX IF NOT EXISTS idx_agenda_ev_tipo ON public.agenda_eventos(tipo);

-- ===== 4. AGENDA — TAREFAS =====
-- Tarefas sem hora fixa, com prazo

CREATE TABLE IF NOT EXISTS public.agenda_tarefas (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  titulo                text NOT NULL,
  descricao             text,

  -- Prazo
  data_prazo            date,
  prioridade            text NOT NULL DEFAULT 'media',  -- baixa | media | alta | urgente

  -- Status
  status                text NOT NULL DEFAULT 'pendente',  -- pendente | em_andamento | concluida | cancelada
  concluida_em          timestamptz,

  -- Vínculos
  usuario_id            uuid NOT NULL REFERENCES public.profiles(id),
  projeto_id            uuid REFERENCES public.projetos(id) ON DELETE SET NULL,

  -- Origem
  criada_por_bianca     boolean NOT NULL DEFAULT false,
  origem_conversa_id    uuid,

  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_agenda_tar_usuario_status ON public.agenda_tarefas(usuario_id, status);
CREATE INDEX IF NOT EXISTS idx_agenda_tar_prazo ON public.agenda_tarefas(data_prazo) WHERE status = 'pendente';

-- ===== 5. AGENTE BIANCA — CONVERSAS =====
-- Cada linha é uma mensagem (usuário ou Bianca)

CREATE TABLE IF NOT EXISTS public.bianca_conversas (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  usuario_id            uuid NOT NULL REFERENCES public.profiles(id),
  papel                 text NOT NULL,  -- 'usuario' | 'bianca' | 'sistema'
  conteudo              text NOT NULL,

  -- Se Bianca chamou alguma tool/function
  ferramenta_usada      text,           -- 'criar_evento' | 'listar_tarefas' | 'enviar_whatsapp' etc
  ferramenta_input      jsonb,
  ferramenta_output     jsonb,

  -- Canal de origem
  canal                 text NOT NULL DEFAULT 'chat',  -- chat | whatsapp | email | cron_matinal

  created_at            timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_bianca_conv_usuario_data ON public.bianca_conversas(usuario_id, created_at DESC);

-- ===== 6. RLS =====

ALTER TABLE public.homologacoes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.homologacao_etapas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agenda_eventos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agenda_tarefas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bianca_conversas ENABLE ROW LEVEL SECURITY;

-- Homologação: admin e eletrotécnico designado lêem/editam
CREATE POLICY "homologacoes_admin_all" ON public.homologacoes
  FOR ALL USING (public.is_admin());

CREATE POLICY "homologacoes_eletrotecnico_read" ON public.homologacoes
  FOR SELECT USING (eletrotecnico_id = auth.uid());

CREATE POLICY "homologacoes_eletrotecnico_update" ON public.homologacoes
  FOR UPDATE USING (eletrotecnico_id = auth.uid());

CREATE POLICY "hom_etapas_admin_all" ON public.homologacao_etapas
  FOR ALL USING (public.is_admin());

CREATE POLICY "hom_etapas_auth_read" ON public.homologacao_etapas
  FOR SELECT USING (auth.uid() IS NOT NULL);

CREATE POLICY "hom_etapas_responsavel_update" ON public.homologacao_etapas
  FOR UPDATE USING (responsavel_id = auth.uid());

-- Agenda: só o próprio usuário lê/edita seus eventos e tarefas
CREATE POLICY "agenda_ev_dono" ON public.agenda_eventos
  FOR ALL USING (usuario_id = auth.uid());

CREATE POLICY "agenda_ev_admin_read" ON public.agenda_eventos
  FOR SELECT USING (public.is_admin());

CREATE POLICY "agenda_tar_dono" ON public.agenda_tarefas
  FOR ALL USING (usuario_id = auth.uid());

CREATE POLICY "agenda_tar_admin_read" ON public.agenda_tarefas
  FOR SELECT USING (public.is_admin());

CREATE POLICY "bianca_conv_dono" ON public.bianca_conversas
  FOR ALL USING (usuario_id = auth.uid());
