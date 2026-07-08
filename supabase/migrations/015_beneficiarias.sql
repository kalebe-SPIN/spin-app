-- =================================================================
-- Migration 015 — Unidades beneficiárias na fatura
-- Adiciona projetos.beneficiarias jsonb
-- Cada beneficiária guarda: UC, titular, análise completa (mesma estrutura da principal)
-- =================================================================

ALTER TABLE public.projetos
ADD COLUMN IF NOT EXISTS beneficiarias jsonb DEFAULT '[]'::jsonb;

COMMENT ON COLUMN public.projetos.beneficiarias IS
'Array de UCs beneficiárias com suas análises Claude completas. Cada item:
{
  ordem: number,
  uc: string,
  titular: string,
  analise: { ...mesma estrutura de analise_fatura },
  cor_grafico: string  // pra distinguir no gráfico
}';
