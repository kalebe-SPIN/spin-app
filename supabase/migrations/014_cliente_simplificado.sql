-- =================================================================
-- Migration 014 — Cliente simplificado
-- Torna nullable colunas que agora são preenchidas em passos posteriores:
--   - uc_geradora (vem no Passo 2 Fatura)
--   - tipo_projeto (vem no Passo 6 Kit)
--   - cliente_endereco (vem no Passo 3 Telhado ou análise fatura)
--
-- Passo 1 agora coleta APENAS dados de contato:
--   razão social, CPF/CNPJ, WhatsApp, email, observações
-- =================================================================

ALTER TABLE public.projetos ALTER COLUMN uc_geradora DROP NOT NULL;
ALTER TABLE public.projetos ALTER COLUMN tipo_projeto DROP NOT NULL;

-- Se motivacao_cliente ainda existir (mesmo desusada), permite null
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'projetos'
      AND column_name = 'motivacao_cliente'
      AND is_nullable = 'NO'
  ) THEN
    ALTER TABLE public.projetos ALTER COLUMN motivacao_cliente DROP NOT NULL;
  END IF;
END $$;

COMMENT ON COLUMN public.projetos.uc_geradora IS
'UC principal da CELESC. Preenchida no Passo 2 (Fatura) após análise IA. Pode ser null enquanto rascunho.';

COMMENT ON COLUMN public.projetos.tipo_projeto IS
'Categoria: ongrid | hibrido_bess | offgrid. Preenchida no Passo 6 (Kit) quando consultor escolhe categoria. Pode ser null enquanto rascunho.';
