-- ═══════════════════════════════════════════════════════════════════════
-- Migration 079 — Reforma do fluxo de homologação CELESC
--
-- Kalebe descreveu o processo REAL de ponta a ponta (2026-08-23):
--
-- 1. Solicitação inicial (site CELESC) → recebe protocolo
-- 2. TRT de PROJETO (CFT) → solicita, gera boleto, paga, emite
-- 3. Montagem do projeto (diagrama unifilar com dados anteriores)
-- 4. Submissão à CELESC (procuração + fotos + diagrama) → ~15 dias
-- 5. Instalação (campo executa e registra 5 fotos) — via Ordem de Serviço
-- 6. TRT de EXECUÇÃO (CFT) → solicita, gera boleto, paga, emite
-- 7. Pedido de conexão (envia TRT exec + fotos) → CELESC troca medidor
--
-- Ampliação: ~30 novas colunas em `homologacoes` + reset das 6 etapas
-- antigas (memorial/lista_kit/etc — eram etapas de DOCUMENTOS, não do
-- fluxo real) → 7 novas etapas alinhadas ao processo.
--
-- Fase 5 fica com FK placeholder pra `ordens_servico` (tabela ainda não
-- existe — cria em migration futura quando módulo OS for construído).
-- ═══════════════════════════════════════════════════════════════════════

BEGIN;

-- ─── FASE 1: já usa `protocolo_celesc` existente + observações ──────
ALTER TABLE public.homologacoes
  ADD COLUMN IF NOT EXISTS fase1_observacoes text;

-- ─── FASE 2: TRT de PROJETO (8 campos) ──────────────────────────────
ALTER TABLE public.homologacoes
  ADD COLUMN IF NOT EXISTS trt_projeto_numero          text,
  ADD COLUMN IF NOT EXISTS trt_projeto_valor_boleto    numeric(10, 2),
  ADD COLUMN IF NOT EXISTS trt_projeto_boleto_url      text,
  ADD COLUMN IF NOT EXISTS trt_projeto_data_pagamento  date,
  ADD COLUMN IF NOT EXISTS trt_projeto_comprovante_url text,
  ADD COLUMN IF NOT EXISTS trt_projeto_pdf_url         text,
  ADD COLUMN IF NOT EXISTS trt_projeto_data_emissao    date,
  ADD COLUMN IF NOT EXISTS trt_projeto_observacoes     text;

-- ─── FASE 3: diagrama já vive em projetos_diagramas ─────────────────
--     (só cache do id do diagrama "oficial" da homologação + observações)
ALTER TABLE public.homologacoes
  ADD COLUMN IF NOT EXISTS diagrama_unifilar_id uuid REFERENCES public.projetos_diagramas(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS fase3_observacoes    text;

-- ─── FASE 4: submissão à CELESC ─────────────────────────────────────
ALTER TABLE public.homologacoes
  ADD COLUMN IF NOT EXISTS data_submissao_projeto  date,
  ADD COLUMN IF NOT EXISTS data_autorizacao_projeto date,
  ADD COLUMN IF NOT EXISTS fase4_observacoes       text;

-- ─── FASE 5: placeholder pra Ordem de Serviço ───────────────────────
--     (tabela ordens_servico será criada em migration futura)
ALTER TABLE public.homologacoes
  ADD COLUMN IF NOT EXISTS ordem_servico_id uuid,   -- FK adicionada quando tabela existir
  ADD COLUMN IF NOT EXISTS fase5_observacoes text;

-- ─── FASE 6: TRT de EXECUÇÃO (mesma estrutura da fase 2) ────────────
ALTER TABLE public.homologacoes
  ADD COLUMN IF NOT EXISTS trt_execucao_numero          text,
  ADD COLUMN IF NOT EXISTS trt_execucao_valor_boleto    numeric(10, 2),
  ADD COLUMN IF NOT EXISTS trt_execucao_boleto_url      text,
  ADD COLUMN IF NOT EXISTS trt_execucao_data_pagamento  date,
  ADD COLUMN IF NOT EXISTS trt_execucao_comprovante_url text,
  ADD COLUMN IF NOT EXISTS trt_execucao_pdf_url         text,
  ADD COLUMN IF NOT EXISTS trt_execucao_data_emissao    date,
  ADD COLUMN IF NOT EXISTS trt_execucao_observacoes     text;

-- ─── FASE 7: pedido de conexão + troca medidor + ligação ────────────
ALTER TABLE public.homologacoes
  ADD COLUMN IF NOT EXISTS data_pedido_conexao date,
  ADD COLUMN IF NOT EXISTS data_troca_medidor  date,
  ADD COLUMN IF NOT EXISTS data_ligacao        date,
  ADD COLUMN IF NOT EXISTS fase7_observacoes   text;

-- ═══════════════════════════════════════════════════════════════════
-- Recria as etapas — antigas eram etapas de DOCUMENTOS, novas são
-- as 7 FASES do processo real. Preserva histórico das antigas por
-- rastreabilidade: só marca como legacy=true.
-- ═══════════════════════════════════════════════════════════════════

-- Marca etapas antigas como legacy (não deletar por auditoria)
ALTER TABLE public.homologacao_etapas
  ADD COLUMN IF NOT EXISTS legacy boolean NOT NULL DEFAULT false;

UPDATE public.homologacao_etapas
SET legacy = true
WHERE chave IN (
  'memorial_descritivo', 'lista_kit', 'lista_ca',
  'layout_instalacao', 'diagrama_unifilar', 'aprovacao_celesc'
);

-- Insere as 7 novas etapas pra CADA homologação existente.
INSERT INTO public.homologacao_etapas (homologacao_id, ordem, chave, nome_exibicao, status)
SELECT h.id, e.ordem, e.chave, e.nome_exibicao, 'pendente'
FROM public.homologacoes h
CROSS JOIN (VALUES
  (1, 'fase1_solicitacao_celesc',   '1. Solicitação inicial CELESC'),
  (2, 'fase2_trt_projeto',          '2. TRT de Projeto'),
  (3, 'fase3_montagem_projeto',     '3. Montagem do Projeto (diagrama)'),
  (4, 'fase4_submissao_celesc',     '4. Submissão à CELESC (aguarda ~15 dias)'),
  (5, 'fase5_instalacao',           '5. Instalação (Ordem de Serviço)'),
  (6, 'fase6_trt_execucao',         '6. TRT de Execução'),
  (7, 'fase7_pedido_conexao',       '7. Pedido de Conexão + Ligação')
) AS e(ordem, chave, nome_exibicao)
WHERE NOT EXISTS (
  SELECT 1 FROM public.homologacao_etapas he
  WHERE he.homologacao_id = h.id AND he.chave = e.chave
);

-- ═══════════════════════════════════════════════════════════════════
-- Gatilho: quando homologação é criada, popular 7 etapas automaticamente
-- ═══════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.criar_etapas_homologacao_v2()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  INSERT INTO public.homologacao_etapas (homologacao_id, ordem, chave, nome_exibicao, status)
  VALUES
    (NEW.id, 1, 'fase1_solicitacao_celesc',   '1. Solicitação inicial CELESC',          'pendente'),
    (NEW.id, 2, 'fase2_trt_projeto',          '2. TRT de Projeto',                       'pendente'),
    (NEW.id, 3, 'fase3_montagem_projeto',     '3. Montagem do Projeto (diagrama)',       'pendente'),
    (NEW.id, 4, 'fase4_submissao_celesc',     '4. Submissão à CELESC (aguarda ~15 dias)','pendente'),
    (NEW.id, 5, 'fase5_instalacao',           '5. Instalação (Ordem de Serviço)',        'pendente'),
    (NEW.id, 6, 'fase6_trt_execucao',         '6. TRT de Execução',                      'pendente'),
    (NEW.id, 7, 'fase7_pedido_conexao',       '7. Pedido de Conexão + Ligação',          'pendente');
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_criar_etapas_homologacao ON public.homologacoes;
CREATE TRIGGER trg_criar_etapas_homologacao_v2
AFTER INSERT ON public.homologacoes
FOR EACH ROW EXECUTE FUNCTION public.criar_etapas_homologacao_v2();

-- ═══════════════════════════════════════════════════════════════════
-- View de conveniência: um resumo por homologação com estado das fases
-- ═══════════════════════════════════════════════════════════════════

CREATE OR REPLACE VIEW public.vw_homologacao_fluxo AS
SELECT
  h.id                                             AS homologacao_id,
  h.projeto_id,
  h.status_geral,
  -- Fase 1
  CASE WHEN h.protocolo_celesc IS NOT NULL THEN 'concluido' ELSE 'pendente' END AS f1_status,
  h.protocolo_celesc                               AS f1_protocolo,
  -- Fase 2
  CASE
    WHEN h.trt_projeto_pdf_url IS NOT NULL AND h.trt_projeto_data_emissao IS NOT NULL THEN 'concluido'
    WHEN h.trt_projeto_boleto_url IS NOT NULL THEN 'em_andamento'
    ELSE 'pendente'
  END                                              AS f2_status,
  h.trt_projeto_numero                             AS f2_trt_numero,
  -- Fase 3
  CASE WHEN h.diagrama_unifilar_id IS NOT NULL THEN 'concluido' ELSE 'pendente' END AS f3_status,
  -- Fase 4
  CASE
    WHEN h.data_autorizacao_projeto IS NOT NULL THEN 'concluido'
    WHEN h.data_submissao_projeto IS NOT NULL   THEN 'em_andamento'
    ELSE 'pendente'
  END                                              AS f4_status,
  h.data_submissao_projeto,
  h.data_autorizacao_projeto,
  -- Fase 5
  CASE WHEN h.ordem_servico_id IS NOT NULL THEN 'em_andamento' ELSE 'pendente' END AS f5_status,
  -- Fase 6
  CASE
    WHEN h.trt_execucao_pdf_url IS NOT NULL AND h.trt_execucao_data_emissao IS NOT NULL THEN 'concluido'
    WHEN h.trt_execucao_boleto_url IS NOT NULL THEN 'em_andamento'
    ELSE 'pendente'
  END                                              AS f6_status,
  h.trt_execucao_numero                            AS f6_trt_numero,
  -- Fase 7
  CASE
    WHEN h.data_ligacao IS NOT NULL             THEN 'concluido'
    WHEN h.data_troca_medidor IS NOT NULL       THEN 'em_andamento'
    WHEN h.data_pedido_conexao IS NOT NULL      THEN 'em_andamento'
    ELSE 'pendente'
  END                                              AS f7_status,
  h.data_pedido_conexao,
  h.data_troca_medidor,
  h.data_ligacao,
  h.created_at
FROM public.homologacoes h;

COMMENT ON VIEW public.vw_homologacao_fluxo IS
  'Resumo do fluxo de 7 fases da homologação — usado no dashboard e nas
   queries de contagem por fase. Reforma feita pelo Kalebe em 2026-08-23.';

COMMIT;
