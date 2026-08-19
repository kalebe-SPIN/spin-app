-- ============================================================================
-- Migration 076 — Handoff Portal → Menu + propostas geradas no catálogo
-- ============================================================================
-- CONTEXTO
-- O catálogo público (menu.spinsolar.com.br) volta a gerar proposta em PDF,
-- mas SÓ para quem tem acesso ao portal. Como o menu é um site estático
-- (HTML/JS vanilla, outro domínio, outro deploy), ele não tem sessão Supabase.
--
-- FLUXO
--   1. Consultor logado no portal clica "Catálogo Spin" (/api/menu/abrir)
--   2. Portal gera um token opaco, grava só o HASH aqui, e redireciona pra
--      https://menu.spinsolar.com.br/on-grid/?ms=<token>
--   3. Menu troca o token por identidade em POST /api/menu/sessao
--   4. Ao emitir a proposta, o menu manda o PDF pra POST /api/menu/proposta,
--      que cria cliente + projeto + anexo em nome do consultor dono do token
--
-- Visitante sem token nunca vê o botão de proposta — só "falar com consultor".
--
-- Aplicar via Supabase Dashboard > SQL Editor.
-- ============================================================================

BEGIN;

-- ═════════════════════════════════════════════════════════════════════════════
-- 1. MENU_SESSOES — tokens de handoff portal → menu
-- ═════════════════════════════════════════════════════════════════════════════
-- Guardamos apenas o SHA-256 do token. Se o banco vazar, os tokens em
-- circulação continuam inúteis. O token cru só existe na URL e no
-- sessionStorage do navegador do consultor.

CREATE TABLE IF NOT EXISTS public.menu_sessoes (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token_hash    text NOT NULL UNIQUE,
  consultor_id  uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,

  criado_em     timestamptz NOT NULL DEFAULT now(),
  expira_em     timestamptz NOT NULL,
  ultimo_uso_em timestamptz,
  usos          int NOT NULL DEFAULT 0,
  revogado      boolean NOT NULL DEFAULT false,

  -- Rastro de origem (auditoria — quem abriu o catálogo de onde)
  user_agent    text,
  ip            text
);

CREATE INDEX IF NOT EXISTS idx_menu_sessoes_hash ON public.menu_sessoes(token_hash);
CREATE INDEX IF NOT EXISTS idx_menu_sessoes_consultor ON public.menu_sessoes(consultor_id);
CREATE INDEX IF NOT EXISTS idx_menu_sessoes_expira ON public.menu_sessoes(expira_em);

ALTER TABLE public.menu_sessoes ENABLE ROW LEVEL SECURITY;

-- Nenhuma policy de INSERT/UPDATE: só a service role (rotas /api/menu/*) escreve.
-- Consultor pode ver as próprias sessões (pra futura tela "revogar acesso").
-- DROP antes de CREATE: CREATE POLICY não aceita IF NOT EXISTS, e esta
-- migration é feita pra ser rodada de novo depois que o bucket existir.
DROP POLICY IF EXISTS "menu_sessoes_dono_read" ON public.menu_sessoes;
CREATE POLICY "menu_sessoes_dono_read" ON public.menu_sessoes
  FOR SELECT USING (consultor_id = auth.uid());

DROP POLICY IF EXISTS "menu_sessoes_admin_all" ON public.menu_sessoes;
CREATE POLICY "menu_sessoes_admin_all" ON public.menu_sessoes
  FOR ALL USING (public.is_admin());

COMMENT ON TABLE public.menu_sessoes IS
  'Tokens de handoff do portal para o catálogo menu.spinsolar.com.br. Guarda hash, nunca o token cru.';

-- ═════════════════════════════════════════════════════════════════════════════
-- 2. PROJETOS.ORIGEM — de onde o projeto nasceu
-- ═════════════════════════════════════════════════════════════════════════════
-- Projeto criado pelo catálogo entra sem workflow técnico (sem fatura, sem
-- telhado, sem UC). A coluna deixa isso explícito no card do CRM, pra o
-- consultor saber que precisa completar os dados antes de homologar.

ALTER TABLE public.projetos
  ADD COLUMN IF NOT EXISTS origem text NOT NULL DEFAULT 'portal';

COMMENT ON COLUMN public.projetos.origem IS
  'portal | menu_catalogo | orcamento_rapido — de onde o projeto nasceu';

CREATE INDEX IF NOT EXISTS idx_projetos_origem ON public.projetos(origem);

-- ═════════════════════════════════════════════════════════════════════════════
-- 3. BUCKET propostas-menu — PDFs emitidos pelo catálogo
-- ═════════════════════════════════════════════════════════════════════════════
-- ⚠️ CRIAR MANUALMENTE ANTES: Dashboard > Storage > New bucket
--    Nome: propostas-menu   ·   MARCAR "Public bucket"
--
-- Público porque a URL é colada na mensagem de WhatsApp pro cliente — o
-- WhatsApp precisa conseguir baixar o arquivo sem autenticação.
-- O upload em si é feito pela service role na rota /api/menu/proposta,
-- então as policies abaixo só cobrem acesso direto de usuário logado.

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM storage.buckets WHERE id = 'propostas-menu') THEN
    -- Upload: qualquer autenticado do portal
    IF NOT EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname = 'storage' AND tablename = 'objects'
        AND policyname = 'propostas_menu_auth_upload'
    ) THEN
      CREATE POLICY "propostas_menu_auth_upload"
        ON storage.objects FOR INSERT
        WITH CHECK (bucket_id = 'propostas-menu' AND auth.role() = 'authenticated');
    END IF;

    -- Delete: só admin
    IF NOT EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname = 'storage' AND tablename = 'objects'
        AND policyname = 'propostas_menu_admin_delete'
    ) THEN
      CREATE POLICY "propostas_menu_admin_delete"
        ON storage.objects FOR DELETE
        USING (bucket_id = 'propostas-menu' AND public.is_admin());
    END IF;
  ELSE
    RAISE NOTICE 'Bucket propostas-menu não existe ainda — crie no Dashboard e rode esta migration de novo pra aplicar as policies.';
  END IF;
END $$;

COMMIT;
