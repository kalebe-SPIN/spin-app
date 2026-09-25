-- Kalebe 2026-09-25: política de retenção de arquivos.
-- Todo arquivo de cliente fica no máximo 180 dias a contar da criação.
-- Passado o prazo ele é apagado, EXCETO se o cliente fechou negócio
-- (algum projeto vendido ou adiante) — aí fica pra sempre.
-- Arquivos da empresa (logo, assinatura, datasheets, catálogo WEG, imagens
-- de produto, criativos, documentos de candidatos) nunca entram na regra:
-- a lista de pastas vem do código (lib/retencao/arquivos.ts).
-- Só o ARQUIVO sai; mensagem, projeto e histórico continuam no banco.

-- 1) Marcas de "arquivo removido" — a tela explica em vez de link quebrado
ALTER TABLE public.wa_mensagens
  ADD COLUMN IF NOT EXISTS midia_expirada_em timestamptz;
ALTER TABLE public.projeto_propostas_historico
  ADD COLUMN IF NOT EXISTS arquivo_expirado_em timestamptz;

-- 2) Registro do que foi apagado
CREATE TABLE IF NOT EXISTS public.arquivos_expurgados (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bucket_id     text NOT NULL,
  nome          text NOT NULL,
  bytes         bigint,
  criado_em     timestamptz,
  expurgado_em  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_arquivos_expurgados_data
  ON public.arquivos_expurgados(expurgado_em DESC);
ALTER TABLE public.arquivos_expurgados ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "arquivos_expurgados_admin_read" ON public.arquivos_expurgados;
CREATE POLICY "arquivos_expurgados_admin_read" ON public.arquivos_expurgados
  FOR SELECT USING (public.is_admin());
-- INSERT só via service_role (cron de retenção)

-- 3) Normalizadores pra casar cliente por telefone (8 últimos dígitos) e CPF/CNPJ
CREATE OR REPLACE FUNCTION public.retencao_tel8(t text)
RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE WHEN length(d) >= 8 THEN right(d, 8) END
  FROM (SELECT regexp_replace(coalesce(t, ''), '\D', '', 'g') AS d) x
$$;

CREATE OR REPLACE FUNCTION public.retencao_doc(t text)
RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE WHEN length(d) >= 11 THEN d END
  FROM (SELECT regexp_replace(coalesce(t, ''), '\D', '', 'g') AS d) x
$$;

-- 4) Arquivos vencidos e SEM proteção.
-- Protegido = pertence a cliente que fechou negócio, por qualquer um dos caminhos:
--   • pasta/prefixo do arquivo é o id de projeto, cliente, telhado ou homologação protegido
--   • o endereço do arquivo aparece no cadastro de projeto/cliente/telhado protegido,
--     em qualquer homologação, ou no histórico de propostas de projeto protegido
--   • é mídia do WhatsApp de contato ligado a cliente que fechou
-- p_referencia permite simular datas futuras (tela do admin: "vencem em 30 dias").
CREATE OR REPLACE FUNCTION public.arquivos_retencao_candidatos(
  p_buckets     text[],
  p_dias        int DEFAULT 180,
  p_referencia  timestamptz DEFAULT now(),
  p_limite      int DEFAULT 1000
)
RETURNS TABLE (bucket_id text, nome text, bytes bigint, criado_em timestamptz)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, storage, pg_temp
AS $$
WITH
fech AS (
  SELECT p.id, p.cliente_id,
         public.retencao_doc(p.cliente_cpf_cnpj) AS doc,
         public.retencao_tel8(p.cliente_telefone) AS tel
  FROM public.projetos p
  WHERE p.status::text IN ('vendido', 'aceito', 'em_homologacao', 'em_execucao', 'instalado', 'ativo_pos_venda')
    AND p.excluida_em IS NULL
),
cli_fech AS (
  SELECT c.id,
         public.retencao_doc(c.cpf_cnpj) AS doc,
         public.retencao_tel8(c.telefone) AS tel,
         public.retencao_tel8(c.whatsapp) AS tel2
  FROM public.clientes c
  WHERE c.id IN (SELECT f.cliente_id FROM fech f WHERE f.cliente_id IS NOT NULL)
     OR public.retencao_doc(c.cpf_cnpj) IN (SELECT f.doc FROM fech f WHERE f.doc IS NOT NULL)
),
docs AS (
  SELECT doc FROM fech WHERE doc IS NOT NULL
  UNION SELECT doc FROM cli_fech WHERE doc IS NOT NULL
),
tels AS (
  SELECT tel FROM fech WHERE tel IS NOT NULL
  UNION SELECT tel FROM cli_fech WHERE tel IS NOT NULL
  UNION SELECT tel2 FROM cli_fech WHERE tel2 IS NOT NULL
),
proj_prot AS (
  SELECT p.id FROM public.projetos p
  WHERE p.id IN (SELECT id FROM fech)
     OR p.cliente_id IN (SELECT id FROM cli_fech)
     OR public.retencao_doc(p.cliente_cpf_cnpj) IN (SELECT doc FROM docs)
     OR public.retencao_tel8(p.cliente_telefone) IN (SELECT tel FROM tels)
),
telh_prot AS (
  SELECT t.id FROM public.telhados t
  WHERE t.fase::text = 'fechado'
     OR t.projeto_id IN (SELECT id FROM proj_prot)
     OR public.retencao_tel8(t.cliente_telefone) IN (SELECT tel FROM tels)
),
cont_prot AS (
  SELECT wc.id FROM public.wa_contatos wc
  WHERE wc.projeto_id IN (SELECT id FROM proj_prot)
     OR wc.cliente_id IN (SELECT id FROM cli_fech)
     OR public.retencao_tel8(wc.telefone) IN (SELECT tel FROM tels)
),
ids_prot AS (
  SELECT id::text AS id FROM proj_prot
  UNION SELECT id::text FROM cli_fech
  UNION SELECT id::text FROM telh_prot
  UNION SELECT h.id::text FROM public.homologacoes h
  UNION SELECT h.projeto_id::text FROM public.homologacoes h WHERE h.projeto_id IS NOT NULL
),
cand AS (
  SELECT o.bucket_id, o.name, (o.metadata->>'size')::bigint AS bytes, o.created_at
  FROM storage.objects o
  WHERE o.bucket_id = ANY (p_buckets)
    AND o.created_at < p_referencia - make_interval(days => p_dias)
    AND o.name NOT LIKE '%.emptyFolderPlaceholder'
)
SELECT c.bucket_id, c.name, c.bytes, c.created_at
FROM cand c
WHERE NOT EXISTS (
    SELECT 1 FROM ids_prot i
    WHERE i.id = split_part(c.name, '/', 1) OR i.id = left(c.name, 36)
  )
  AND NOT EXISTS (
    SELECT 1
    FROM public.wa_mensagens m
    JOIN public.wa_conversas cv ON cv.id = m.conversa_id
    WHERE c.bucket_id = 'wa_midia'
      AND m.midia_url LIKE '%/wa_midia/' || c.name
      AND cv.contato_id IN (SELECT id FROM cont_prot)
  )
  AND NOT EXISTS (
    SELECT 1 FROM public.projetos p
    WHERE p.id IN (SELECT id FROM proj_prot) AND strpos(p::text, c.name) > 0
  )
  AND NOT EXISTS (
    SELECT 1 FROM public.clientes cl
    WHERE cl.id IN (SELECT id FROM cli_fech) AND strpos(cl::text, c.name) > 0
  )
  AND NOT EXISTS (
    SELECT 1 FROM public.telhados t
    WHERE t.id IN (SELECT id FROM telh_prot) AND strpos(t::text, c.name) > 0
  )
  AND NOT EXISTS (
    SELECT 1 FROM public.homologacoes h WHERE strpos(h::text, c.name) > 0
  )
  AND NOT EXISTS (
    SELECT 1 FROM public.projeto_propostas_historico ph
    WHERE ph.projeto_id IN (SELECT id FROM proj_prot) AND strpos(ph.url_pdf, c.name) > 0
  )
ORDER BY c.created_at
LIMIT p_limite
$$;

-- 5) Uso por pasta (tela do admin)
CREATE OR REPLACE FUNCTION public.arquivos_uso_por_bucket()
RETURNS TABLE (bucket_id text, arquivos bigint, bytes bigint, mais_antigo timestamptz)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = storage, pg_temp
AS $$
  SELECT o.bucket_id, count(*), coalesce(sum((o.metadata->>'size')::bigint), 0)::bigint, min(o.created_at)
  FROM storage.objects o
  WHERE o.name NOT LIKE '%.emptyFolderPlaceholder'
  GROUP BY o.bucket_id
  ORDER BY 3 DESC
$$;

-- Só o servidor (service_role) chama
REVOKE ALL ON FUNCTION public.arquivos_retencao_candidatos(text[], int, timestamptz, int) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.arquivos_uso_por_bucket() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.arquivos_retencao_candidatos(text[], int, timestamptz, int) TO service_role;
GRANT EXECUTE ON FUNCTION public.arquivos_uso_por_bucket() TO service_role;

-- Conferência: quantos arquivos venceriam HOJE (esperado: 0 — o mais antigo é de jul/2026)
SELECT count(*) AS vencidos_hoje
FROM public.arquivos_retencao_candidatos(
  ARRAY['wa_midia','faturas','propostas-pdf','propostas-menu','propostas-servicos',
        'projetos-diagramas','homologacao-arquivos','homologacao-consultor',
        'analise-demanda','telhado-satelite','telhados-fotos','telhado-registros']
);
