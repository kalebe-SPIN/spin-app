-- ============================================================================
-- Migration 066 — Tabela `telhados` (CRM de prospecção do vendedor de serviços)
-- ============================================================================
-- Depende de 057 (role vendedor_servicos + is_vendedor_servicos), 063
-- (role profissional_campo + eh_par_agenda por zona).
--
-- Cada linha é um TELHADO prospectado pelo vendedor de serviços — ponto no
-- mapa satélite (lat/lng) com endereço reverso, foto, quantidade estimada de
-- placas e dados do cliente. Move pelas 4 fases do Kanban (Prospecção →
-- Contato → Proposta → Fechado; Perdido = tag lateral).
--
-- ─── ATENÇÃO — BUCKET DE STORAGE ────────────────────────────────────────────
-- A foto do telhado vive em Supabase Storage no bucket `telhados-fotos`.
-- Criar manualmente no Dashboard antes de usar:
--   Storage > New bucket > name: telhados-fotos > public: false
-- Policies do bucket (SQL Editor):
--   CREATE POLICY "telhados_fotos_owner_read" ON storage.objects
--     FOR SELECT USING (bucket_id = 'telhados-fotos' AND auth.role() = 'authenticated');
--   CREATE POLICY "telhados_fotos_owner_write" ON storage.objects
--     FOR INSERT WITH CHECK (bucket_id = 'telhados-fotos' AND auth.role() = 'authenticated');
--
-- Aplicar via Supabase Dashboard > SQL Editor.
-- ============================================================================

BEGIN;

-- ─── 1. Enum de fase do Kanban ──────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'telhado_fase') THEN
    CREATE TYPE public.telhado_fase AS ENUM (
      'prospeccao',   -- avistou, cadastrou; sem contato
      'contato',      -- já ligou/mandou WhatsApp
      'proposta',     -- enviou orçamento formal
      'fechado',      -- virou cliente/projeto
      'perdido'       -- recusou/sumiu — tag lateral, não coluna
    );
  END IF;
END $$;

-- ─── 2. Tabela ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.telhados (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Dono / vendedor prospectador
  vendedor_id            uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,

  -- Fase no Kanban
  fase                   public.telhado_fase NOT NULL DEFAULT 'prospeccao',

  -- Localização
  latitude               numeric(10, 7) NOT NULL,
  longitude              numeric(10, 7) NOT NULL,
  endereco               text NOT NULL,   -- rua + número reverso-geocodado
  bairro                 text,
  cidade                 text,
  uf                     text,
  cep                    text,

  -- Dados do imóvel/sistema
  qtd_placas_estimada    int CHECK (qtd_placas_estimada IS NULL OR qtd_placas_estimada > 0),
  potencia_kwp_estimada  numeric(6, 2),   -- qtd_placas × ~0.55 kWp; calculado quando cadastra
  foto_url               text NOT NULL,   -- Supabase Storage — foto do telhado (obrigatória)
  foto_satelite_url      text,            -- screenshot opcional do satélite (contexto)

  -- Dados do cliente (opcionais no primeiro contato)
  cliente_nome           text,
  cliente_telefone       text,
  cliente_email          text,

  -- Notas do vendedor
  observacoes            text,

  -- Quando virou projeto formal (Fase = fechado)
  projeto_id             uuid REFERENCES public.projetos(id) ON DELETE SET NULL,

  -- Auditoria
  ultima_interacao_em    timestamptz,     -- última vez que o vendedor tocou o card
  criado_em              timestamptz NOT NULL DEFAULT now(),
  atualizado_em          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_telhados_vendedor_fase ON public.telhados(vendedor_id, fase);
CREATE INDEX IF NOT EXISTS idx_telhados_cidade ON public.telhados(cidade) WHERE cidade IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_telhados_criado ON public.telhados(criado_em DESC);

-- Trigger updated_at
CREATE OR REPLACE FUNCTION public.telhados_touch_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.atualizado_em = now();
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_telhados_touch ON public.telhados;
CREATE TRIGGER trg_telhados_touch
  BEFORE UPDATE ON public.telhados
  FOR EACH ROW EXECUTE FUNCTION public.telhados_touch_updated_at();

-- ─── 3. RLS ─────────────────────────────────────────────────────────────────
ALTER TABLE public.telhados ENABLE ROW LEVEL SECURITY;

-- Vendedor vê os PRÓPRIOS telhados; admin vê todos.
-- Profissional de campo da MESMA zona também vê (a execução em campo
-- naturalmente precisa saber o que o vendedor prospectou).
CREATE POLICY "telhados_vendedor_select" ON public.telhados
  FOR SELECT USING (
    vendedor_id = auth.uid()
    OR public.is_admin()
    OR EXISTS (
      SELECT 1
      FROM public.profiles me
      JOIN public.profiles vendedor ON vendedor.id = telhados.vendedor_id
      WHERE me.id = auth.uid()
        AND me.role = 'profissional_campo'::public.user_role
        AND vendedor.role = 'vendedor_servicos'::public.user_role
        AND me.zona IS NOT NULL
        AND me.zona = vendedor.zona
    )
  );

-- Escrita: só o próprio vendedor (dono) ou admin.
CREATE POLICY "telhados_vendedor_insert" ON public.telhados
  FOR INSERT WITH CHECK (
    vendedor_id = auth.uid() OR public.is_admin()
  );

CREATE POLICY "telhados_vendedor_update" ON public.telhados
  FOR UPDATE USING (vendedor_id = auth.uid() OR public.is_admin())
             WITH CHECK (vendedor_id = auth.uid() OR public.is_admin());

CREATE POLICY "telhados_vendedor_delete" ON public.telhados
  FOR DELETE USING (vendedor_id = auth.uid() OR public.is_admin());

COMMENT ON TABLE public.telhados IS
  'CRM de prospecção do vendedor de serviços. Cada linha = um telhado avistado '
  '(pin no mapa satélite) com foto, cliente e fase do Kanban. Fase fechado '
  'vira projeto (FK projeto_id).';

COMMIT;
