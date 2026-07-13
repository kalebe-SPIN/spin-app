-- ============================================================================
-- Migration 023: Davi de Compras da Spin — agente auditor de precos
-- ============================================================================
-- Estruturas para:
--  - cotacoes_mercado: cada cotacao coletada (WhatsApp, telefone, web)
--  - davi_conversas: historico do chat com o admin
--  - solicitacoes_cotacao: itens que o sistema/Davi identificou como precisando
-- ============================================================================

-- Cotacoes coletadas em campo/fornecedores locais
CREATE TABLE IF NOT EXISTS public.cotacoes_mercado (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  produto_id uuid REFERENCES public.produtos(id) ON DELETE SET NULL,
  descricao_livre text,   -- usada quando ainda nao ha produto cadastrado
  categoria text,
  preco_cotado numeric(12,4) NOT NULL,
  unidade text NOT NULL DEFAULT 'un',
  fornecedor_nome text NOT NULL,
  fornecedor_id uuid REFERENCES public.fornecedores(id) ON DELETE SET NULL,
  cidade text,
  uf text,
  data_cotacao date NOT NULL DEFAULT CURRENT_DATE,
  validade_dias int,             -- validade da cotacao segundo o fornecedor
  observacoes text,
  fonte text NOT NULL DEFAULT 'manual' CHECK (
    fonte IN ('manual', 'davi_ia', 'whatsapp', 'importada_planilha', 'web_pesquisa')
  ),
  aplicada boolean NOT NULL DEFAULT false,  -- true = ja virou preco vigente
  aplicada_em timestamptz,
  criado_por uuid REFERENCES public.profiles(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_cotacoes_produto ON public.cotacoes_mercado(produto_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_cotacoes_aplicada ON public.cotacoes_mercado(aplicada, created_at DESC);

-- Historico de conversas com o Davi (paralelo a bianca_conversas)
CREATE TABLE IF NOT EXISTS public.davi_conversas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  usuario_id uuid NOT NULL REFERENCES public.profiles(id),
  papel text NOT NULL,                            -- 'usuario' | 'davi'
  conteudo text NOT NULL,
  ferramenta_usada text,
  ferramenta_input jsonb,
  ferramenta_output jsonb,
  arquivada boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_davi_conv_usuario ON public.davi_conversas(usuario_id, created_at DESC);

-- Solicitacoes de cotacao (sistema detecta produto sem preco e cria pendencia)
CREATE TABLE IF NOT EXISTS public.solicitacoes_cotacao (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  produto_id uuid REFERENCES public.produtos(id) ON DELETE CASCADE,
  descricao_livre text,
  motivo text NOT NULL,                           -- 'sem_preco_vigente' | 'preco_desatualizado' | 'lista_ca_sem_preco'
  prioridade text NOT NULL DEFAULT 'media' CHECK (
    prioridade IN ('baixa', 'media', 'alta', 'urgente')
  ),
  status text NOT NULL DEFAULT 'aberta' CHECK (
    status IN ('aberta', 'em_cotacao', 'atendida', 'cancelada')
  ),
  origem_projeto_id uuid REFERENCES public.projetos(id) ON DELETE SET NULL,
  atendida_por_cotacao_id uuid REFERENCES public.cotacoes_mercado(id) ON DELETE SET NULL,
  observacoes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  atendida_em timestamptz
);
CREATE INDEX IF NOT EXISTS idx_solicit_status ON public.solicitacoes_cotacao(status, prioridade);
CREATE INDEX IF NOT EXISTS idx_solicit_produto ON public.solicitacoes_cotacao(produto_id);

-- RLS: tudo restrito a admin
ALTER TABLE public.cotacoes_mercado ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.davi_conversas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.solicitacoes_cotacao ENABLE ROW LEVEL SECURITY;

CREATE POLICY "cotacoes_admin_all" ON public.cotacoes_mercado FOR ALL USING (public.is_admin());
CREATE POLICY "davi_conv_admin_all" ON public.davi_conversas FOR ALL USING (public.is_admin());
CREATE POLICY "davi_conv_dono" ON public.davi_conversas FOR ALL USING (usuario_id = auth.uid());
CREATE POLICY "solicit_admin_all" ON public.solicitacoes_cotacao FOR ALL USING (public.is_admin());
