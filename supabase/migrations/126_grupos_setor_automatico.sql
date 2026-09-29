-- Kalebe 2026-09-29: o setor escolhido no cadastro coloca o usuário no grupo;
-- descadastro (profiles.ativo = false) bloqueia NA HORA em todos os grupos.
-- O contato individual (WhatsApp / inbox) não é tocado e segue ativo.
-- Reativou → volta aos mesmos grupos. Depende da migration 125.

-- 1) Bloqueio guarda o histórico (não apaga a participação)
ALTER TABLE public.grupos_membros ADD COLUMN IF NOT EXISTS bloqueado_em timestamptz;

-- 2) Setores padrão por atuação (sugestão; no cadastro o admin confirma)
CREATE OR REPLACE FUNCTION public.setores_padrao(p_role text)
RETURNS text[] LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE
    WHEN p_role = 'admin' THEN ARRAY['comercial', 'projetos_homologacao', 'instalacao_campo', 'administrativo_financeiro']
    WHEN p_role IN ('representante', 'vendedor_servicos') THEN ARRAY['comercial']
    WHEN p_role IN ('profissional_campo', 'instalador') THEN ARRAY['instalacao_campo']
    ELSE ARRAY[]::text[]
  END
$$;

-- 3) RLS: só usuário ATIVO enxerga grupo (admin ativo vê todos; bloqueado não vê nada)
CREATE OR REPLACE FUNCTION public.admin_ativo()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role::text = 'admin' AND ativo
  )
$$;

CREATE OR REPLACE FUNCTION public.membro_do_grupo(p_grupo uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.admin_ativo() OR EXISTS (
    SELECT 1 FROM public.grupos_membros m
    JOIN public.profiles p ON p.id = m.usuario_id
    WHERE m.grupo_id = p_grupo AND m.usuario_id = auth.uid()
      AND m.bloqueado_em IS NULL AND p.ativo
  )
$$;

DROP POLICY IF EXISTS "grupos_admin" ON public.grupos_internos;
CREATE POLICY "grupos_admin" ON public.grupos_internos FOR ALL
  USING (public.admin_ativo()) WITH CHECK (public.admin_ativo());
DROP POLICY IF EXISTS "membros_admin" ON public.grupos_membros;
CREATE POLICY "membros_admin" ON public.grupos_membros FOR ALL
  USING (public.admin_ativo()) WITH CHECK (public.admin_ativo());

-- 4) Gatilho: desativou → bloqueia; reativou/aprovou → desbloqueia
--    (e, se nunca teve grupo, entra nos setores padrão); mudou atuação →
--    entra nos setores padrão da nova atuação (sem tirar dos atuais)
CREATE OR REPLACE FUNCTION public.sincronizar_grupos_usuario()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.ativo IS DISTINCT FROM OLD.ativo THEN
    IF NOT NEW.ativo THEN
      UPDATE public.grupos_membros SET bloqueado_em = now()
      WHERE usuario_id = NEW.id AND bloqueado_em IS NULL;
      RETURN NEW;
    END IF;

    UPDATE public.grupos_membros SET bloqueado_em = NULL WHERE usuario_id = NEW.id;
    IF NOT EXISTS (SELECT 1 FROM public.grupos_membros WHERE usuario_id = NEW.id) THEN
      INSERT INTO public.grupos_membros (grupo_id, usuario_id)
      SELECT g.id, NEW.id FROM public.grupos_internos g
      WHERE g.chave = ANY (public.setores_padrao(NEW.role::text))
      ON CONFLICT DO NOTHING;
    END IF;

  ELSIF NEW.ativo AND NEW.role IS DISTINCT FROM OLD.role THEN
    INSERT INTO public.grupos_membros (grupo_id, usuario_id)
    SELECT g.id, NEW.id FROM public.grupos_internos g
    WHERE g.chave = ANY (public.setores_padrao(NEW.role::text))
    ON CONFLICT DO NOTHING;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_sincronizar_grupos_usuario ON public.profiles;
CREATE TRIGGER trg_sincronizar_grupos_usuario
  AFTER UPDATE OF ativo, role ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.sincronizar_grupos_usuario();

-- 5) Quem já está desativado hoje fica bloqueado desde já
UPDATE public.grupos_membros m SET bloqueado_em = now()
FROM public.profiles p
WHERE p.id = m.usuario_id AND NOT p.ativo AND m.bloqueado_em IS NULL;

-- Conferência
SELECT g.emoji, g.nome,
  count(m.usuario_id) FILTER (WHERE m.bloqueado_em IS NULL)     AS ativos,
  count(m.usuario_id) FILTER (WHERE m.bloqueado_em IS NOT NULL) AS bloqueados
FROM public.grupos_internos g
LEFT JOIN public.grupos_membros m ON m.grupo_id = g.id
GROUP BY g.id, g.emoji, g.nome, g.ordem
ORDER BY g.ordem;
