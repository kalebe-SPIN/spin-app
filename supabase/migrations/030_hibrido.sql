-- ============================================================================
-- Migration 030: Fundação Sistema Híbrido com Armazenamento (BESS)
-- ============================================================================
-- Baseado nas regras Kalebe:
--   • Inversores híbridos: SIW400H (tri) / SIW200H (mono)
--   • Baterias: SBW CB050 W00 (5kWh) / SBW CB100 W00 (10kWh)
--   • Multimedidor: OBRIGATORIO (queda de energia → off-grid)
--   • Caixa junção JBW 41DC 50A W0: até 4 baterias por entrada
--   • Controlador paralelismo: peak shaving + demanda extra
--
-- Definição de demanda (3 métodos):
--   1. Memória de massa (Excel CELESC)
--   2. Análise de rede com equipamento (Excel)
--   3. Levantamento de carga por listagem (menos indicado)
-- ============================================================================

-- Análise de demanda + carga crítica pra dimensionar híbrido
CREATE TABLE IF NOT EXISTS public.projeto_hibrido_analise (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  projeto_id uuid NOT NULL REFERENCES public.projetos(id) ON DELETE CASCADE,
  item_id uuid REFERENCES public.projeto_itens(id) ON DELETE CASCADE,  -- item específico

  -- Método de definição da demanda
  metodo_demanda text NOT NULL CHECK (
    metodo_demanda IN ('memoria_massa', 'analise_rede_medido', 'levantamento_listagem')
  ),

  -- Arquivo da análise (Excel ou Google Sheets)
  arquivo_url text,
  arquivo_nome text,
  arquivo_tamanho_bytes bigint,
  arquivo_tipo text,  -- 'xlsx' | 'ods' | 'csv' | 'gsheet_url'

  -- Análise consolidada (preenchida pela IA)
  demanda_media_kw numeric(10,2),
  demanda_pico_kw numeric(10,2),
  demanda_carga_critica_kw numeric(10,2),  -- a que precisa no backup
  autonomia_desejada_horas numeric(4,1),   -- horas de autonomia da carga crítica

  -- Fator de uso da bateria
  cargas_criticas jsonb DEFAULT '[]'::jsonb,  -- [{nome, potencia_w, horas_dia}]

  -- Análise IA (Mestre da Elétrica)
  resumo_analise_ia text,
  pontos_criticos_ia jsonb DEFAULT '[]'::jsonb,  -- [{titulo, detalhe, severidade}]
  recomendacao_ia text,

  -- Estratégia do sistema
  usar_peak_shaving boolean DEFAULT false,
  usar_complementacao_demanda boolean DEFAULT false,
  usar_backup_carga_critica boolean DEFAULT true,

  observacoes text,
  criado_por uuid REFERENCES public.profiles(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_hibrido_analise_projeto ON public.projeto_hibrido_analise(projeto_id);
CREATE INDEX IF NOT EXISTS idx_hibrido_analise_item ON public.projeto_hibrido_analise(item_id);

-- Dimensionamento do sistema híbrido (calculado)
CREATE TABLE IF NOT EXISTS public.projeto_hibrido_dimensionamento (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  projeto_id uuid NOT NULL REFERENCES public.projetos(id) ON DELETE CASCADE,
  item_id uuid REFERENCES public.projeto_itens(id) ON DELETE CASCADE,

  -- Inversor(es) sugeridos
  inversor_modelo text,           -- SIW400H ou SIW200H
  inversor_potencia_kw numeric(6,2),
  inversor_qtd int DEFAULT 1,
  usa_paralelismo boolean DEFAULT false,  -- true se >1 inversor

  -- Baterias
  bateria_modelo text,             -- SBW CB050 W00 ou SBW CB100 W00
  bateria_capacidade_kwh numeric(6,2),
  bateria_qtd int DEFAULT 1,
  capacidade_total_kwh numeric(10,2),
  autonomia_calculada_horas numeric(4,1),

  -- Componentes obrigatórios/opcionais
  qtd_multimedidor int DEFAULT 1,       -- sempre 1
  qtd_caixa_juncao_jbw int DEFAULT 0,   -- 1 pra cada 4 baterias por entrada
  usa_controlador_paralelismo boolean DEFAULT false,  -- se >1 inversor

  -- Estimativas
  valor_hardware_estimado numeric(12,2),
  observacoes text,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_hibrido_dim_projeto ON public.projeto_hibrido_dimensionamento(projeto_id);

-- Bucket pra arquivos de análise de demanda
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'analise-demanda',
  'analise-demanda',
  false,  -- privado (contém dados do cliente)
  20971520,  -- 20MB
  ARRAY[
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.oasis.opendocument.spreadsheet',
    'text/csv',
    'application/pdf'
  ]
)
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- RLS
ALTER TABLE public.projeto_hibrido_analise ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.projeto_hibrido_dimensionamento ENABLE ROW LEVEL SECURITY;

CREATE POLICY "hibrido_analise_projeto" ON public.projeto_hibrido_analise
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.projetos p
      WHERE p.id = projeto_id AND (p.consultor_id = auth.uid() OR public.is_admin())
    )
  );

CREATE POLICY "hibrido_dim_projeto" ON public.projeto_hibrido_dimensionamento
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.projetos p
      WHERE p.id = projeto_id AND (p.consultor_id = auth.uid() OR public.is_admin())
    )
  );

-- Storage RLS
DROP POLICY IF EXISTS "analise_demanda_upload" ON storage.objects;
CREATE POLICY "analise_demanda_upload" ON storage.objects
  FOR INSERT WITH CHECK (bucket_id = 'analise-demanda' AND auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "analise_demanda_read" ON storage.objects;
CREATE POLICY "analise_demanda_read" ON storage.objects
  FOR SELECT USING (bucket_id = 'analise-demanda' AND auth.uid() IS NOT NULL);
