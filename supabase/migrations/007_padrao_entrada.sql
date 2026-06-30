-- =================================================================
-- Migration 007 — Padrão de entrada CELESC
-- Adiciona coluna JSONB pra armazenar dados do padrão elétrico
-- =================================================================

ALTER TABLE public.projetos
ADD COLUMN IF NOT EXISTS padrao_entrada jsonb;

-- Estrutura esperada do JSON:
-- {
--   "tipo_ligacao": "monofasico" | "bifasico" | "trifasico",
--   "tensao_fornecimento": "127_220" | "220_380",
--   "amperagem_disjuntor_geral_a": 50 | 70 | 100 | 200 | 400 | 800,
--   "medidor_bidirecional": boolean,
--   "tem_cabine_primaria": boolean,
--   "qgbt_tem_espaco_disjuntor_solar": boolean,
--   "qgbt_marca_modelo": "string",
--   "qtd_hastes_aterramento": number,
--   "hastes_interligadas": boolean,
--   "tem_spda": boolean,
--   "distancia_string_qgbt_m": number,
--   "altura_padrao_entrada_m": number,
--   "observacoes": "string"
-- }
