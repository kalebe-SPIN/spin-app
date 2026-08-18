-- ============================================================================
-- Migration 073 — Biblioteca de criativos de venda
-- ============================================================================
-- Admin cadastra imagens, vídeos, PDFs e mensagens de texto pré-prontas em
-- /admin/criativos. Vendedor acessa em /biblioteca ou pelo botão dentro do
-- card do CRM (fases prospecção e contato). Ao usar, o sistema abre WhatsApp
-- com mensagem pronta + link do arquivo hospedado.
--
-- Bucket `criativos-vendas` público (URLs diretas no WA — cliente clica e vê).
-- Criar manualmente no Dashboard > Storage.
--
-- Aplicar via Supabase Dashboard > SQL Editor.
-- ============================================================================

BEGIN;

-- ─── Enum de tipo do criativo ───────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'criativo_tipo') THEN
    CREATE TYPE public.criativo_tipo AS ENUM ('imagem', 'video', 'pdf', 'texto');
  END IF;
END $$;

-- ─── Tabela ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.criativos_vendas (
  id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tipo                        public.criativo_tipo NOT NULL,
  titulo                      text NOT NULL,
  descricao                   text,
  categoria                   text,               -- livre: "prospeccao", "case", "depoimento"
  arquivo_url                 text,               -- path no bucket criativos-vendas (imagem/video/pdf)
  texto                       text,               -- conteúdo (só tipo='texto')
  mensagem_whatsapp_template  text,               -- mensagem pré-pronta pro wa.me — usa {cliente_nome} e {link}
  ativo                       boolean NOT NULL DEFAULT true,
  criado_por                  uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  criado_em                   timestamptz NOT NULL DEFAULT now(),
  atualizado_em               timestamptz NOT NULL DEFAULT now(),

  -- Se tipo='texto', arquivo_url deve ser null e texto obrigatório.
  -- Se tipo != 'texto', arquivo_url obrigatório.
  CONSTRAINT criativos_tipo_conteudo CHECK (
    (tipo = 'texto' AND texto IS NOT NULL AND arquivo_url IS NULL)
    OR (tipo != 'texto' AND arquivo_url IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_criativos_ativo_tipo
  ON public.criativos_vendas(ativo, tipo) WHERE ativo = true;
CREATE INDEX IF NOT EXISTS idx_criativos_categoria
  ON public.criativos_vendas(categoria) WHERE categoria IS NOT NULL AND ativo = true;

-- Trigger updated_at
CREATE OR REPLACE FUNCTION public.criativos_vendas_touch()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.atualizado_em = now();
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_criativos_vendas_touch ON public.criativos_vendas;
CREATE TRIGGER trg_criativos_vendas_touch
  BEFORE UPDATE ON public.criativos_vendas
  FOR EACH ROW EXECUTE FUNCTION public.criativos_vendas_touch();

-- ─── RLS ───────────────────────────────────────────────────────────────────
ALTER TABLE public.criativos_vendas ENABLE ROW LEVEL SECURITY;

-- Leitura: qualquer usuário autenticado (vendedor, campo, consultor, admin)
CREATE POLICY "criativos_auth_read" ON public.criativos_vendas
  FOR SELECT USING (auth.uid() IS NOT NULL AND ativo = true);

-- Escrita: só admin
CREATE POLICY "criativos_admin_all" ON public.criativos_vendas
  FOR ALL USING (public.is_admin());

COMMENT ON TABLE public.criativos_vendas IS
  'Biblioteca de criativos (imagem, vídeo, PDF, texto) que o vendedor de '
  'serviços usa pra abordar clientes. Admin cadastra em /admin/criativos, '
  'vendedor consome em /biblioteca ou botão dentro do card CRM.';

COMMENT ON COLUMN public.criativos_vendas.mensagem_whatsapp_template IS
  'Template pronto pro WhatsApp. Substitutos disponíveis: {cliente_nome} '
  '(primeiro nome do cliente ou "cliente"), {link} (URL pública do arquivo).';

COMMIT;

-- ============================================================================
-- BUCKET STORAGE (criar manualmente no Dashboard depois)
-- ============================================================================
--   Storage > New bucket:
--     Nome: criativos-vendas
--     Public bucket: SIM (arquivos ficam acessíveis via URL direta,
--                        necessário pra funcionar no WhatsApp)
--
--   Policies (SQL Editor, depois de criar o bucket):
--     CREATE POLICY "criativos_bucket_read"
--       ON storage.objects FOR SELECT
--       USING (bucket_id = 'criativos-vendas');
--
--     CREATE POLICY "criativos_bucket_admin_insert"
--       ON storage.objects FOR INSERT
--       WITH CHECK (bucket_id = 'criativos-vendas' AND public.is_admin());
--
--     CREATE POLICY "criativos_bucket_admin_delete"
--       ON storage.objects FOR DELETE
--       USING (bucket_id = 'criativos-vendas' AND public.is_admin());
-- ============================================================================
