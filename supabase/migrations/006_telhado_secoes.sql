-- =================================================================
-- Migration 006 — Seções de telhado (suporte a múltiplas faces)
-- Aplicar via Supabase Dashboard > SQL Editor
-- =================================================================

CREATE TABLE public.projetos_telhado_secoes (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  projeto_id      uuid NOT NULL REFERENCES public.projetos(id) ON DELETE CASCADE,

  ordem           int NOT NULL,
  identificador   text,                        -- "Galpão fundos", "Casa principal"

  tipo_cobertura  text NOT NULL,               -- fibrocimento | ceramica_colonial | ceramica_francesa | metalico_trapezoidal | metalico_onda | laje_impermeabilizada | solo | carport
  idade_anos      int,
  area_m2         numeric(8,2) NOT NULL,
  orientacao      text NOT NULL,               -- N | NE | NO | L | O | SE | SO | S | horizontal
  inclinacao_graus numeric(4,1),

  tem_sombreamento boolean DEFAULT false,
  sombreamento_descricao text,
  sombreamento_horario text,
  sombreamento_severidade text,                -- leve | moderada | pesada

  material_estrutura text,                     -- madeira | metalica | concreto
  altura_telhado_m numeric(5,2),
  observacoes     text,

  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_telhado_secoes_projeto ON public.projetos_telhado_secoes(projeto_id);

ALTER TABLE public.projetos_telhado_secoes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "telhado_secoes_read" ON public.projetos_telhado_secoes
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.projetos
            WHERE id = projeto_id AND (consultor_id = auth.uid() OR public.is_admin()))
  );

CREATE POLICY "telhado_secoes_write" ON public.projetos_telhado_secoes
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.projetos
            WHERE id = projeto_id AND (consultor_id = auth.uid() OR public.is_admin()))
  );

CREATE TRIGGER telhado_secoes_updated_at
  BEFORE UPDATE ON public.projetos_telhado_secoes
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
