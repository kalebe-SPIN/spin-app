-- Migration 045: novas categorias pro catalogo hibrido WEG
-- Kalebe apontou que faltam categorias pra:
--   - Controlador (EMBOX de paralelismo)
--   - Multimedidor (MMW03-M22CH — detector de queda pra transicao EPS)
--   - Caixa de juncao (JBW 41DC 50A W0 — junta multiplas baterias por MPPT)
--
-- Postgres nao permite alterar enum dentro de transacao — cada ADD VALUE isolado.

ALTER TYPE categoria_principal ADD VALUE IF NOT EXISTS 'controlador';
ALTER TYPE categoria_principal ADD VALUE IF NOT EXISTS 'multimedidor';
ALTER TYPE categoria_principal ADD VALUE IF NOT EXISTS 'caixa_juncao';
