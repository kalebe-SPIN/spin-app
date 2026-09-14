-- Migration 109: agentes IA configuráveis + broadcasts pros representantes
--
-- Kalebe 2026-09-14: substituindo TROIA. Cada agente IA tem uma finalidade
-- (qualificação, agendamento, pós-venda, etc.) com prompt editável no admin.
-- Ao qualificar um lead, sistema faz broadcast pros representantes, que
-- entram em fila FIFO por ordem de aceite. Prazo 8min + aviso aos 6min.
-- Ver memória: fluxo-lead-whatsapp-spin.

-- ============================================================================
-- wa_agentes — persona de cada agente IA
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.wa_agentes (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Identidade que aparece pro cliente
  chave                 text NOT NULL UNIQUE,   -- 'qualificacao', 'agendamento', ...
  nome                  text NOT NULL,           -- 'Assistente Spin', 'Ana da Agenda', ...
  foto_url              text,                    -- avatar mostrado no /inbox (dark)
  descricao_interna     text,                    -- pra Kalebe lembrar pra que serve

  -- Configuração da IA
  system_prompt         text NOT NULL,
  modelo                text NOT NULL DEFAULT 'claude-haiku-4-5-20251001',
  max_tokens            int  NOT NULL DEFAULT 800 CHECK (max_tokens BETWEEN 100 AND 4000),
  temperatura           numeric(3,2),

  -- Quando este agente entra em ação
  --   'primeira_msg_lead'    → cliente novo mandou 1ª msg
  --   'apos_qualificacao'    → depois que qualificação virou projeto (Kalebe usará pra agendamento)
  --   'pos_venda'            → cliente com projeto vendido volta a mandar msg
  --   'manual'               → só entra quando alguém escolhe manualmente
  --   'handoff'              → agente anterior passou pro próximo
  condicao_ativacao     text NOT NULL DEFAULT 'manual' CHECK (condicao_ativacao IN (
    'primeira_msg_lead','apos_qualificacao','pos_venda','manual','handoff'
  )),
  ordem_prioridade      int  NOT NULL DEFAULT 100,   -- menor entra antes se múltiplos ativarem

  -- Regras de saída (o que faz quando termina a tarefa)
  --   'broadcast_leads'   → dispara broadcast pros representantes
  --   'passar_pra_humano' → muda status pra aguardando_representante sem broadcast
  --   'passar_pra_agente' → chama outro agente (chave em passar_para_agente_chave)
  --   'encerrar'          → encerra a conversa
  --   'nenhuma'           → só marca status='qualificada' e para
  acao_ao_concluir      text NOT NULL DEFAULT 'passar_pra_humano' CHECK (acao_ao_concluir IN (
    'broadcast_leads','passar_pra_humano','passar_pra_agente','encerrar','nenhuma'
  )),
  passar_para_agente_chave text,

  ativo                 boolean NOT NULL DEFAULT true,
  criado_em             timestamptz NOT NULL DEFAULT now(),
  atualizado_em         timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_wa_agentes_ativacao ON public.wa_agentes(condicao_ativacao) WHERE ativo;

-- Vincula qual agente está ativo em cada conversa
ALTER TABLE public.wa_conversas
  ADD COLUMN IF NOT EXISTS agente_id uuid REFERENCES public.wa_agentes(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_wa_conversas_agente ON public.wa_conversas(agente_id);

-- ============================================================================
-- lead_broadcasts — 1 broadcast por lead qualificado (fluxo Kalebe)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.lead_broadcasts (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversa_id           uuid NOT NULL REFERENCES public.wa_conversas(id) ON DELETE CASCADE,
  projeto_id            uuid REFERENCES public.projetos(id) ON DELETE SET NULL,
  contato_id            uuid REFERENCES public.wa_contatos(id) ON DELETE SET NULL,

  -- Snapshot da qualificação (pra reps verem sem query extra)
  resumo                text NOT NULL,             -- "João da Silva · Palhoça · on_grid · residencial"
  contexto_qualificacao jsonb NOT NULL DEFAULT '{}',

  status                text NOT NULL DEFAULT 'aguardando_aceites' CHECK (status IN (
    'aguardando_aceites',   -- broadcast disparado, esperando reps aceitarem
    'atribuido',            -- alguém está no volante (posicao_atual > 0)
    'contatado',            -- rep atual cumpriu SLA (contactou o lead)
    'expirado',             -- fila zerou sem ninguém cumprir
    'cancelado'             -- admin cancelou manualmente
  )),

  posicao_atual         int  NOT NULL DEFAULT 0,   -- 0 = ninguém no volante, N = quem está tentando

  qtd_representantes_notificados int NOT NULL DEFAULT 0,

  criado_em             timestamptz NOT NULL DEFAULT now(),
  atualizado_em         timestamptz NOT NULL DEFAULT now(),
  encerrado_em          timestamptz
);

CREATE INDEX IF NOT EXISTS idx_lead_broadcasts_conversa ON public.lead_broadcasts(conversa_id);
CREATE INDEX IF NOT EXISTS idx_lead_broadcasts_status   ON public.lead_broadcasts(status);
CREATE INDEX IF NOT EXISTS idx_lead_broadcasts_projeto  ON public.lead_broadcasts(projeto_id);

-- Só 1 broadcast ATIVO por conversa (evita duplicar)
CREATE UNIQUE INDEX IF NOT EXISTS uq_lead_broadcasts_ativo_por_conversa
  ON public.lead_broadcasts(conversa_id)
  WHERE status IN ('aguardando_aceites','atribuido');

-- ============================================================================
-- lead_aceites — fila FIFO. Ordem definida por aceito_em.
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.lead_aceites (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  broadcast_id          uuid NOT NULL REFERENCES public.lead_broadcasts(id) ON DELETE CASCADE,
  representante_id      uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,

  aceito_em             timestamptz NOT NULL DEFAULT now(),
  posicao               int  NOT NULL,             -- 1, 2, 3, ... (definido no INSERT)

  status                text NOT NULL DEFAULT 'pendente' CHECK (status IN (
    'pendente',       -- na fila, esperando vez
    'no_volante',     -- tá no seu turno, prazo correndo
    'contatou',       -- cumpriu SLA (mandou voz/vídeo pelo canal)
    'perdeu_prazo',   -- não cumpriu em 8min
    'desistiu'        -- rep pediu pra passar
  )),

  -- Só populados quando vira 'no_volante'
  no_volante_em         timestamptz,
  prazo_expira_em       timestamptz,               -- no_volante_em + 8min
  aviso_2min_enviado_em timestamptz,               -- controle idempotente do cron
  contatou_em           timestamptz,               -- quando marcou 'contatou'
  fim_turno_em          timestamptz,               -- perdeu_prazo ou desistiu

  criado_em             timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_lead_aceites_broadcast ON public.lead_aceites(broadcast_id, posicao);
CREATE INDEX IF NOT EXISTS idx_lead_aceites_rep       ON public.lead_aceites(representante_id);
CREATE INDEX IF NOT EXISTS idx_lead_aceites_status    ON public.lead_aceites(status);

-- Impede o mesmo rep aceitar 2× o mesmo broadcast
CREATE UNIQUE INDEX IF NOT EXISTS uq_lead_aceites_rep_broadcast
  ON public.lead_aceites(broadcast_id, representante_id);

-- Um broadcast só pode ter UM aceite 'no_volante' por vez (proteção)
CREATE UNIQUE INDEX IF NOT EXISTS uq_lead_aceites_no_volante
  ON public.lead_aceites(broadcast_id)
  WHERE status = 'no_volante';

-- ============================================================================
-- RLS
-- ============================================================================
ALTER TABLE public.wa_agentes       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lead_broadcasts  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lead_aceites     ENABLE ROW LEVEL SECURITY;

-- Agentes: só admin gerencia
DROP POLICY IF EXISTS wa_agentes_admin_all ON public.wa_agentes;
CREATE POLICY wa_agentes_admin_all ON public.wa_agentes
  FOR ALL USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'));

DROP POLICY IF EXISTS wa_agentes_read ON public.wa_agentes;
CREATE POLICY wa_agentes_read ON public.wa_agentes
  FOR SELECT USING (auth.uid() IS NOT NULL);   -- todo user autenticado lê (pra mostrar nome/foto)

-- Broadcasts: admin tudo, representantes só broadcasts que eles aceitaram OU abertos pra aceitar
DROP POLICY IF EXISTS lead_broadcasts_admin_all ON public.lead_broadcasts;
CREATE POLICY lead_broadcasts_admin_all ON public.lead_broadcasts
  FOR ALL USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'));

DROP POLICY IF EXISTS lead_broadcasts_rep_read ON public.lead_broadcasts;
CREATE POLICY lead_broadcasts_rep_read ON public.lead_broadcasts
  FOR SELECT USING (
    status IN ('aguardando_aceites','atribuido')
    OR EXISTS (
      SELECT 1 FROM public.lead_aceites la
      WHERE la.broadcast_id = lead_broadcasts.id AND la.representante_id = auth.uid()
    )
  );

-- Aceites: admin tudo, rep vê os próprios
DROP POLICY IF EXISTS lead_aceites_admin_all ON public.lead_aceites;
CREATE POLICY lead_aceites_admin_all ON public.lead_aceites
  FOR ALL USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'));

DROP POLICY IF EXISTS lead_aceites_rep_read ON public.lead_aceites;
CREATE POLICY lead_aceites_rep_read ON public.lead_aceites
  FOR SELECT USING (representante_id = auth.uid());

DROP POLICY IF EXISTS lead_aceites_rep_insert ON public.lead_aceites;
CREATE POLICY lead_aceites_rep_insert ON public.lead_aceites
  FOR INSERT WITH CHECK (representante_id = auth.uid());

-- ============================================================================
-- Realtime
-- ============================================================================
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.wa_agentes;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.lead_broadcasts;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.lead_aceites;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ============================================================================
-- Seed: 1 agente de qualificação (o que já existe hardcoded)
-- Kalebe pode editar/desativar/criar mais no admin.
-- ============================================================================
INSERT INTO public.wa_agentes (
  chave, nome, descricao_interna,
  system_prompt,
  condicao_ativacao, ordem_prioridade,
  acao_ao_concluir
)
VALUES (
  'qualificacao_padrao',
  'Assistente Spin',
  'Recebe leads novos, coleta info básica (nome, cidade, tipo de sistema, tipo de imóvel), cria projeto no CRM e passa pros representantes.',
  E'Você é o Assistente de Qualificação da Spin Solar — empresa de energia solar em Santa Catarina.\nSeu papel: qualificar leads chegando pelo WhatsApp da empresa.\n\nTOM\n- Cordial, direto, brasileiro. Sem "prezado", sem "atenciosamente".\n- Uma pergunta por vez. Nada de listas gigantes.\n- Se o cliente já respondeu algo em conversas anteriores, NÃO peça de novo.\n- Se ele mandar áudio ou imagem que você não conseguir ler, peça pra digitar.\n- Se pedir pra falar com humano ou reclamar da IA, escale imediatamente.\n\nCOMO QUALIFICAR\nColete NA SEGUINTE ORDEM:\n  1. nome (se ainda não sabe)\n  2. cidade + estado (pra saber HSP e distância)\n  3. tipo de sistema (on_grid, hibrido, bess, ve_recarga, limpeza, revisao ou outro)\n     - explique brevemente cada opção só se o cliente perguntar\n  4. tipo de imóvel (residencial, comercial, industrial ou rural)\n  5. consumo médio ou valor da conta (opcional — só pergunta se já tem os 4 anteriores)\n\nQUANDO ENCERRAR\nAssim que tiver os 4 campos obrigatórios (nome, cidade, tipo_sistema, tipo_imovel),\navise o cliente que vai passar pra um representante e defina status_qualificacao=''qualificada''.\n\nEXTRAÇÃO DE DADOS\nSempre atualize APENAS os campos que a última resposta do cliente esclareceu.\nNão invente. Se não deu pra entender, deixe o campo em branco e pergunte de novo.\n\nFORMATO DE SAÍDA — JSON estrito\n{\n  "contexto_atualizado": { ... campos ... "status_qualificacao": "coletando|qualificada|escalar_humano" },\n  "proxima_mensagem": string\n}\n\nRetorne SOMENTE o JSON, sem cercas de código.',
  'primeira_msg_lead',
  10,
  'broadcast_leads'
)
ON CONFLICT (chave) DO NOTHING;

NOTIFY pgrst, 'reload schema';
