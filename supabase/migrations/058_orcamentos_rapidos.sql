-- ============================================================================
-- Migration 058 — Orçamentos Rápidos (Fase 1 do Orçamento Rápido de Lead)
-- ============================================================================
-- Objetivo: dar ao consultor uma ferramenta que gera orçamento aproximado em
-- 30s a partir de UM gatilho (fatura, R$/mês, kWh, qtd placas), pra enviar via
-- WhatsApp e testar interesse do lead antes de investir tempo em projeto técnico.
--
-- Fluxo comercial: LEAD → PROJETO → NEGÓCIO
--   1. Lead: orçamento rápido, mensagem WhatsApp, sem PDF, sem contrato
--   2. Projeto: workflow técnico completo (fatura, telhado, kit, lista CA)
--   3. Negócio: proposta oficial aceita, entra no CRM/pipeline
--
-- Ver PLANO_ORCAMENTO_RAPIDO.md na raiz pra contexto completo.
-- ============================================================================

BEGIN;

-- ═════════════════════════════════════════════════════════════════════════════
-- TABELA orcamentos_rapidos
-- ═════════════════════════════════════════════════════════════════════════════

CREATE TABLE public.orcamentos_rapidos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Ownership: aponta pra UM dos 3 (lead, cliente, ou consultor "solto")
  -- Cascade SET NULL preserva histórico mesmo se lead/cliente for arquivado
  lead_id uuid REFERENCES public.leads(id) ON DELETE SET NULL,
  cliente_id uuid REFERENCES public.clientes(id) ON DELETE SET NULL,
  consultor_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,

  -- Tipo de item que está sendo orçado
  tipo tipo_item_projeto NOT NULL,

  -- Modo de entrada — qual gatilho o consultor escolheu
  modo_entrada text NOT NULL CHECK (modo_entrada IN (
    'fatura', 'valor_mensal', 'consumo_kwh', 'qtd_placas',
    'backup_kwh', 'modelo_carro', 'qtd_diarias', 'descricao_livre'
  )),

  -- Input original (o que o consultor digitou/anexou)
  entrada jsonb NOT NULL,

  -- Resultado calculado (o que a calculadora estimou)
  resultado jsonb NOT NULL,

  -- Ajuste manual do consultor sobre o valor calculado (log de intervenção)
  ajuste_percentual numeric(5,2) DEFAULT 0 CHECK (ajuste_percentual BETWEEN -100 AND 100),
  ajuste_justificativa text, -- obrigatória se |ajuste| > 10% — validado no app

  -- Valor final praticado (após ajuste)
  valor_final numeric(14,2) NOT NULL CHECK (valor_final >= 0),

  -- Ciclo de vida
  status text NOT NULL DEFAULT 'rascunho' CHECK (status IN (
    'rascunho', 'enviado', 'convertido', 'perdido', 'expirado'
  )),
  enviado_em timestamptz,
  canal_envio text CHECK (canal_envio IN ('whatsapp', 'email', 'presencial', 'outro')),

  -- Se converteu em projeto, aponta pro projeto criado
  projeto_id uuid REFERENCES public.projetos(id) ON DELETE SET NULL,
  convertido_em timestamptz,

  -- Snapshot da mensagem enviada (pro consultor consultar o que foi passado)
  mensagem_enviada text,
  telefone_destino text, -- pode diferir do lead.whatsapp se foi digitado na hora

  -- Meta
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id),
  updated_by uuid REFERENCES auth.users(id),

  -- Um orçamento tem pelo menos um dono ou é solto (só o consultor)
  CONSTRAINT chk_orc_owner CHECK (
    lead_id IS NOT NULL OR cliente_id IS NOT NULL OR consultor_id IS NOT NULL
  )
);

COMMENT ON TABLE public.orcamentos_rapidos IS
  'Orçamento aproximado de lead — estimativa comercial em 30s pra atrair interesse.
   NÃO gera PDF nem contrato. Vira projeto formal quando cliente demonstra interesse.
   Fase 1 do Orçamento Rápido (mig 058, 2026-07-30).';

COMMENT ON COLUMN public.orcamentos_rapidos.entrada IS
  'JSONB com o input original do consultor. Formato varia por modo_entrada.
   Ex: { "consumo_kwh": 400 } · { "qtd_placas": 10 } · { "descricao": "...", "valor_estimado": 4200 }';

COMMENT ON COLUMN public.orcamentos_rapidos.resultado IS
  'JSONB com o resultado da calculadora. Formato varia por vertical.
   Ex solar: { "kwp_estimado": 5.55, "kit_sugerido": "10× WEG 555W", "valor_estimado_cliente": 32500 }
   Ex limpeza: { "qtd_placas": 32, "valor_estimado_cliente": 720 }';

-- ═════════════════════════════════════════════════════════════════════════════
-- ÍNDICES
-- ═════════════════════════════════════════════════════════════════════════════

CREATE INDEX idx_orc_rapido_lead ON public.orcamentos_rapidos(lead_id)
  WHERE lead_id IS NOT NULL;
CREATE INDEX idx_orc_rapido_cliente ON public.orcamentos_rapidos(cliente_id)
  WHERE cliente_id IS NOT NULL;
CREATE INDEX idx_orc_rapido_consultor ON public.orcamentos_rapidos(consultor_id);
CREATE INDEX idx_orc_rapido_status ON public.orcamentos_rapidos(status);
CREATE INDEX idx_orc_rapido_projeto ON public.orcamentos_rapidos(projeto_id)
  WHERE projeto_id IS NOT NULL;
CREATE INDEX idx_orc_rapido_created ON public.orcamentos_rapidos(created_at DESC);

-- ═════════════════════════════════════════════════════════════════════════════
-- TRIGGER updated_at
-- ═════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.trg_orc_rapido_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_orc_rapido_touch_updated
  BEFORE UPDATE ON public.orcamentos_rapidos
  FOR EACH ROW EXECUTE FUNCTION public.trg_orc_rapido_updated_at();

-- ═════════════════════════════════════════════════════════════════════════════
-- RLS
-- ═════════════════════════════════════════════════════════════════════════════

ALTER TABLE public.orcamentos_rapidos ENABLE ROW LEVEL SECURITY;

-- Admin vê e edita tudo
CREATE POLICY orc_rapido_admin ON public.orcamentos_rapidos FOR ALL
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- Consultor/vendedor vê e edita só os próprios orçamentos
CREATE POLICY orc_rapido_dono ON public.orcamentos_rapidos FOR ALL
  USING (consultor_id = auth.uid())
  WITH CHECK (consultor_id = auth.uid());

-- ═════════════════════════════════════════════════════════════════════════════
-- CAMPOS NOVOS EM leads E projetos
-- ═════════════════════════════════════════════════════════════════════════════

-- lead aponta pro orçamento rápido "atual" (o mais recente ativo)
ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS orcamento_rapido_atual_id uuid
    REFERENCES public.orcamentos_rapidos(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.leads.orcamento_rapido_atual_id IS
  'Aponta pro orçamento rápido mais recente do lead — atalho pra tela do lead
   sempre exibir o cenário vigente. Histórico completo via SELECT * FROM
   orcamentos_rapidos WHERE lead_id = ...';

-- projeto guarda de qual orçamento rápido nasceu (rastreabilidade)
ALTER TABLE public.projetos
  ADD COLUMN IF NOT EXISTS orcamento_rapido_origem_id uuid
    REFERENCES public.orcamentos_rapidos(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.projetos.orcamento_rapido_origem_id IS
  'Se este projeto nasceu de um orçamento rápido convertido, aponta pra ele.
   NULL pra projetos criados diretamente sem passar pelo funil de lead.';


COMMIT;


-- ============================================================================
-- DOWN (reversão)
-- ============================================================================
-- BEGIN;
--   ALTER TABLE public.projetos DROP COLUMN IF EXISTS orcamento_rapido_origem_id;
--   ALTER TABLE public.leads DROP COLUMN IF EXISTS orcamento_rapido_atual_id;
--   DROP TRIGGER IF EXISTS trg_orc_rapido_touch_updated ON public.orcamentos_rapidos;
--   DROP FUNCTION IF EXISTS public.trg_orc_rapido_updated_at();
--   DROP TABLE IF EXISTS public.orcamentos_rapidos;
-- COMMIT;
-- ============================================================================
