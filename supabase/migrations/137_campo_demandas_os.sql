-- ============================================================================
-- Migration 137 — Painel do profissional de campo: demandas e ordem de serviço
-- ============================================================================
-- Kalebe 2026-10-05:
--  - Demandas de serviço (execucoes_servicos): as que nascem da venda e as
--    que o próprio profissional de campo cadastra (sem projeto) — com tipo,
--    endereço (cidade/bairro pra agrupar por região) e contato.
--  - Agendar = sai das demandas e vai pra agenda dele (agenda_evento_id).
--    Passou a data sem execução → a Bianca devolve pras demandas (aberta).
--  - Cada serviço é uma ORDEM DE SERVIÇO (os_numero): checklist, fotos,
--    custos extras e assinatura do cliente no fim.
--
-- A 053 (execucoes_servicos) nunca foi aplicada em produção — esta migration
-- cria a tabela completa se ela não existir e só acrescenta o que falta se
-- existir. Leitura restrita (admin, responsável ou quem criou): tem nome,
-- telefone e endereço do cliente; o painel do campo lê pelo servidor.
-- Idempotente.
-- ============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.execucoes_servicos (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Vínculos (demanda avulsa do campo não tem projeto)
  projeto_id            uuid REFERENCES public.projetos(id) ON DELETE CASCADE,
  item_id               uuid REFERENCES public.projeto_itens(id) ON DELETE SET NULL,
  tipo_servico          text NOT NULL,
  titulo                text NOT NULL,
  valor_contratado      numeric(12,2),

  status                text NOT NULL DEFAULT 'aguardando_pre_requisitos' CHECK (status IN (
    'aguardando_pre_requisitos', 'agendando', 'agendado', 'preparando_material',
    'em_execucao', 'concluido', 'entregue', 'pos_venda', 'cancelado'
  )),

  -- Agenda
  data_agendada         date,
  hora_agendada         time,
  duracao_estimada_dias numeric(4,1),
  endereco_execucao     text,

  -- Equipe
  responsavel_tecnico   uuid REFERENCES auth.users(id),
  equipe_ids            uuid[] DEFAULT '{}',

  -- Materiais
  materiais_separados   boolean NOT NULL DEFAULT false,
  materiais_lista       jsonb DEFAULT '[]',
  checklist_pre_exec    jsonb DEFAULT '[]',

  -- Execução
  fotos_antes_urls      text[] DEFAULT '{}',
  fotos_durante_urls    text[] DEFAULT '{}',
  fotos_depois_urls     text[] DEFAULT '{}',
  observacoes           text,
  problemas_encontrados text,

  -- Aceite e conclusão
  data_inicio_real      timestamptz,
  data_conclusao        timestamptz,
  data_entrega          timestamptz,
  cliente_aceitou       boolean,
  aceite_texto          text,
  termo_conclusao_url   text,

  criada_por            uuid REFERENCES auth.users(id),
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);

-- Se a tabela já existia (053 aplicada): demanda avulsa não tem projeto
ALTER TABLE public.execucoes_servicos ALTER COLUMN projeto_id DROP NOT NULL;

-- Painel do campo
ALTER TABLE public.execucoes_servicos
  ADD COLUMN IF NOT EXISTS origem               text NOT NULL DEFAULT 'projeto',
  ADD COLUMN IF NOT EXISTS cliente_nome         text,
  ADD COLUMN IF NOT EXISTS contato_nome         text,
  ADD COLUMN IF NOT EXISTS contato_telefone     text,
  ADD COLUMN IF NOT EXISTS endereco             jsonb,      -- {cep, logradouro, numero, complemento, bairro, cidade, uf}
  ADD COLUMN IF NOT EXISTS cidade               text,       -- filtro por região
  ADD COLUMN IF NOT EXISTS bairro               text,
  ADD COLUMN IF NOT EXISTS descricao            text,
  ADD COLUMN IF NOT EXISTS os_numero            int,
  ADD COLUMN IF NOT EXISTS checklist            jsonb NOT NULL DEFAULT '[]',  -- [{item, feito, obs}]
  ADD COLUMN IF NOT EXISTS assinatura_path      text,       -- bucket privado ordens-servico
  ADD COLUMN IF NOT EXISTS assinatura_nome      text,
  ADD COLUMN IF NOT EXISTS assinatura_documento text,
  ADD COLUMN IF NOT EXISTS assinado_em          timestamptz,
  ADD COLUMN IF NOT EXISTS agenda_evento_id     uuid REFERENCES public.agenda_eventos(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS vezes_reaberta       int NOT NULL DEFAULT 0;

DO $$ BEGIN
  ALTER TABLE public.execucoes_servicos
    ADD CONSTRAINT execucoes_origem_chk CHECK (origem IN ('projeto', 'manual'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Número da OS: sequencial
CREATE SEQUENCE IF NOT EXISTS public.os_numero_seq;
ALTER TABLE public.execucoes_servicos ALTER COLUMN os_numero SET DEFAULT nextval('public.os_numero_seq');
UPDATE public.execucoes_servicos SET os_numero = nextval('public.os_numero_seq') WHERE os_numero IS NULL;

CREATE INDEX IF NOT EXISTS idx_execucoes_status        ON public.execucoes_servicos(status);
CREATE INDEX IF NOT EXISTS idx_execucoes_projeto       ON public.execucoes_servicos(projeto_id);
CREATE INDEX IF NOT EXISTS idx_execucoes_responsavel   ON public.execucoes_servicos(responsavel_tecnico);
CREATE INDEX IF NOT EXISTS idx_execucoes_data_agendada ON public.execucoes_servicos(data_agendada);
CREATE INDEX IF NOT EXISTS idx_execucoes_cidade        ON public.execucoes_servicos(cidade);
CREATE UNIQUE INDEX IF NOT EXISTS uq_execucoes_item    ON public.execucoes_servicos(item_id) WHERE item_id IS NOT NULL;

-- Execuções que já existiam: copia cliente, contato e endereço do projeto
UPDATE public.execucoes_servicos e SET
  cliente_nome     = COALESCE(e.cliente_nome, p.cliente_razao_social),
  contato_telefone = COALESCE(e.contato_telefone, p.cliente_telefone),
  endereco         = COALESCE(e.endereco, NULLIF(p.endereco_instalacao, '{}'::jsonb), p.cliente_endereco),
  cidade           = COALESCE(e.cidade, p.endereco_instalacao->>'cidade', p.cliente_endereco->>'cidade'),
  bairro           = COALESCE(e.bairro, p.endereco_instalacao->>'bairro', p.cliente_endereco->>'bairro')
FROM public.projetos p
WHERE p.id = e.projeto_id;

-- RLS
ALTER TABLE public.execucoes_servicos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "execucoes_read_all" ON public.execucoes_servicos;
DROP POLICY IF EXISTS "execucoes_read" ON public.execucoes_servicos;
CREATE POLICY "execucoes_read" ON public.execucoes_servicos
  FOR SELECT USING (public.is_admin() OR responsavel_tecnico = auth.uid() OR criada_por = auth.uid());

DROP POLICY IF EXISTS "execucoes_admin_all" ON public.execucoes_servicos;
CREATE POLICY "execucoes_admin_all" ON public.execucoes_servicos
  FOR ALL USING (public.is_admin());

DROP POLICY IF EXISTS "execucoes_responsavel_update" ON public.execucoes_servicos;
CREATE POLICY "execucoes_responsavel_update" ON public.execucoes_servicos
  FOR UPDATE USING (responsavel_tecnico = auth.uid() OR criada_por = auth.uid());

-- Histórico de status
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
  FOR SELECT USING (public.is_admin() OR usuario_id = auth.uid());
DROP POLICY IF EXISTS "execucoes_hist_insert_auth" ON public.execucoes_status_historico;
CREATE POLICY "execucoes_hist_insert_auth" ON public.execucoes_status_historico
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

-- Realtime (o que a 075 tentou e caiu por falta desta tabela)
DO $$ BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.execucoes_servicos;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.projetos;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.telhados;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Fotos e assinatura da OS: bucket privado (só o servidor grava; link temporário pra ver)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('ordens-servico', 'ordens-servico', false, 10485760, ARRAY['image/jpeg', 'image/png', 'image/webp'])
ON CONFLICT (id) DO NOTHING;

COMMIT;

-- Conferência
SELECT
  (SELECT count(*) FROM public.execucoes_servicos)               AS execucoes,
  (SELECT count(*) FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'execucoes_servicos') AS colunas,
  (SELECT count(*) FROM storage.buckets WHERE id = 'ordens-servico') AS bucket_os;
