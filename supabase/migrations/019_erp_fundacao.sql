-- ============================================================================
-- Migration 019: Fundação ERP Spin Solar
-- ============================================================================
-- Schema base para os 5 blocos do ERP:
-- 1. CRM (clientes, leads, comissoes, metas, interacoes)
-- 2. Financeiro (contas receber/pagar, categorias, movimentos)
-- 3. Operacoes (fornecedores, pedidos, instalacoes, equipes)
-- 4. Fiscal (notas, contratos, documentos)
-- 5. Pos-venda (ordens_servico, garantias)
-- + logs_auditoria + interacoes_cliente
-- ============================================================================

-- =============================================================================
-- BLOCO 1 — CRM
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.clientes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  razao_social text NOT NULL,
  nome_fantasia text,
  cpf_cnpj text,
  tipo text NOT NULL DEFAULT 'pj' CHECK (tipo IN ('pf', 'pj')),
  email text,
  telefone text,
  whatsapp text,
  endereco jsonb,
  origem text,
  observacoes text,
  proprietario_id uuid REFERENCES public.profiles(id),
  ativo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_clientes_proprietario ON public.clientes(proprietario_id);
CREATE INDEX IF NOT EXISTS idx_clientes_cpf_cnpj ON public.clientes(cpf_cnpj);

CREATE TABLE IF NOT EXISTS public.leads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome text NOT NULL,
  email text,
  telefone text,
  whatsapp text,
  origem text,
  cidade text,
  uf text,
  interesse text,
  valor_estimado numeric(12,2),
  status text NOT NULL DEFAULT 'novo' CHECK (
    status IN ('novo', 'qualificando', 'proposta', 'negociacao', 'ganho', 'perdido')
  ),
  cliente_id uuid REFERENCES public.clientes(id) ON DELETE SET NULL,
  projeto_id uuid REFERENCES public.projetos(id) ON DELETE SET NULL,
  proprietario_id uuid REFERENCES public.profiles(id),
  observacoes text,
  ultima_interacao_em timestamptz,
  perdido_motivo text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_leads_status ON public.leads(status);
CREATE INDEX IF NOT EXISTS idx_leads_proprietario ON public.leads(proprietario_id);

CREATE TABLE IF NOT EXISTS public.interacoes_cliente (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id uuid REFERENCES public.clientes(id) ON DELETE CASCADE,
  lead_id uuid REFERENCES public.leads(id) ON DELETE CASCADE,
  tipo text NOT NULL CHECK (
    tipo IN ('ligacao', 'whatsapp', 'email', 'reuniao', 'visita', 'nota', 'proposta_enviada')
  ),
  descricao text NOT NULL,
  usuario_id uuid REFERENCES public.profiles(id),
  data_hora timestamptz NOT NULL DEFAULT now(),
  duracao_min int,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (cliente_id IS NOT NULL OR lead_id IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS idx_interacoes_cliente ON public.interacoes_cliente(cliente_id, data_hora DESC);
CREATE INDEX IF NOT EXISTS idx_interacoes_lead ON public.interacoes_cliente(lead_id, data_hora DESC);

CREATE TABLE IF NOT EXISTS public.metas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  consultor_id uuid NOT NULL REFERENCES public.profiles(id),
  ano int NOT NULL,
  mes int CHECK (mes BETWEEN 1 AND 12),
  meta_vendas_valor numeric(12,2),
  meta_projetos_qtd int,
  atingido_vendas_valor numeric(12,2) DEFAULT 0,
  atingido_projetos_qtd int DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(consultor_id, ano, mes)
);

CREATE TABLE IF NOT EXISTS public.comissoes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  consultor_id uuid NOT NULL REFERENCES public.profiles(id),
  projeto_id uuid REFERENCES public.projetos(id) ON DELETE SET NULL,
  cliente_id uuid REFERENCES public.clientes(id) ON DELETE SET NULL,
  descricao text,
  valor_base numeric(12,2) NOT NULL,
  percentual numeric(5,2),
  valor_comissao numeric(12,2) NOT NULL,
  status text NOT NULL DEFAULT 'pendente' CHECK (
    status IN ('pendente', 'aprovada', 'paga', 'cancelada')
  ),
  data_referencia date,
  data_pagamento date,
  observacoes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_comissoes_consultor ON public.comissoes(consultor_id, status);

-- =============================================================================
-- BLOCO 2 — FINANCEIRO
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.categorias_financeiras (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome text NOT NULL,
  tipo text NOT NULL CHECK (tipo IN ('receita', 'despesa')),
  cor text,
  ativo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.contas_receber (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id uuid REFERENCES public.clientes(id) ON DELETE SET NULL,
  projeto_id uuid REFERENCES public.projetos(id) ON DELETE SET NULL,
  categoria_id uuid REFERENCES public.categorias_financeiras(id),
  descricao text NOT NULL,
  valor numeric(12,2) NOT NULL,
  data_vencimento date NOT NULL,
  data_pagamento date,
  valor_pago numeric(12,2),
  status text NOT NULL DEFAULT 'aberta' CHECK (
    status IN ('aberta', 'paga', 'vencida', 'cancelada', 'parcial')
  ),
  forma_pagamento text,
  numero_parcela int DEFAULT 1,
  total_parcelas int DEFAULT 1,
  observacoes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_contas_receber_status ON public.contas_receber(status, data_vencimento);

CREATE TABLE IF NOT EXISTS public.contas_pagar (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fornecedor_id uuid,
  categoria_id uuid REFERENCES public.categorias_financeiras(id),
  descricao text NOT NULL,
  valor numeric(12,2) NOT NULL,
  data_vencimento date NOT NULL,
  data_pagamento date,
  valor_pago numeric(12,2),
  status text NOT NULL DEFAULT 'aberta' CHECK (
    status IN ('aberta', 'paga', 'vencida', 'cancelada', 'parcial')
  ),
  forma_pagamento text,
  numero_parcela int DEFAULT 1,
  total_parcelas int DEFAULT 1,
  observacoes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_contas_pagar_status ON public.contas_pagar(status, data_vencimento);

CREATE TABLE IF NOT EXISTS public.movimentos_caixa (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tipo text NOT NULL CHECK (tipo IN ('entrada', 'saida')),
  categoria_id uuid REFERENCES public.categorias_financeiras(id),
  descricao text NOT NULL,
  valor numeric(12,2) NOT NULL,
  data date NOT NULL,
  conta_receber_id uuid REFERENCES public.contas_receber(id) ON DELETE SET NULL,
  conta_pagar_id uuid REFERENCES public.contas_pagar(id) ON DELETE SET NULL,
  observacoes text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_movimentos_data ON public.movimentos_caixa(data DESC);

-- =============================================================================
-- BLOCO 3 — OPERACOES
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.fornecedores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  razao_social text NOT NULL,
  nome_fantasia text,
  cnpj text,
  categoria text,
  contato_nome text,
  contato_email text,
  contato_telefone text,
  endereco jsonb,
  observacoes text,
  ativo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.contas_pagar
  ADD CONSTRAINT contas_pagar_fornecedor_fk
  FOREIGN KEY (fornecedor_id) REFERENCES public.fornecedores(id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS public.pedidos_compra (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  numero text UNIQUE,
  fornecedor_id uuid REFERENCES public.fornecedores(id),
  projeto_id uuid REFERENCES public.projetos(id) ON DELETE SET NULL,
  data_pedido date NOT NULL DEFAULT CURRENT_DATE,
  data_prevista_entrega date,
  data_recebimento date,
  valor_total numeric(12,2) DEFAULT 0,
  status text NOT NULL DEFAULT 'rascunho' CHECK (
    status IN ('rascunho', 'enviado', 'confirmado', 'em_transito', 'recebido', 'cancelado')
  ),
  observacoes text,
  criado_por uuid REFERENCES public.profiles(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.pedido_compra_itens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pedido_id uuid NOT NULL REFERENCES public.pedidos_compra(id) ON DELETE CASCADE,
  produto_id uuid REFERENCES public.produtos(id),
  descricao text NOT NULL,
  quantidade numeric(10,2) NOT NULL,
  valor_unit numeric(12,2) NOT NULL,
  valor_total numeric(12,2) NOT NULL,
  observacoes text
);

CREATE TABLE IF NOT EXISTS public.equipes_instalacao (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome text NOT NULL,
  lider_id uuid REFERENCES public.profiles(id),
  ativo boolean NOT NULL DEFAULT true,
  observacoes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.equipe_membros (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  equipe_id uuid NOT NULL REFERENCES public.equipes_instalacao(id) ON DELETE CASCADE,
  colaborador_id uuid NOT NULL REFERENCES public.profiles(id),
  funcao text,
  UNIQUE(equipe_id, colaborador_id)
);

CREATE TABLE IF NOT EXISTS public.instalacoes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  projeto_id uuid NOT NULL REFERENCES public.projetos(id) ON DELETE CASCADE,
  cliente_id uuid REFERENCES public.clientes(id) ON DELETE SET NULL,
  data_agendada date,
  hora_inicio time,
  hora_fim time,
  equipe_id uuid REFERENCES public.equipes_instalacao(id),
  status text NOT NULL DEFAULT 'agendada' CHECK (
    status IN ('agendada', 'em_execucao', 'concluida', 'cancelada', 'reagendada', 'com_pendencias')
  ),
  observacoes text,
  fotos_before text[],
  fotos_after text[],
  checklist_concluido jsonb,
  concluida_em timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_instalacoes_status ON public.instalacoes(status, data_agendada);

-- =============================================================================
-- BLOCO 4 — FISCAL
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.notas_fiscais (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  numero text,
  serie text,
  tipo text NOT NULL CHECK (tipo IN ('nfe', 'nfse', 'nfce')),
  cliente_id uuid REFERENCES public.clientes(id),
  projeto_id uuid REFERENCES public.projetos(id),
  valor_total numeric(12,2) NOT NULL,
  valor_impostos numeric(12,2),
  data_emissao date NOT NULL DEFAULT CURRENT_DATE,
  status text NOT NULL DEFAULT 'rascunho' CHECK (
    status IN ('rascunho', 'emitida', 'cancelada', 'inutilizada', 'denegada')
  ),
  chave_acesso text,
  xml_url text,
  pdf_url text,
  observacoes text,
  emitida_por uuid REFERENCES public.profiles(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_notas_status ON public.notas_fiscais(status, data_emissao DESC);

CREATE TABLE IF NOT EXISTS public.contratos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  numero text,
  cliente_id uuid REFERENCES public.clientes(id),
  projeto_id uuid REFERENCES public.projetos(id),
  tipo text,
  valor numeric(12,2),
  data_inicio date,
  data_fim date,
  status text NOT NULL DEFAULT 'rascunho' CHECK (
    status IN ('rascunho', 'aguardando_assinatura', 'ativo', 'expirado', 'encerrado', 'cancelado')
  ),
  url_pdf text,
  assinado_cliente boolean DEFAULT false,
  assinado_cliente_em timestamptz,
  assinado_empresa boolean DEFAULT false,
  observacoes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.documentos_projeto (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  projeto_id uuid REFERENCES public.projetos(id) ON DELETE CASCADE,
  cliente_id uuid REFERENCES public.clientes(id) ON DELETE CASCADE,
  categoria text CHECK (categoria IN (
    'fatura', 'contrato', 'nota_fiscal', 'foto_instalacao',
    'diagrama', 'ART', 'padrao_entrada', 'homologacao', 'outro'
  )),
  nome text NOT NULL,
  url text NOT NULL,
  tamanho_bytes bigint,
  tipo_mime text,
  uploaded_by uuid REFERENCES public.profiles(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (projeto_id IS NOT NULL OR cliente_id IS NOT NULL)
);

-- =============================================================================
-- BLOCO 5 — POS-VENDA
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.ordens_servico (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  numero text UNIQUE,
  cliente_id uuid REFERENCES public.clientes(id),
  projeto_id uuid REFERENCES public.projetos(id),
  tipo text NOT NULL CHECK (
    tipo IN ('manutencao', 'reparo', 'garantia', 'expansao', 'reclamacao', 'visita_tecnica')
  ),
  titulo text NOT NULL,
  descricao text,
  prioridade text DEFAULT 'media' CHECK (prioridade IN ('baixa', 'media', 'alta', 'urgente')),
  status text NOT NULL DEFAULT 'aberta' CHECK (
    status IN ('aberta', 'em_atendimento', 'aguardando_peca', 'concluida', 'cancelada')
  ),
  responsavel_id uuid REFERENCES public.profiles(id),
  equipe_id uuid REFERENCES public.equipes_instalacao(id),
  data_abertura date NOT NULL DEFAULT CURRENT_DATE,
  data_agendada date,
  data_conclusao date,
  custo numeric(12,2),
  observacoes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_os_status ON public.ordens_servico(status, prioridade);

CREATE TABLE IF NOT EXISTS public.garantias (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  projeto_id uuid REFERENCES public.projetos(id),
  produto_id uuid REFERENCES public.produtos(id),
  cliente_id uuid REFERENCES public.clientes(id),
  numero_serie text,
  fabricante text,
  data_inicio date NOT NULL,
  data_fim date NOT NULL,
  tipo text CHECK (tipo IN ('modulo', 'inversor', 'estrutura', 'instalacao', 'sistema')),
  observacoes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- =============================================================================
-- AUDITORIA / LOGS
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.logs_auditoria (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  usuario_id uuid REFERENCES public.profiles(id),
  entidade text NOT NULL,
  entidade_id uuid,
  acao text NOT NULL CHECK (acao IN ('criar', 'atualizar', 'deletar', 'visualizar', 'exportar')),
  dados_antes jsonb,
  dados_depois jsonb,
  ip_origem text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_logs_entidade ON public.logs_auditoria(entidade, entidade_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_logs_usuario ON public.logs_auditoria(usuario_id, created_at DESC);

-- =============================================================================
-- RLS: SEGURANCA POR ROLE
-- =============================================================================

ALTER TABLE public.clientes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.interacoes_cliente ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.metas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.comissoes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.categorias_financeiras ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contas_receber ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contas_pagar ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.movimentos_caixa ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fornecedores ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pedidos_compra ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pedido_compra_itens ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.equipes_instalacao ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.equipe_membros ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.instalacoes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notas_fiscais ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contratos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.documentos_projeto ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ordens_servico ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.garantias ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.logs_auditoria ENABLE ROW LEVEL SECURITY;

-- CRM: consultor vê próprio, admin vê tudo
CREATE POLICY "clientes_admin_all" ON public.clientes FOR ALL USING (public.is_admin());
CREATE POLICY "clientes_dono" ON public.clientes FOR ALL USING (proprietario_id = auth.uid());

CREATE POLICY "leads_admin_all" ON public.leads FOR ALL USING (public.is_admin());
CREATE POLICY "leads_dono" ON public.leads FOR ALL USING (proprietario_id = auth.uid());

CREATE POLICY "interacoes_admin_all" ON public.interacoes_cliente FOR ALL USING (public.is_admin());
CREATE POLICY "interacoes_dono" ON public.interacoes_cliente FOR ALL USING (usuario_id = auth.uid());

CREATE POLICY "metas_admin_all" ON public.metas FOR ALL USING (public.is_admin());
CREATE POLICY "metas_dono" ON public.metas FOR SELECT USING (consultor_id = auth.uid());

CREATE POLICY "comissoes_admin_all" ON public.comissoes FOR ALL USING (public.is_admin());
CREATE POLICY "comissoes_dono" ON public.comissoes FOR SELECT USING (consultor_id = auth.uid());

-- Financeiro: só admin
CREATE POLICY "categorias_admin_all" ON public.categorias_financeiras FOR ALL USING (public.is_admin());
CREATE POLICY "categorias_read_auth" ON public.categorias_financeiras FOR SELECT USING (auth.uid() IS NOT NULL);

CREATE POLICY "receber_admin_all" ON public.contas_receber FOR ALL USING (public.is_admin());
CREATE POLICY "pagar_admin_all" ON public.contas_pagar FOR ALL USING (public.is_admin());
CREATE POLICY "movimentos_admin_all" ON public.movimentos_caixa FOR ALL USING (public.is_admin());

-- Operacoes
CREATE POLICY "fornecedores_admin_all" ON public.fornecedores FOR ALL USING (public.is_admin());
CREATE POLICY "fornecedores_read_auth" ON public.fornecedores FOR SELECT USING (auth.uid() IS NOT NULL);

CREATE POLICY "pedidos_admin_all" ON public.pedidos_compra FOR ALL USING (public.is_admin());
CREATE POLICY "pedido_itens_admin_all" ON public.pedido_compra_itens FOR ALL USING (public.is_admin());

CREATE POLICY "equipes_admin_all" ON public.equipes_instalacao FOR ALL USING (public.is_admin());
CREATE POLICY "equipes_read_auth" ON public.equipes_instalacao FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "equipe_membros_admin_all" ON public.equipe_membros FOR ALL USING (public.is_admin());
CREATE POLICY "equipe_membros_read_auth" ON public.equipe_membros FOR SELECT USING (auth.uid() IS NOT NULL);

CREATE POLICY "instalacoes_admin_all" ON public.instalacoes FOR ALL USING (public.is_admin());
CREATE POLICY "instalacoes_read_auth" ON public.instalacoes FOR SELECT USING (auth.uid() IS NOT NULL);

-- Fiscal
CREATE POLICY "notas_admin_all" ON public.notas_fiscais FOR ALL USING (public.is_admin());
CREATE POLICY "contratos_admin_all" ON public.contratos FOR ALL USING (public.is_admin());
CREATE POLICY "documentos_admin_all" ON public.documentos_projeto FOR ALL USING (public.is_admin());
CREATE POLICY "documentos_read_auth" ON public.documentos_projeto FOR SELECT USING (auth.uid() IS NOT NULL);

-- Pos-venda
CREATE POLICY "os_admin_all" ON public.ordens_servico FOR ALL USING (public.is_admin());
CREATE POLICY "os_responsavel" ON public.ordens_servico FOR SELECT USING (responsavel_id = auth.uid());
CREATE POLICY "garantias_admin_all" ON public.garantias FOR ALL USING (public.is_admin());
CREATE POLICY "garantias_read_auth" ON public.garantias FOR SELECT USING (auth.uid() IS NOT NULL);

-- Logs
CREATE POLICY "logs_admin_read" ON public.logs_auditoria FOR SELECT USING (public.is_admin());

-- =============================================================================
-- SEED: categorias financeiras iniciais
-- =============================================================================

INSERT INTO public.categorias_financeiras (nome, tipo, cor) VALUES
  ('Venda de projeto solar', 'receita', '#22c55e'),
  ('Manutenção O&M', 'receita', '#3b82f6'),
  ('Outras receitas', 'receita', '#a3a3a3'),
  ('Compra de equipamento', 'despesa', '#ef4444'),
  ('Salários e comissões', 'despesa', '#f59e0b'),
  ('Impostos', 'despesa', '#8b5cf6'),
  ('Aluguel e utilidades', 'despesa', '#ec4899'),
  ('Marketing', 'despesa', '#06b6d4'),
  ('Deslocamento', 'despesa', '#84cc16'),
  ('Outras despesas', 'despesa', '#a3a3a3')
ON CONFLICT DO NOTHING;
