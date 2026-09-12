-- Migration 107: vendas manuais lançadas pelo admin
--
-- Kalebe 2026-09-11: 'quero que o admin possa cadastrar e descadastrar
-- vendas e isso ser consolidado automaticamente no painel'.
--
-- Uso: venda que fechou fora do fluxo normal (offline, WhatsApp, evento,
-- balcão) e não gerou projeto/execução formal. Admin lança à mão pra
-- entrar no faturamento consolidado do mês.
--
-- Categoria diz onde a venda soma no painel:
--   'fv'      → Composição das vendas FV (bloco esquerdo)
--   'servico' → Demais serviços do mês (bloco direito)

CREATE TABLE IF NOT EXISTS public.vendas_manuais (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Cliente (livre — não amarra a clientes cadastrados)
  cliente_nome      text NOT NULL,
  cliente_documento text,

  -- Categorização
  categoria         text NOT NULL CHECK (categoria IN ('fv', 'servico')),
  tipo_detalhado    text,  -- 'on_grid'|'hibrido'|'bess_puro' pra fv;
                            -- 'srv_limpeza'|'srv_revisao'|'srv_om'|... pra serviço

  -- Valores
  valor_venda       numeric(12,2) NOT NULL CHECK (valor_venda >= 0),
  custo_estimado    numeric(12,2) NOT NULL DEFAULT 0 CHECK (custo_estimado >= 0),
  -- margem = valor_venda − custo_estimado (calculada no app; não é coluna)

  -- Contexto
  data_venda        date NOT NULL DEFAULT CURRENT_DATE,
  vendedor_id       uuid REFERENCES auth.users(id),  -- opcional: consultor que atendeu
  observacao        text,

  -- Auditoria + soft delete (mesma convenção das outras tabelas)
  criada_por        uuid NOT NULL REFERENCES auth.users(id),
  criada_em         timestamptz NOT NULL DEFAULT now(),
  deletada_em       timestamptz,
  deletada_por      uuid REFERENCES auth.users(id)
);

COMMENT ON TABLE public.vendas_manuais IS
  'Vendas lançadas manualmente pelo admin (fora do fluxo de projetos/execuções).';
COMMENT ON COLUMN public.vendas_manuais.categoria IS
  'fv = soma no bloco Composição FV; servico = soma no bloco Demais Serviços.';

CREATE INDEX IF NOT EXISTS idx_vendas_manuais_data
  ON public.vendas_manuais(data_venda) WHERE deletada_em IS NULL;
CREATE INDEX IF NOT EXISTS idx_vendas_manuais_categoria
  ON public.vendas_manuais(categoria) WHERE deletada_em IS NULL;

-- RLS
ALTER TABLE public.vendas_manuais ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS vendas_manuais_admin_read ON public.vendas_manuais;
CREATE POLICY vendas_manuais_admin_read ON public.vendas_manuais
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

DROP POLICY IF EXISTS vendas_manuais_admin_write ON public.vendas_manuais;
CREATE POLICY vendas_manuais_admin_write ON public.vendas_manuais
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

DROP POLICY IF EXISTS vendas_manuais_admin_update ON public.vendas_manuais;
CREATE POLICY vendas_manuais_admin_update ON public.vendas_manuais
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- Realtime — painel se atualiza sozinho quando admin cadastra/descadastra
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'vendas_manuais'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.vendas_manuais;
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
