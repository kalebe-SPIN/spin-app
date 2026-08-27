-- ═══════════════════════════════════════════════════════════════════════
-- Migration 089 — Preventivo: criar_etapas_homologacao_v2 vira SECURITY DEFINER
--
-- Contexto: mesma família dos bugs 087/088.
-- Auditoria (2026-08-27) identificou que trg_criar_etapas_homologacao_v2
-- (AFTER INSERT em homologacoes) faz INSERT em homologacao_etapas, que
-- tem RLS restritivo (só admin faz ALL). Hoje NÃO trava porque
-- homologacoes também só permite INSERT a admin — auth do trigger é
-- sempre admin. Mas vira bug ativo assim que abrirmos INSERT de
-- homologacoes pra eletrotécnico/consultor.
--
-- Fix preventivo agora custa 3 linhas e elimina risco futuro.
-- ═══════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.criar_etapas_homologacao_v2()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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
    (NEW.id, 7, 'fase7_pedido_conexao',       '7. Pedido de Conexão + Ligação',          'pendente')
  ON CONFLICT (homologacao_id, ordem) DO NOTHING;
  RETURN NEW;
END;
$$;

-- Trigger permanece igual (não precisa recriar), a função foi trocada.
