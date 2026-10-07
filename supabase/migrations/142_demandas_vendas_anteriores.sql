-- ============================================================================
-- Migration 142 — Demandas do campo dos serviços vendidos antes do painel
-- ============================================================================
-- Kalebe 2026-10-07: a tabela de execuções nasceu vazia (a 053 nunca tinha
-- rodado), então os projetos já vendidos não tinham demanda no campo. Cria
-- uma por serviço vendido (menos venda de equipamentos), com cliente,
-- telefone e endereço do projeto, como AGUARDANDO LIBERAÇÃO DO ADMIN.
-- No /campo o admin libera o que falta fazer e dá baixa ("Já foi feito" /
-- "Cancelar") no que já foi executado.
-- Idempotente: só cria pra serviço que ainda não tem demanda.
-- ============================================================================

BEGIN;

INSERT INTO public.execucoes_servicos (
  projeto_id, item_id, tipo_servico, titulo, valor_contratado, status, origem,
  cliente_nome, contato_telefone, endereco, cidade, bairro, endereco_execucao
)
SELECT
  p.id,
  i.id,
  i.tipo,
  COALESCE(NULLIF(i.titulo, ''), i.tipo::text) || ' — ' || COALESCE(p.cliente_razao_social, 'cliente'),
  i.valor_estimado,
  'aguardando_pre_requisitos',
  'projeto',
  p.cliente_razao_social,
  p.cliente_telefone,
  e.endereco,
  NULLIF(trim(e.endereco->>'cidade'), ''),
  NULLIF(trim(e.endereco->>'bairro'), ''),
  NULLIF(concat_ws(' · ',
    NULLIF(concat_ws(', ', COALESCE(e.endereco->>'logradouro', e.endereco->>'rua'), e.endereco->>'numero'), ''),
    NULLIF(e.endereco->>'bairro', ''),
    NULLIF(concat_ws('/', e.endereco->>'cidade', e.endereco->>'uf'), '')
  ), '')
FROM public.projetos p
JOIN public.projeto_itens i ON i.projeto_id = p.id
CROSS JOIN LATERAL (
  SELECT COALESCE(NULLIF(p.endereco_instalacao, '{}'::jsonb), p.cliente_endereco) AS endereco
) e
WHERE p.excluida_em IS NULL
  AND p.status::text IN ('vendido', 'aceito', 'em_homologacao', 'em_execucao', 'instalado', 'ativo_pos_venda')
  AND (i.status IS NULL OR i.status::text <> 'removido')
  AND i.tipo::text <> 'venda_equipamentos'
  AND NOT EXISTS (SELECT 1 FROM public.execucoes_servicos x WHERE x.item_id = i.id);

COMMIT;

-- Conferência: demandas por situação (hoje entram 23 em aguardando_pre_requisitos)
SELECT status, count(*) AS qtd, count(cidade) AS com_cidade
FROM public.execucoes_servicos GROUP BY status ORDER BY status;
