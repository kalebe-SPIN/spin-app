-- ============================================================================
-- Migration 033: Modo prévia nos diagramas
-- ============================================================================
-- Antes: só gerava diagrama oficial (após cliente aceitar proposta).
-- Agora: consultor pode gerar prévia pra visualizar antes de mandar pro cliente.
--
-- Prévias ficam marcadas com eh_previa=true e podem ser regeradas quantas
-- vezes forem necessárias. Só a versão OFICIAL (eh_previa=false) vira ART.
-- ============================================================================

ALTER TABLE public.projetos_diagramas
  ADD COLUMN IF NOT EXISTS eh_previa boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.projetos_diagramas.eh_previa IS
  'true = rascunho gerado antes do cliente aceitar (só admin), false = diagrama oficial pós-aceite';

CREATE INDEX IF NOT EXISTS idx_diagramas_eh_previa
  ON public.projetos_diagramas(projeto_id, eh_previa, versao DESC);
