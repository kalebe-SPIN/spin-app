-- Migration 053: modulo Execucoes — pipeline de obras e servicos contratados
--
-- Elo entre 'venda concretizada' e 'pos-venda ativo':
--   Cliente aceita proposta -> cria execucao pra CADA item da proposta
--   Execucao passa por estados ate 'entregue'
--   Depois vira caso de pos-venda (garantia, chamados, O&M)
--
-- Kalebe: "pipeline de execucao das obras e servicos contratados"

CREATE TABLE IF NOT EXISTS public.execucoes_servicos (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Vinculos
  projeto_id            uuid NOT NULL REFERENCES public.projetos(id) ON DELETE CASCADE,
  item_id               uuid REFERENCES public.projeto_itens(id) ON DELETE SET NULL,
  tipo_servico          text NOT NULL,       -- 'srv_limpeza', 'srv_instalacao_placas', 'fv_ongrid' etc
  titulo                text NOT NULL,       -- ex: 'Instalação de módulos - Ludmila Shayane'
  valor_contratado      numeric(12,2),

  -- Estado atual no pipeline
  status                text NOT NULL DEFAULT 'aguardando_pre_requisitos' CHECK (status IN (
    'aguardando_pre_requisitos',  -- aguarda contrato/pagamento/homologação
    'agendando',                  -- buscando data com cliente
    'agendado',                   -- data confirmada
    'preparando_material',        -- separando insumos, comprando
    'em_execucao',                -- equipe no local
    'concluido',                  -- serviço finalizado tecnicamente
    'entregue',                   -- cliente assinou aceite
    'pos_venda',                  -- em garantia, monitoramento
    'cancelado'                   -- desistência ou impossibilidade
  )),

  -- Agenda
  data_agendada         date,
  hora_agendada         time,
  duracao_estimada_dias numeric(4,1),
  endereco_execucao     text,                -- pode diferir do cliente

  -- Equipe
  responsavel_tecnico   uuid REFERENCES auth.users(id),
  equipe_ids            uuid[] DEFAULT '{}',  -- ids dos instaladores

  -- Materiais e checklist
  materiais_separados   boolean NOT NULL DEFAULT false,
  materiais_lista       jsonb DEFAULT '[]',   -- [{descricao, qtd, checado}]
  checklist_pre_exec    jsonb DEFAULT '[]',   -- [{item, checado}]

  -- Execucao (fotos, notas)
  fotos_antes_urls      text[] DEFAULT '{}',
  fotos_durante_urls    text[] DEFAULT '{}',
  fotos_depois_urls     text[] DEFAULT '{}',
  observacoes           text,
  problemas_encontrados text,

  -- Aceite e conclusao
  data_inicio_real      timestamptz,
  data_conclusao        timestamptz,
  data_entrega          timestamptz,
  cliente_aceitou       boolean,
  aceite_texto          text,                 -- ex: "Cliente confirmou execução OK via WhatsApp"
  termo_conclusao_url   text,                 -- PDF assinado

  -- Metadata
  criada_por            uuid REFERENCES auth.users(id),
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_execucoes_status ON public.execucoes_servicos(status);
CREATE INDEX IF NOT EXISTS idx_execucoes_projeto ON public.execucoes_servicos(projeto_id);
CREATE INDEX IF NOT EXISTS idx_execucoes_responsavel ON public.execucoes_servicos(responsavel_tecnico);
CREATE INDEX IF NOT EXISTS idx_execucoes_data_agendada ON public.execucoes_servicos(data_agendada);

ALTER TABLE public.execucoes_servicos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "execucoes_read_all" ON public.execucoes_servicos;
CREATE POLICY "execucoes_read_all" ON public.execucoes_servicos
  FOR SELECT USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "execucoes_admin_all" ON public.execucoes_servicos;
CREATE POLICY "execucoes_admin_all" ON public.execucoes_servicos
  FOR ALL USING (public.is_admin());

DROP POLICY IF EXISTS "execucoes_responsavel_update" ON public.execucoes_servicos;
CREATE POLICY "execucoes_responsavel_update" ON public.execucoes_servicos
  FOR UPDATE USING (responsavel_tecnico = auth.uid() OR criada_por = auth.uid());

-- ============================================================================
-- Historico de mudanças de status
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.execucoes_status_historico (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  execucao_id     uuid NOT NULL REFERENCES public.execucoes_servicos(id) ON DELETE CASCADE,
  status_anterior text,
  status_novo     text NOT NULL,
  observacoes     text,
  usuario_id      uuid REFERENCES auth.users(id),
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_execucoes_hist ON public.execucoes_status_historico(execucao_id, created_at DESC);

ALTER TABLE public.execucoes_status_historico ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "execucoes_hist_read_all" ON public.execucoes_status_historico;
CREATE POLICY "execucoes_hist_read_all" ON public.execucoes_status_historico
  FOR SELECT USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "execucoes_hist_insert_auth" ON public.execucoes_status_historico;
CREATE POLICY "execucoes_hist_insert_auth" ON public.execucoes_status_historico
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

-- ============================================================================
-- Bucket pra fotos de execução (antes/durante/depois)
-- ============================================================================
INSERT INTO storage.buckets (id, name, public)
VALUES ('execucoes-fotos', 'execucoes-fotos', true)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "execucoes_fotos_auth_all" ON storage.objects;
CREATE POLICY "execucoes_fotos_auth_all" ON storage.objects
  FOR ALL USING (bucket_id = 'execucoes-fotos' AND auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "execucoes_fotos_public_read" ON storage.objects;
CREATE POLICY "execucoes_fotos_public_read" ON storage.objects
  FOR SELECT USING (bucket_id = 'execucoes-fotos');
