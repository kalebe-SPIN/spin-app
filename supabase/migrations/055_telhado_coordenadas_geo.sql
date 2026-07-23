-- Migration 055: coordenadas geograficas nas seções do telhado
--
-- Kalebe pediu integracao com Google Maps pra desenhar telhado.
-- Cada polígono desenhado vira uma linha em projetos_telhado_secoes
-- com as coordenadas GPS salvas em JSONB pra permitir refazer o mapa.

ALTER TABLE public.projetos_telhado_secoes
  ADD COLUMN IF NOT EXISTS coordenadas_geo jsonb,
  ADD COLUMN IF NOT EXISTS azimute_graus numeric(5,2);

COMMENT ON COLUMN public.projetos_telhado_secoes.coordenadas_geo IS
'Array de {lat,lng} do polígono desenhado no mapa. Permite reconstruir o layout.';

COMMENT ON COLUMN public.projetos_telhado_secoes.azimute_graus IS
'Azimute médio da água em graus (0=N, 90=E, 180=S, 270=O).';
