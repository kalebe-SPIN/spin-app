-- ============================================================================
-- Migration 065 — Gatilhos Bianca: agenda cruzada vendedor↔campo
-- ============================================================================
-- Depende de 048 (bianca_gatilhos), 063 (role profissional_campo), 064 (RLS
-- cruzado da agenda + coluna criado_por_usuario_id).
--
-- Dois novos gatilhos:
--   • agenda_agendamento_por_par — quando um par cria/edita algo na agenda
--     do outro, notifica o dono pelo chat da Bianca.
--   • agenda_servico_executado   — quando profissional_campo marca serviço
--     como realizado, notifica o vendedor pareado.
--
-- Aplicar via Supabase Dashboard > SQL Editor.
-- ============================================================================

BEGIN;

INSERT INTO public.bianca_gatilhos
  (chave, nome, descricao, publico_alvo, modo, canal, template_base, refinar_com_ia, contexto_ia)
VALUES

-- Par agendou algo na agenda do dono
('agenda_agendamento_por_par',
 'Par agendou algo na sua agenda',
 'Dispara quando um par (vendedor↔profissional_campo da mesma zona) cria ou '
   'edita um evento/tarefa na agenda de alguém. Notifica o dono no chat da '
   'Bianca com opção de confirmar/rejeitar.',
 'consultor', 'automatico', 'chat_bianca',
 '📅 {criador_nome} agendou "{titulo_evento}" na sua agenda em {data_hora}. '
 'Passa em /agenda pra confirmar ou reagendar se precisar.',
 false,
 NULL),

-- Profissional de campo executou serviço → avisa vendedor pareado
('agenda_servico_executado',
 'Serviço executado pelo campo',
 'Dispara quando um evento de agenda muda pra status ''realizado'' e o dono '
   'é profissional_campo. Avisa o(s) vendedor(es) da mesma zona pra tocar '
   'pós-venda / follow-up com cliente.',
 'consultor', 'automatico', 'chat_bianca',
 '✅ {criador_nome} concluiu o serviço "{titulo_evento}" em {data_hora}'
 '{cliente_bloco}. Bom momento pra tocar pós-venda com o cliente.',
 false,
 NULL)

ON CONFLICT (chave) DO NOTHING;

COMMIT;
