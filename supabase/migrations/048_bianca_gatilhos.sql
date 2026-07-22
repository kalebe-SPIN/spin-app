-- Migration 048: Bianca proativa — sistema de gatilhos por evento
--
-- Quando algo acontece no sistema (proposta aceita, cliente respondeu WhatsApp,
-- homologacao aprovada, etc), a Bianca dispara automaticamente:
--   * mensagens pro cliente (SEMPRE 'sugerida' — consultor confirma)
--   * tarefas pro consultor (podem ser automaticas)
--   * notificacoes pro admin (podem ser automaticas)
--
-- Kalebe escolheu:
--   1. Modo hibrido: alguns automaticos, outros sugeridos
--   2. Templates com variaveis + Bianca refina com IA quando marcado
--   3. Escopo amplo — nao so os 3 primeiros, mas MUITO mais eventos

-- ============================================================================
-- 1. TABELA de configuracao dos gatilhos
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.bianca_gatilhos (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  chave           text NOT NULL UNIQUE,
  nome            text NOT NULL,
  descricao       text,

  -- Publico alvo da acao gerada
  publico_alvo    text NOT NULL CHECK (publico_alvo IN ('cliente', 'consultor', 'admin', 'time_completo')),

  -- Como Bianca deve executar
  modo            text NOT NULL DEFAULT 'sugerido' CHECK (modo IN ('automatico', 'sugerido', 'desligado')),
  canal           text NOT NULL DEFAULT 'whatsapp' CHECK (canal IN ('whatsapp', 'email', 'tarefa_agenda', 'chat_bianca')),

  -- Template + refinamento
  template_base   text NOT NULL,        -- ex: 'Ola {cliente_nome}! Sua proposta {codigo} foi aprovada. {rt_nome} entra em contato pra proximos passos.'
  refinar_com_ia  boolean NOT NULL DEFAULT false,  -- se true, Claude refina o texto
  contexto_ia     text,                 -- instrucao adicional pra Claude ('tom animado', 'tecnico', etc)

  ativo           boolean NOT NULL DEFAULT true,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.bianca_gatilhos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "bianca_gatilhos_read_all" ON public.bianca_gatilhos;
CREATE POLICY "bianca_gatilhos_read_all" ON public.bianca_gatilhos
  FOR SELECT USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "bianca_gatilhos_admin_all" ON public.bianca_gatilhos;
CREATE POLICY "bianca_gatilhos_admin_all" ON public.bianca_gatilhos
  FOR ALL USING (public.is_admin());

-- ============================================================================
-- 2. TABELA de log/historico dos eventos disparados
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.bianca_eventos_disparados (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  gatilho_chave   text NOT NULL,

  -- Contexto do evento
  projeto_id      uuid REFERENCES public.projetos(id) ON DELETE SET NULL,
  cliente_id      uuid,                 -- referencia clientes se aplicavel
  usuario_id      uuid REFERENCES auth.users(id),  -- consultor responsavel
  entidade_tipo   text,                 -- 'projeto' | 'homologacao' | 'proposta' | 'comunicacao_wa'
  entidade_id     uuid,
  dados_evento    jsonb NOT NULL DEFAULT '{}',    -- payload especifico

  -- Mensagem processada
  mensagem_gerada text,
  refinada_por_ia boolean NOT NULL DEFAULT false,

  -- Status e vinculos
  status          text NOT NULL DEFAULT 'processando' CHECK (
    status IN ('processando', 'sugerida', 'enviada_auto', 'descartada', 'falhou')
  ),
  erro            text,
  comunicacao_id  uuid REFERENCES public.bianca_comunicacoes(id) ON DELETE SET NULL,
  tarefa_id       uuid,

  disparado_em    timestamptz NOT NULL DEFAULT now(),
  processado_em   timestamptz
);

CREATE INDEX IF NOT EXISTS idx_bianca_eventos_gatilho ON public.bianca_eventos_disparados(gatilho_chave, disparado_em DESC);
CREATE INDEX IF NOT EXISTS idx_bianca_eventos_projeto ON public.bianca_eventos_disparados(projeto_id, disparado_em DESC);
CREATE INDEX IF NOT EXISTS idx_bianca_eventos_status ON public.bianca_eventos_disparados(status);

ALTER TABLE public.bianca_eventos_disparados ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "bianca_eventos_read_ownerorAdmin" ON public.bianca_eventos_disparados;
CREATE POLICY "bianca_eventos_read_ownerorAdmin" ON public.bianca_eventos_disparados
  FOR SELECT USING (usuario_id = auth.uid() OR public.is_admin());

DROP POLICY IF EXISTS "bianca_eventos_admin_all" ON public.bianca_eventos_disparados;
CREATE POLICY "bianca_eventos_admin_all" ON public.bianca_eventos_disparados
  FOR ALL USING (public.is_admin());

-- ============================================================================
-- 3. SEED dos gatilhos iniciais (Kalebe pode editar em /admin/bianca/gatilhos)
-- ============================================================================

INSERT INTO public.bianca_gatilhos (chave, nome, descricao, publico_alvo, modo, canal, template_base, refinar_com_ia, contexto_ia) VALUES

-- Cliente aceitou proposta
('proposta_aceita',
 'Cliente aceitou proposta',
 'Dispara quando status do projeto muda pra ''aceito'' ou ''vendido''.',
 'cliente', 'sugerido', 'whatsapp',
 'Oi {cliente_nome}! 🎉 Ficamos muito felizes com sua decisao de escolher a Spin Solar pra realizar o projeto {codigo_projeto}. A partir de agora, {rt_nome} conduz os proximos passos: contrato, homologacao CELESC e agenda de instalacao. Qualquer coisa, estamos aqui.',
 true,
 'Tom animado mas profissional. Se voce sabe que ja teve outras interacoes com esse cliente, ajuste pra soar mais pessoal. Nao use "prezado". Chame pelo primeiro nome.'),

-- Cliente aceitou -> tarefa contrato pro consultor
('proposta_aceita_tarefa_contrato',
 'Criar tarefa de contrato ao consultor',
 'Complementar ao gatilho proposta_aceita — cria tarefa urgente pro consultor emitir contrato.',
 'consultor', 'automatico', 'tarefa_agenda',
 'Emitir contrato de compra e venda + procuracao pro cliente {cliente_nome} (projeto {codigo_projeto}). Coletar assinaturas digitais.',
 false,
 NULL),

-- Cliente aceitou -> notifica admin
('proposta_aceita_notif_admin',
 'Notificar admin da nova venda',
 'Cria tarefa no admin/eletrotecnico avisando de nova homologacao a iniciar.',
 'admin', 'automatico', 'tarefa_agenda',
 '🏗️ Nova venda: {cliente_nome} ({codigo_projeto}). Consultor precisa enviar 4 documentos da homologacao (fotos + fatura). Apos, arquivos sao gerados automaticamente.',
 false,
 NULL),

-- Proposta enviada — follow-up 3 dias
('proposta_followup_3d',
 'Follow-up 3 dias sem resposta',
 'Cron diario: identifica propostas enviadas ha 3+ dias sem "aceito"/"recusado". Bianca sugere follow-up ao consultor.',
 'cliente', 'sugerido', 'whatsapp',
 'Oi {cliente_nome}, tudo bem? Enviei a proposta do seu projeto {codigo_projeto} ha alguns dias e queria saber se ficou alguma duvida. Fico a disposicao pra explicar melhor qualquer ponto ou ajustar o que precisar.',
 true,
 'Tom cordial, curto. Se o cliente ja demonstrou interesse antes, seja mais direto. Se e a primeira interacao apos envio, seja mais consultivo.'),

-- Homologacao aprovada CELESC
('homologacao_aprovada',
 'Homologacao aprovada pela CELESC',
 'Dispara quando homologacao muda pra ''aprovada''. Avisa cliente + inicia agendamento de instalacao.',
 'cliente', 'sugerido', 'whatsapp',
 'Otimas noticias {cliente_nome}! 🎉 A CELESC aprovou a homologacao do seu projeto {codigo_projeto}. Ja podemos agendar a instalacao. Qual seria a melhor semana pra voce?',
 true,
 'Tom animado. Reforce que foi um marco importante. Convide pra agendar de forma direta.'),

-- Cliente respondeu WhatsApp
('cliente_respondeu_whatsapp',
 'Cliente respondeu WhatsApp',
 'Webhook detecta resposta cliente. Bianca analisa e sugere resposta ao consultor com base no contexto.',
 'consultor', 'sugerido', 'chat_bianca',
 'Cliente {cliente_nome} respondeu no WhatsApp: "{resposta_cliente}". Sugestao de resposta: {resposta_sugerida}',
 true,
 'Analise a resposta do cliente considerando o contexto do projeto. Sugira uma resposta cordial e util. Se o cliente esta com duvida tecnica, seja preciso. Se e objecao de preco, defenda valor sem soar defensivo.'),

-- Modulo pendente ha 7 dias sem preco
('modulo_pendente_7d',
 'Modulo da proposta sem preco ha 7 dias',
 'Cron diario: cutuca consultor pra precificar itens pendentes ha mais de 7 dias.',
 'consultor', 'automatico', 'tarefa_agenda',
 'Modulo {tipo_item} do projeto {codigo_projeto} ({cliente_nome}) esta sem preco ha 7 dias. Finaliza pra fechar a proposta.',
 false,
 NULL),

-- Instalacao amanha
('instalacao_amanha',
 'Confirmar instalacao amanha',
 'Cron diario as 15h: confirma agenda de instalacao com cliente no dia anterior.',
 'cliente', 'sugerido', 'whatsapp',
 'Oi {cliente_nome}! So passando pra confirmar que amanha ({data_instalacao}) as {hora_instalacao} nossa equipe vai chegar pra fazer a instalacao no {endereco}. Combinado?',
 true,
 'Tom leve e prestativo. Deixe claro que estamos preparados e organizados.')

ON CONFLICT (chave) DO NOTHING;

-- ============================================================================
-- 4. Adiciona coluna gatilho_chave em bianca_comunicacoes (rastreabilidade)
-- ============================================================================
ALTER TABLE public.bianca_comunicacoes
  ADD COLUMN IF NOT EXISTS gatilho_chave text;

CREATE INDEX IF NOT EXISTS idx_bianca_comunicacoes_gatilho
  ON public.bianca_comunicacoes(gatilho_chave)
  WHERE gatilho_chave IS NOT NULL;

COMMENT ON COLUMN public.bianca_comunicacoes.gatilho_chave IS
'Se a comunicacao foi originada por um gatilho reativo, marca a chave dele (ex: proposta_aceita).';
