-- =================================================================
-- Migration 001 — Schema inicial do spin-app
-- Tabelas: profiles, representantes, audit_log
-- Aplicar via Supabase Dashboard > SQL Editor (uma vez)
-- =================================================================

-- ===== 1. ENUM de papéis =====
CREATE TYPE user_role AS ENUM (
  'admin',          -- Kalebe e equipe Spin (acesso total)
  'representante',  -- vendedor credenciado (perfil público)
  'instalador',     -- equipe técnica (perfil público opcional)
  'colaborador'     -- suporte interno (sem perfil público)
);

-- ===== 2. PROFILES — extensão de auth.users =====
-- Sempre que cria usuário em auth.users, um trigger cria profile vazio
CREATE TABLE public.profiles (
  id              uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  nome_completo   text NOT NULL DEFAULT '',
  telefone        text,
  role            user_role NOT NULL DEFAULT 'colaborador',
  avatar_url      text,
  ativo           boolean NOT NULL DEFAULT true,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_profiles_role ON public.profiles(role);

-- Trigger: criar profile automaticamente quando user é criado em auth.users
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.profiles (id, nome_completo)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'nome_completo', ''));
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ===== 3. REPRESENTANTES — perfil público =====
-- Estende profiles com campos visíveis no menu.spinsolar.com.br
CREATE TABLE public.representantes (
  id                uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  nome_publico      text NOT NULL,
  bio_curta         text,                -- até 200 chars, mostrado no card
  foto_url          text,                -- Supabase Storage
  telefone_whatsapp text NOT NULL,       -- formato +5548999999999
  email_publico     text,                -- opcional, separado do email de login
  cidades_atendidas text[] NOT NULL DEFAULT '{}',
  estado            text NOT NULL DEFAULT 'SC',
  especialidade     text,                -- residencial/comercial/rural/híbrido
  anos_experiencia  int,
  instagram         text,
  visivel_na_vitrine boolean NOT NULL DEFAULT true,
  ordem_exibicao    int NOT NULL DEFAULT 100,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_representantes_estado ON public.representantes(estado);
CREATE INDEX idx_representantes_visivel ON public.representantes(visivel_na_vitrine) WHERE visivel_na_vitrine = true;

-- ===== 4. AUDIT LOG — quem fez o quê e quando =====
CREATE TABLE public.audit_log (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  usuario_id    uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  acao          text NOT NULL,           -- 'INSERT', 'UPDATE', 'DELETE'
  tabela        text NOT NULL,
  registro_id   uuid,
  dados_antes   jsonb,
  dados_depois  jsonb,
  ip            text,
  user_agent    text,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_audit_log_created ON public.audit_log(created_at DESC);
CREATE INDEX idx_audit_log_usuario ON public.audit_log(usuario_id);

-- =================================================================
-- ROW LEVEL SECURITY (RLS)
-- =================================================================

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.representantes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;

-- profiles: usuário lê só o próprio + admin lê todos
CREATE POLICY "Usuário lê próprio perfil"
  ON public.profiles FOR SELECT
  USING (auth.uid() = id);

CREATE POLICY "Admin lê todos os perfis"
  ON public.profiles FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role = 'admin'
  ));

CREATE POLICY "Usuário atualiza próprio perfil"
  ON public.profiles FOR UPDATE
  USING (auth.uid() = id);

CREATE POLICY "Admin atualiza qualquer perfil"
  ON public.profiles FOR UPDATE
  USING (EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role = 'admin'
  ));

-- representantes: leitura pública dos visíveis (pra vitrine)
CREATE POLICY "Leitura pública de representantes visíveis"
  ON public.representantes FOR SELECT
  USING (visivel_na_vitrine = true);

CREATE POLICY "Representante atualiza próprio cadastro"
  ON public.representantes FOR UPDATE
  USING (auth.uid() = id);

CREATE POLICY "Admin gerencia representantes"
  ON public.representantes FOR ALL
  USING (EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role = 'admin'
  ));

-- audit_log: só admin lê
CREATE POLICY "Admin lê audit log"
  ON public.audit_log FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role = 'admin'
  ));

-- =================================================================
-- TRIGGER: updated_at automático em todas tabelas
-- =================================================================
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER representantes_updated_at
  BEFORE UPDATE ON public.representantes
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
