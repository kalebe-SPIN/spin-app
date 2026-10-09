-- ============================================================================
-- Migration 145 — Spinzap (fase 1): etapas, etiquetas, dono e transferência
-- ============================================================================
-- Kalebe 2026-10-09: o Inbox vira o Spinzap, centro do sistema.
--  - Etapa de atendimento (barra lateral ordenada como um CRM, cor por etapa):
--    atendimento_lais · reuniao_agendada · reagendamento · negocio_andamento
--    · visita_agendada · fechado · perdido
--  - Etiquetas do cliente no cabeçalho: cidade/UF e produto/serviço (o perfil
--    de compra é a família do produto) + data de entrada (wa_contatos.criado_em)
--  - Dono da conversa + transferência TEMPORÁRIA: quem recebe vê e interage
--    só enquanto está com o cliente; "Concluir atendimento" devolve pra quem
--    transferiu. Histórico em wa_transferencias.
--  - Acesso: admin vê tudo; os demais, as suas (responsável ou dono) e as
--    transferidas pra eles.
-- Idempotente.
-- ============================================================================

BEGIN;

ALTER TABLE public.wa_conversas
  ADD COLUMN IF NOT EXISTS etapa                text NOT NULL DEFAULT 'atendimento_lais',
  ADD COLUMN IF NOT EXISTS etapa_em             timestamptz,
  ADD COLUMN IF NOT EXISTS cidade               text,
  ADD COLUMN IF NOT EXISTS uf                   text,
  ADD COLUMN IF NOT EXISTS produto              text,      -- tipo do item (fv_ongrid, srv_limpeza, ...)
  ADD COLUMN IF NOT EXISTS dono_id              uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS transferida_de       uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS transferida_em       timestamptz,
  ADD COLUMN IF NOT EXISTS transferencia_recado text;

DO $$ BEGIN
  ALTER TABLE public.wa_conversas ADD CONSTRAINT wa_conversas_etapa_chk CHECK (etapa IN (
    'atendimento_lais', 'reuniao_agendada', 'reagendamento', 'negocio_andamento',
    'visita_agendada', 'fechado', 'perdido'
  ));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS idx_wa_conversas_etapa ON public.wa_conversas(etapa);
CREATE INDEX IF NOT EXISTS idx_wa_conversas_dono  ON public.wa_conversas(dono_id);
CREATE INDEX IF NOT EXISTS idx_wa_conversas_cidade ON public.wa_conversas(cidade);

-- Histórico das transferências (quem passou, pra quem, quando voltou)
CREATE TABLE IF NOT EXISTS public.wa_transferencias (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversa_id      uuid NOT NULL REFERENCES public.wa_conversas(id) ON DELETE CASCADE,
  de_id            uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  para_id          uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  setor            text,
  recado           text,
  criada_em        timestamptz NOT NULL DEFAULT now(),
  concluida_em     timestamptz,
  concluida_por    uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  resumo_conclusao text
);
CREATE INDEX IF NOT EXISTS idx_wa_transf_conversa ON public.wa_transferencias(conversa_id, criada_em DESC);
ALTER TABLE public.wa_transferencias ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS wa_transf_leitura ON public.wa_transferencias;
CREATE POLICY wa_transf_leitura ON public.wa_transferencias FOR SELECT
  USING (public.is_admin() OR de_id = auth.uid() OR para_id = auth.uid());

-- Acesso: responsável, dono, ou quem transferiu e espera a devolução
DROP POLICY IF EXISTS wa_conversas_consultor_read ON public.wa_conversas;
CREATE POLICY wa_conversas_consultor_read ON public.wa_conversas FOR SELECT
  USING (
    responsavel_id = auth.uid() OR dono_id = auth.uid() OR transferida_de = auth.uid()
    OR status = 'aguardando_representante'
  );

DROP POLICY IF EXISTS wa_mensagens_consultor_read ON public.wa_mensagens;
CREATE POLICY wa_mensagens_consultor_read ON public.wa_mensagens FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.wa_conversas c
    WHERE c.id = wa_mensagens.conversa_id
      AND (c.responsavel_id = auth.uid() OR c.dono_id = auth.uid() OR c.transferida_de = auth.uid()
           OR c.status = 'aguardando_representante')
  ));

DROP POLICY IF EXISTS wa_contatos_consultor_read ON public.wa_contatos;
CREATE POLICY wa_contatos_consultor_read ON public.wa_contatos FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.wa_conversas c
    WHERE c.contato_id = wa_contatos.id
      AND (c.responsavel_id = auth.uid() OR c.dono_id = auth.uid() OR c.transferida_de = auth.uid()
           OR c.status = 'aguardando_representante')
  ));

-- ─── Preenche o que já existe ────────────────────────────────────────────────
-- Dono = quem atende hoje
UPDATE public.wa_conversas SET dono_id = responsavel_id WHERE dono_id IS NULL AND responsavel_id IS NOT NULL;

-- Cidade/UF: o que a Laís coletou; senão o endereço do projeto do contato
UPDATE public.wa_conversas c SET
  cidade = COALESCE(c.cidade, NULLIF(c.contexto_qualificacao->>'cidade', '')),
  uf     = COALESCE(c.uf, NULLIF(c.contexto_qualificacao->>'uf', ''))
WHERE c.cidade IS NULL;
UPDATE public.wa_conversas c SET
  cidade = COALESCE(c.cidade, p.endereco_instalacao->>'cidade', p.cliente_endereco->>'cidade'),
  uf     = COALESCE(c.uf, p.endereco_instalacao->>'uf', p.cliente_endereco->>'uf')
FROM public.wa_contatos ct JOIN public.projetos p ON p.id = ct.projeto_id
WHERE ct.id = c.contato_id AND c.cidade IS NULL;

-- Produto: 1º item do projeto do contato; senão o tipo de sistema da Laís
UPDATE public.wa_conversas c SET produto = sub.tipo
FROM (
  SELECT DISTINCT ON (ct.id) ct.id AS contato_id, i.tipo::text AS tipo
  FROM public.wa_contatos ct
  JOIN public.projeto_itens i ON i.projeto_id = ct.projeto_id
  WHERE i.status IS NULL OR i.status::text <> 'removido'
  ORDER BY ct.id, i.created_at
) sub
WHERE sub.contato_id = c.contato_id AND c.produto IS NULL;
UPDATE public.wa_conversas c SET produto = CASE c.contexto_qualificacao->>'tipo_sistema'
    WHEN 'on_grid' THEN 'fv_ongrid' WHEN 'hibrido' THEN 'fv_hibrido' WHEN 'bess' THEN 'bess'
    WHEN 'limpeza' THEN 'srv_limpeza' WHEN 'revisao' THEN 'srv_manutencao' WHEN 've_recarga' THEN 've_recarga'
    ELSE NULL END
WHERE c.produto IS NULL AND c.contexto_qualificacao->>'tipo_sistema' IS NOT NULL;

-- Etapa pela etapa do projeto do contato
UPDATE public.wa_conversas c SET etapa = CASE
    WHEN p.status::text IN ('vendido', 'aceito', 'em_homologacao', 'em_execucao', 'instalado', 'ativo_pos_venda') THEN 'fechado'
    WHEN p.status::text IN ('recusado', 'cancelado', 'expirado') OR p.encerrado_tipo = 'perdido' THEN 'perdido'
    WHEN p.status::text IN ('proposta_enviada', 'negociando', 'em_fechamento') THEN 'negocio_andamento'
    ELSE c.etapa END,
  etapa_em = now()
FROM public.wa_contatos ct JOIN public.projetos p ON p.id = ct.projeto_id
WHERE ct.id = c.contato_id;

COMMIT;

-- Conferência
SELECT etapa, count(*) AS conversas, count(cidade) AS com_cidade, count(produto) AS com_produto
FROM public.wa_conversas WHERE encerrada_em IS NULL GROUP BY etapa ORDER BY etapa;
