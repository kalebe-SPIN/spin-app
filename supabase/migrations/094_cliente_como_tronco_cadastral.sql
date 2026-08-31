-- ═══════════════════════════════════════════════════════════════════════
-- Migration 094 — Cliente como tronco cadastral
--
-- Kalebe 2026-08-29: 'quando um cliente faço uma nova proposta dentro
-- do card dele ele não puxa os dados cadastrais. Para cada cliente
-- deve ter só uma trilha que pode se bifurcar em várias propostas —
-- o que muda é kit em diante, o restante permanece num só cadastro'.
--
-- Estratégia: dados cadastrais (fatura CELESC, padrão de entrada,
-- beneficiárias, seções de telhado) sobem pro cliente. Cada projeto
-- (proposta) continua com kit/lista_ca/orçamento/proposta próprios.
--
-- Fase 1 (esta migration): adiciona colunas de espelho em clientes
-- + backfill da 1ª proposta de cada cliente.
--
-- Fase 2 (código): actions passam a gravar em ambos (cliente + projeto).
-- Nova action 'criarNovaPropostaMesmoClienteAction' cria projeto já
-- com snapshot preenchido do cliente.
--
-- Backwards-compat: projetos.analise_fatura/padrao_entrada/beneficiarias
-- CONTINUAM existindo — as leituras existentes seguem funcionando. A
-- gravação passa a ser dual-write (cliente + projeto).
-- ═══════════════════════════════════════════════════════════════════════

ALTER TABLE public.clientes
  ADD COLUMN IF NOT EXISTS analise_fatura jsonb,
  ADD COLUMN IF NOT EXISTS padrao_entrada jsonb,
  ADD COLUMN IF NOT EXISTS beneficiarias jsonb DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS telhado_secoes jsonb DEFAULT '[]'::jsonb;

COMMENT ON COLUMN public.clientes.analise_fatura IS
  'Análise da fatura CELESC (jsonb) — mesma estrutura de projetos.analise_fatura. Fonte da verdade compartilhada entre propostas do cliente.';
COMMENT ON COLUMN public.clientes.padrao_entrada IS
  'Padrão de entrada CELESC (jsonb) — mesma estrutura de projetos.padrao_entrada.';
COMMENT ON COLUMN public.clientes.beneficiarias IS
  'Beneficiárias (jsonb array) — mesma estrutura de projetos.beneficiarias.';
COMMENT ON COLUMN public.clientes.telhado_secoes IS
  'Seções de telhado (jsonb array) — snapshot copiado de projetos_telhado_secoes pra o cliente. Cada proposta pode ainda ter as suas próprias em projetos_telhado_secoes.';

-- ─── BACKFILL ────────────────────────────────────────────────────────
-- Pra cada cliente, pega a proposta MAIS RECENTE com dados cadastrais
-- preenchidos e copia pra o cliente. Só preenche se o cliente ainda
-- estiver com o campo nulo/vazio (idempotente).

DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT DISTINCT ON (p.cliente_id)
      p.cliente_id,
      p.analise_fatura,
      p.padrao_entrada,
      p.beneficiarias,
      p.id AS projeto_id
    FROM public.projetos p
    WHERE p.cliente_id IS NOT NULL
      AND (p.analise_fatura IS NOT NULL OR p.padrao_entrada IS NOT NULL)
    ORDER BY p.cliente_id, p.updated_at DESC NULLS LAST, p.created_at DESC
  LOOP
    UPDATE public.clientes c
    SET
      analise_fatura = COALESCE(c.analise_fatura, r.analise_fatura),
      padrao_entrada = COALESCE(c.padrao_entrada, r.padrao_entrada),
      beneficiarias = CASE
        WHEN c.beneficiarias IS NULL OR c.beneficiarias = '[]'::jsonb
          THEN COALESCE(r.beneficiarias, '[]'::jsonb)
        ELSE c.beneficiarias
      END,
      -- telhado_secoes: pega do projeto via subquery
      telhado_secoes = CASE
        WHEN c.telhado_secoes IS NULL OR c.telhado_secoes = '[]'::jsonb THEN (
          SELECT COALESCE(jsonb_agg(row_to_json(ts.*)::jsonb), '[]'::jsonb)
          FROM public.projetos_telhado_secoes ts
          WHERE ts.projeto_id = r.projeto_id
        )
        ELSE c.telhado_secoes
      END,
      updated_at = now()
    WHERE c.id = r.cliente_id;
  END LOOP;
END $$;
