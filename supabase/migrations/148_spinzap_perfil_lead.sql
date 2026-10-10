-- ============================================================================
-- Migration 148 — Perfil do lead no Spinzap (sessões de dados + arquivos)
-- ============================================================================
-- Kalebe 2026-10-10: cada sessão fica na linha do perfil do Spinzap, com
-- formulário próprio:
--   Contato (primeiro nome, e-mail, endereço da instalação)
--   Infra civil (laje, tipo de telhado, águas, material da estrutura, área)
--   Infra elétrica (tipo de rede, disjuntor geral)
--   Peculiaridades (projeto no nome do titular da fatura? sombreamento?)
--   Imagens (padrão de entrada, disjuntor geral, fachada)
--   Arquivos (fatura PDF, documento digital, orçamentos gerados)
-- + pendências (ex.: endereço da fatura incompleto e o lead não respondeu).
-- Um perfil por contato do WhatsApp. Quando o contato tem projeto, os dados
-- passam pro projeto (e-mail, endereço, padrão de entrada, titular).
-- Leitura/escrita só pelo servidor (service role) depois de conferir acesso.
-- Idempotente.
-- ============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.spinzap_perfis (
  contato_id      uuid PRIMARY KEY REFERENCES public.wa_contatos(id) ON DELETE CASCADE,
  contato         jsonb NOT NULL DEFAULT '{}'::jsonb,
  infra_civil     jsonb NOT NULL DEFAULT '{}'::jsonb,
  infra_eletrica  jsonb NOT NULL DEFAULT '{}'::jsonb,
  peculiaridades  jsonb NOT NULL DEFAULT '{}'::jsonb,
  pendencias      jsonb NOT NULL DEFAULT '[]'::jsonb,
  atualizado_em   timestamptz NOT NULL DEFAULT now(),
  atualizado_por  uuid REFERENCES public.profiles(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS public.spinzap_arquivos (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contato_id      uuid NOT NULL REFERENCES public.wa_contatos(id) ON DELETE CASCADE,
  categoria       text NOT NULL CHECK (categoria IN (
    'padrao_entrada', 'disjuntor_geral', 'fachada', 'fatura', 'doc_digital', 'orcamento', 'outro'
  )),
  url             text NOT NULL,
  nome            text,
  mime            text,
  origem          text NOT NULL DEFAULT 'equipe' CHECK (origem IN ('cliente', 'gerado', 'equipe')),
  wa_mensagem_id  uuid REFERENCES public.wa_mensagens(id) ON DELETE SET NULL,
  projeto_id      uuid REFERENCES public.projetos(id) ON DELETE SET NULL,
  criado_por      uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  criado_em       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_spinzap_arquivos_contato ON public.spinzap_arquivos(contato_id, categoria);

ALTER TABLE public.spinzap_perfis   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.spinzap_arquivos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS spinzap_perfis_admin ON public.spinzap_perfis;
CREATE POLICY spinzap_perfis_admin ON public.spinzap_perfis FOR ALL USING (public.is_admin());
DROP POLICY IF EXISTS spinzap_arquivos_admin ON public.spinzap_arquivos;
CREATE POLICY spinzap_arquivos_admin ON public.spinzap_arquivos FOR ALL USING (public.is_admin());

COMMIT;

-- Conferência
SELECT
  (SELECT count(*) FROM public.spinzap_perfis)   AS perfis,
  (SELECT count(*) FROM public.spinzap_arquivos) AS arquivos;
