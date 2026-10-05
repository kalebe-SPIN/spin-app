-- ============================================================================
-- Migration 136 — Contas bancárias e cartões no fluxo de caixa
-- ============================================================================
-- Kalebe 2026-10-02:
--  - Cadastro de contas (banco, apelido, final, saldo inicial), cartões de
--    crédito (apelido, final, dia de fechamento e de vencimento) e caixa.
--  - Cada lançamento guarda com o que foi pago (conta_id). Compra no cartão
--    vira saída PREVISTA no vencimento da fatura; ao pagar a fatura, cada item
--    é efetivado e pago_pela_conta_id guarda a conta bancária de onde saiu.
--  - Saldo por conta = saldo inicial + entradas − saídas efetivadas nela.
-- Idempotente.
-- ============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.fluxo_contas (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tipo            text NOT NULL CHECK (tipo IN ('conta_bancaria', 'cartao_credito', 'caixa')),
  nome            text NOT NULL,                 -- apelido: "Itaú PJ", "Nubank PJ"
  banco           text,
  final           text,                          -- últimos 4 dígitos (cartão/conta)
  dia_fechamento  int CHECK (dia_fechamento BETWEEN 1 AND 31),
  dia_vencimento  int CHECK (dia_vencimento BETWEEN 1 AND 31),
  saldo_inicial   numeric(14,2) NOT NULL DEFAULT 0,   -- na data de início do fluxo
  ativo           boolean NOT NULL DEFAULT true,
  criado_em       timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT fluxo_contas_cartao_tem_dias
    CHECK (tipo <> 'cartao_credito' OR (dia_fechamento IS NOT NULL AND dia_vencimento IS NOT NULL))
);

ALTER TABLE public.fluxo_contas ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS fluxo_contas_admin ON public.fluxo_contas;
CREATE POLICY fluxo_contas_admin ON public.fluxo_contas
  FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

ALTER TABLE public.fluxo_lancamentos
  ADD COLUMN IF NOT EXISTS conta_id           uuid REFERENCES public.fluxo_contas(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS pago_pela_conta_id uuid REFERENCES public.fluxo_contas(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_fluxo_lancamentos_conta ON public.fluxo_lancamentos(conta_id);

-- Dinheiro em espécie já fica cadastrado
INSERT INTO public.fluxo_contas (tipo, nome)
SELECT 'caixa', 'Dinheiro / caixa'
WHERE NOT EXISTS (SELECT 1 FROM public.fluxo_contas WHERE tipo = 'caixa');

COMMIT;

-- Conferência
SELECT tipo, nome, ativo FROM public.fluxo_contas ORDER BY tipo, nome;
