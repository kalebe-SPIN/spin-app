-- ============================================================================
-- Migration 075 — Habilita Realtime nas tabelas do painel de equipe admin
-- ============================================================================
-- Dashboard admin tem painel "Equipe comercial em tempo real" que assiste
-- mudanças em: novos projetos, novos telhados prospectados, execuções
-- concluídas. Ao inserir/atualizar linha nessas tabelas, o Supabase
-- Realtime dispara evento WebSocket pro cliente, que refaz a query
-- agregada.
--
-- Só admin escuta (RLS já bloqueia leitura pra outros roles, mas o
-- Realtime também respeita RLS — outros usuários não recebem eventos
-- de linhas que não podem ler).
--
-- Aplicar via Supabase Dashboard > SQL Editor.
-- ============================================================================

BEGIN;

-- Idempotente — se já está publicado, não faz nada.
ALTER PUBLICATION supabase_realtime ADD TABLE public.projetos;
ALTER PUBLICATION supabase_realtime ADD TABLE public.telhados;
ALTER PUBLICATION supabase_realtime ADD TABLE public.execucoes_servicos;

COMMIT;

-- ============================================================================
-- COMO REVERTER (se precisar desabilitar Realtime numa tabela)
-- ============================================================================
--   ALTER PUBLICATION supabase_realtime DROP TABLE public.<tabela>;
-- ============================================================================
