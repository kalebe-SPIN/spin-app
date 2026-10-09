-- ============================================================================
-- Migration 146 — Spinzap: contato do WhatsApp cadastrado como fornecedor
-- ============================================================================
-- Kalebe 2026-10-09: "o lead pode ser também cadastrado como fornecedor de
-- equipamento, de produtos e de serviço".
--  - Usa o cadastro de fornecedores que já existe (Financeiro); o contato do
--    WhatsApp aponta pra ele (wa_contatos.fornecedor_id). "Também": o tipo do
--    contato (lead/cliente) não muda — a mesma pessoa pode ser cliente e
--    fornecedor.
--  - fornecedores.tipos: o que fornece (equipamento, produtos, servico),
--    um ou mais.
--  - Fornecedor sem cliente/projeto não é lead: a Laís não atende e a conversa
--    fica com quem cadastrou (fornecedores.criado_por).
-- Idempotente.
-- ============================================================================

BEGIN;

ALTER TABLE public.fornecedores
  ADD COLUMN IF NOT EXISTS tipos      text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS criado_por uuid REFERENCES public.profiles(id) ON DELETE SET NULL;

DO $$ BEGIN
  ALTER TABLE public.fornecedores ADD CONSTRAINT fornecedores_tipos_chk
    CHECK (tipos <@ ARRAY['equipamento', 'produtos', 'servico']::text[]);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE public.wa_contatos
  ADD COLUMN IF NOT EXISTS fornecedor_id uuid REFERENCES public.fornecedores(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_wa_contatos_fornecedor ON public.wa_contatos(fornecedor_id);
CREATE INDEX IF NOT EXISTS idx_fornecedores_telefone  ON public.fornecedores(contato_telefone);

COMMIT;

-- Conferência
SELECT
  (SELECT count(*) FROM public.fornecedores) AS fornecedores,
  (SELECT count(*) FROM public.wa_contatos WHERE fornecedor_id IS NOT NULL) AS contatos_fornecedores;
