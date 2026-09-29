-- Kalebe 2026-09-29: grupos internos por setor, no portal (o WhatsApp não
-- libera grupo pela API pra número que também roda no app Business).
-- Admin participa de todos; a Bianca administra e repassa por eles as
-- campanhas, mensagens internas e avisos.

-- 1) Grupos
CREATE TABLE IF NOT EXISTS public.grupos_internos (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  chave       text NOT NULL UNIQUE,
  nome        text NOT NULL,
  emoji       text NOT NULL DEFAULT '👥',
  descricao   text,
  ordem       int  NOT NULL DEFAULT 100,
  ativo       boolean NOT NULL DEFAULT true,
  criado_em   timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.grupos_internos (chave, nome, emoji, descricao, ordem) VALUES
  ('comercial', 'Comercial', '💼', 'Representantes e consultores: campanhas, leads e metas.', 1),
  ('projetos_homologacao', 'Projetos e homologação', '📐', 'Engenharia, diagramas, CELESC e documentação.', 2),
  ('instalacao_campo', 'Instalação e campo', '🔧', 'Agenda de obras, materiais e ordens de serviço.', 3),
  ('administrativo_financeiro', 'Administrativo e financeiro', '📊', 'Compras, pagamentos, notas e contratos.', 4)
ON CONFLICT (chave) DO NOTHING;

-- 2) Membros (admin enxerga todos os grupos mesmo sem linha aqui)
CREATE TABLE IF NOT EXISTS public.grupos_membros (
  grupo_id      uuid NOT NULL REFERENCES public.grupos_internos(id) ON DELETE CASCADE,
  usuario_id    uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  adicionado_em timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (grupo_id, usuario_id)
);

-- Semente: admins ativos em todos; representantes/vendedores no Comercial;
-- equipe de campo em Instalação e campo (role é enum — compara como texto)
INSERT INTO public.grupos_membros (grupo_id, usuario_id)
SELECT g.id, p.id FROM public.grupos_internos g CROSS JOIN public.profiles p
WHERE p.ativo AND p.role::text = 'admin'
ON CONFLICT DO NOTHING;

INSERT INTO public.grupos_membros (grupo_id, usuario_id)
SELECT g.id, p.id FROM public.grupos_internos g JOIN public.profiles p
  ON (g.chave = 'comercial' AND p.role::text IN ('representante', 'vendedor_servicos'))
  OR (g.chave = 'instalacao_campo' AND p.role::text IN ('profissional_campo', 'instalador'))
WHERE p.ativo
ON CONFLICT DO NOTHING;

-- 3) Mensagens (autor humano OU agente — a Bianca posta com service role)
CREATE TABLE IF NOT EXISTS public.grupos_mensagens (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  grupo_id          uuid NOT NULL REFERENCES public.grupos_internos(id) ON DELETE CASCADE,
  autor_usuario_id  uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  autor_agente      text,                  -- 'bianca' | 'lais' | …
  tipo              text NOT NULL DEFAULT 'mensagem' CHECK (tipo IN ('mensagem', 'aviso', 'campanha')),
  texto             text NOT NULL,
  link              text,                  -- ex.: /projetos/… ou /admin/campanhas
  criado_em         timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_grupos_mensagens_grupo ON public.grupos_mensagens(grupo_id, criado_em DESC);

-- 4) Até onde cada um leu (contador de não lidas)
CREATE TABLE IF NOT EXISTS public.grupos_leituras (
  grupo_id    uuid NOT NULL REFERENCES public.grupos_internos(id) ON DELETE CASCADE,
  usuario_id  uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  lido_ate    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (grupo_id, usuario_id)
);

-- 5) RLS: membro (ou admin) lê o grupo e as mensagens e posta como ele mesmo
CREATE OR REPLACE FUNCTION public.membro_do_grupo(p_grupo uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.is_admin() OR EXISTS (
    SELECT 1 FROM public.grupos_membros m WHERE m.grupo_id = p_grupo AND m.usuario_id = auth.uid()
  )
$$;

ALTER TABLE public.grupos_internos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "grupos_le" ON public.grupos_internos;
CREATE POLICY "grupos_le" ON public.grupos_internos FOR SELECT USING (public.membro_do_grupo(id));
DROP POLICY IF EXISTS "grupos_admin" ON public.grupos_internos;
CREATE POLICY "grupos_admin" ON public.grupos_internos FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

ALTER TABLE public.grupos_membros ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "membros_le" ON public.grupos_membros;
CREATE POLICY "membros_le" ON public.grupos_membros FOR SELECT USING (public.membro_do_grupo(grupo_id));
DROP POLICY IF EXISTS "membros_admin" ON public.grupos_membros;
CREATE POLICY "membros_admin" ON public.grupos_membros FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

ALTER TABLE public.grupos_mensagens ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "gmsg_le" ON public.grupos_mensagens;
CREATE POLICY "gmsg_le" ON public.grupos_mensagens FOR SELECT USING (public.membro_do_grupo(grupo_id));
DROP POLICY IF EXISTS "gmsg_posta" ON public.grupos_mensagens;
CREATE POLICY "gmsg_posta" ON public.grupos_mensagens FOR INSERT
  WITH CHECK (public.membro_do_grupo(grupo_id) AND autor_usuario_id = auth.uid() AND autor_agente IS NULL);

ALTER TABLE public.grupos_leituras ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "gleit_proprio" ON public.grupos_leituras;
CREATE POLICY "gleit_proprio" ON public.grupos_leituras FOR ALL
  USING (usuario_id = auth.uid()) WITH CHECK (usuario_id = auth.uid());

-- Realtime pra conversa atualizar sozinha
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.grupos_mensagens;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Conferência
SELECT g.emoji, g.nome, count(m.usuario_id) AS membros
FROM public.grupos_internos g LEFT JOIN public.grupos_membros m ON m.grupo_id = g.id
GROUP BY g.id, g.emoji, g.nome, g.ordem ORDER BY g.ordem;
