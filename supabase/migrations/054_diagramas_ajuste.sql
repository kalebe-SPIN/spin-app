-- Migration 054: campos pra refinamento de diagramas
--
-- Kalebe pediu botoes '✏️ Refinar' e '🔄 Regenerar' em cada versao.
-- Refinar = nova versao com feedback textual pro Claude aplicar.
-- Regenerar = nova versao sem ajuste (util pra erros transitorios).

ALTER TABLE public.projetos_diagramas
  ADD COLUMN IF NOT EXISTS instrucao_ajuste text,
  ADD COLUMN IF NOT EXISTS baseado_em_id uuid REFERENCES public.projetos_diagramas(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.projetos_diagramas.instrucao_ajuste IS
'Feedback textual do consultor pro Claude aplicar (ex: "aumentar espaco entre inversor e modulos"). NULL = gerado do zero.';

COMMENT ON COLUMN public.projetos_diagramas.baseado_em_id IS
'ID da versao anterior que serviu de base pro refinamento. NULL = gerado do zero.';

CREATE INDEX IF NOT EXISTS idx_diagramas_baseado_em
  ON public.projetos_diagramas(baseado_em_id)
  WHERE baseado_em_id IS NOT NULL;
