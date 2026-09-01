-- Migration 098: coluna sob_cotacao em produtos (Kalebe 2026-09-01)
--
-- Contexto: 34 produtos ativos apareciam sem preço vigente no Pente Fino
-- (câmeras Wi-Fi, sensores, plugues, nobreaks HOME, wallbox WEMOB). Kalebe
-- explicou que esses SKUs vêm na planilha WEG SEM PREÇO — é necessário
-- cotar com o fornecedor caso a caso.
--
-- Solução: marcar automaticamente como sob_cotacao=true no import quando
-- vier sem preço. Assim:
--   - Diagnóstico ignora (não conta como erro)
--   - Gerador de kits ignora (não tenta usar produto sem preço)
--   - Pente Fino tem toggle pra filtrar/mostrar
--   - Consultor sabe que precisa cotar antes de usar

ALTER TABLE public.produtos
  ADD COLUMN IF NOT EXISTS sob_cotacao boolean DEFAULT false;

COMMENT ON COLUMN public.produtos.sob_cotacao IS
  'Produto vem na planilha WEG sem preço definido — exige cotação caso a caso com o fornecedor. Excluído do diagnóstico e do gerador de kits até ter preço.';

-- Backfill retroativo: qualquer produto ativo hoje SEM preço vigente
-- (nem vencido) é marcado como sob_cotacao. Kalebe cadastra manualmente
-- quando cotar.
UPDATE public.produtos p
SET sob_cotacao = true
WHERE p.ativo = true
  AND NOT EXISTS (
    SELECT 1 FROM public.precos_produtos pp
    WHERE pp.produto_id = p.id
      AND pp.preco_venda > 0
  );
