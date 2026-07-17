-- ============================================================================
-- Migration 040: Documentos jurídicos do cliente (PF + PJ) + sócios
-- ============================================================================
-- Além dos 4 uploads técnicos (disjuntor, padrão, fachada, fatura), o consultor
-- deve enviar documentos jurídicos:
--
--   SEMPRE (PF ou PJ):
--     • CNH do cliente/representante (PDF)
--     • Procuração assinada digitalmente pelo cliente (PDF)
--
--   SE PJ (adicional):
--     • Cartão CNPJ
--     • Contrato Social
--     • docs_socios: array de sócios que precisam assinar procuração
--         Cada sócio: { id, nome, cpf, cnh_url, procuracao_url, enviado_em }
-- ============================================================================

-- Colunas comuns PF+PJ
ALTER TABLE public.homologacoes
  ADD COLUMN IF NOT EXISTS cnh_cliente_url             text,
  ADD COLUMN IF NOT EXISTS cnh_cliente_enviado_em      timestamptz,
  ADD COLUMN IF NOT EXISTS procuracao_cliente_url      text,
  ADD COLUMN IF NOT EXISTS procuracao_cliente_enviado_em timestamptz;

-- Colunas específicas PJ
ALTER TABLE public.homologacoes
  ADD COLUMN IF NOT EXISTS cartao_cnpj_url             text,
  ADD COLUMN IF NOT EXISTS cartao_cnpj_enviado_em      timestamptz,
  ADD COLUMN IF NOT EXISTS contrato_social_url         text,
  ADD COLUMN IF NOT EXISTS contrato_social_enviado_em  timestamptz,
  ADD COLUMN IF NOT EXISTS docs_socios                 jsonb NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN public.homologacoes.docs_socios IS
  'Array de sócios (só se PJ). Formato: [{id, nome, cpf, cnh_url, procuracao_url, enviado_em}]';

-- Índice pra buscar homologações com sócios pendentes
CREATE INDEX IF NOT EXISTS idx_homologacoes_docs_socios_size
  ON public.homologacoes ((jsonb_array_length(docs_socios)));
