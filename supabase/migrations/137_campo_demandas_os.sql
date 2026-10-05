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
-- Idempotente.
-- ============================================================================

BEGIN;

-- Demanda avulsa (cadastrada no campo) não tem projeto
ALTER TABLE public.execucoes_servicos ALTER COLUMN projeto_id DROP NOT NULL;

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

CREATE INDEX IF NOT EXISTS idx_execucoes_cidade ON public.execucoes_servicos(cidade);

-- Execuções que já existem: copia cliente, contato e endereço do projeto
UPDATE public.execucoes_servicos e SET
  cliente_nome     = COALESCE(e.cliente_nome, p.cliente_razao_social),
  contato_telefone = COALESCE(e.contato_telefone, p.cliente_telefone),
  endereco         = COALESCE(e.endereco, NULLIF(p.endereco_instalacao, '{}'::jsonb), p.cliente_endereco),
  cidade           = COALESCE(e.cidade, p.endereco_instalacao->>'cidade', p.cliente_endereco->>'cidade'),
  bairro           = COALESCE(e.bairro, p.endereco_instalacao->>'bairro', p.cliente_endereco->>'bairro')
FROM public.projetos p
WHERE p.id = e.projeto_id;

-- Fotos e assinatura da OS: bucket privado (só o servidor grava; link temporário pra ver)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('ordens-servico', 'ordens-servico', false, 10485760, ARRAY['image/jpeg', 'image/png', 'image/webp'])
ON CONFLICT (id) DO NOTHING;

COMMIT;

-- Conferência
SELECT status, count(*) AS qtd, count(cidade) AS com_cidade
FROM public.execucoes_servicos GROUP BY status ORDER BY status;
