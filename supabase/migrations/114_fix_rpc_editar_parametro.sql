-- ============================================================================
-- Migration 114 — Blinda editar_parametro_precificacao contra duplicidade
-- ============================================================================
-- Kalebe 2026-09-18: o painel /admin/precificacao/fotovoltaico deixou de
-- persistir edições. Causas encontradas:
--
-- 1) UNIQUE(chave, vigente_de) na tabela + INSERT com DEFAULT current_date:
--    se o admin edita a MESMA chave 2× no mesmo dia, o segundo INSERT viola
--    o UNIQUE e a RPC quebra silenciosamente (client vê error.message mas
--    a UI só mostra "Salvo" quando 'erro' não está na resposta — em alguns
--    fluxos o erro passava batido). Solução: na segunda edição do dia, faz
--    UPDATE do registro em vez de INSERT.
--
-- 2) Duplicatas vigentes (rows com vigente_ate IS NULL pra mesma chave):
--    podem existir por rodadas repetidas de mig 004/059/113 em datas
--    distintas. O SELECT do painel pega uma; o UPDATE da RPC encerra TODAS
--    (correto), mas se a UI sempre lê a PRIMEIRA por sort de created_at,
--    pode parecer que a edição não pegou (era outro registro vigente que
--    sobreviveu). Solução (2a) faz cleanup: mantém só a mais recente
--    vigente por chave.
--
-- Idempotente — pode rodar múltiplas vezes.
-- ============================================================================

BEGIN;

-- ═════════════════════════════════════════════════════════════════════════════
-- 1. CLEANUP: encerra duplicatas vigentes, mantém só a mais recente
-- ═════════════════════════════════════════════════════════════════════════════

WITH ranked AS (
  SELECT id,
         row_number() OVER (PARTITION BY chave ORDER BY created_at DESC, vigente_de DESC) AS rn
  FROM public.parametros_precificacao
  WHERE vigente_ate IS NULL
)
UPDATE public.parametros_precificacao p
SET vigente_ate = current_date - 1,
    motivo_alteracao = coalesce(motivo_alteracao, '') ||
      ' [auto-encerrado em 2026-09-18: duplicata vigente — mig 114]'
FROM ranked r
WHERE p.id = r.id
  AND r.rn > 1;

-- ═════════════════════════════════════════════════════════════════════════════
-- 2. RPC nova — mesmo contrato, mas idempotente no dia + retorna valor final
-- ═════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.editar_parametro_precificacao(
  p_chave text,
  p_valor_numero numeric DEFAULT NULL,
  p_valor_texto text DEFAULT NULL,
  p_valor_json jsonb DEFAULT NULL,
  p_motivo text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_param record;
  v_valor_antigo jsonb;
  v_valor_novo jsonb;
  v_existente_hoje uuid;
BEGIN
  -- Só admin
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Permissão negada — apenas admin pode editar parâmetros';
  END IF;

  -- Motivo obrigatório
  IF p_motivo IS NULL OR length(p_motivo) < 10 THEN
    RAISE EXCEPTION 'Motivo da alteração obrigatório (mín 10 chars)';
  END IF;

  -- Buscar vigente (deve ser só 1 após cleanup)
  SELECT * INTO v_param FROM public.parametros_precificacao
  WHERE chave = p_chave AND vigente_ate IS NULL
  ORDER BY created_at DESC
  LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Parâmetro % não encontrado (nenhum vigente)', p_chave;
  END IF;

  -- Snapshots pro log
  v_valor_antigo := jsonb_build_object(
    'valor_numero', v_param.valor_numero,
    'valor_texto', v_param.valor_texto,
    'valor_json', v_param.valor_json
  );
  v_valor_novo := jsonb_build_object(
    'valor_numero', p_valor_numero,
    'valor_texto', p_valor_texto,
    'valor_json', p_valor_json
  );

  -- Log SEMPRE (mesmo edição repetida no dia)
  INSERT INTO public.parametros_precificacao_log
    (parametro_chave, valor_anterior, valor_novo, motivo, usuario_id)
  VALUES
    (p_chave, v_valor_antigo, v_valor_novo, p_motivo, auth.uid());

  -- CENÁRIO A: já foi editado hoje (existe row com vigente_de = hoje).
  -- Faz UPDATE no lugar de INSERT (senão UNIQUE(chave, vigente_de) explode).
  SELECT id INTO v_existente_hoje FROM public.parametros_precificacao
  WHERE chave = p_chave
    AND vigente_de = current_date
    AND vigente_ate IS NULL
  LIMIT 1;

  IF v_existente_hoje IS NOT NULL THEN
    UPDATE public.parametros_precificacao
    SET valor_numero = p_valor_numero,
        valor_texto = p_valor_texto,
        valor_json = p_valor_json,
        alterado_por = auth.uid(),
        motivo_alteracao = p_motivo,
        created_at = now()
    WHERE id = v_existente_hoje;
  ELSE
    -- CENÁRIO B: edição em novo dia. Encerra vigente atual + insere novo.
    UPDATE public.parametros_precificacao
    SET vigente_ate = current_date - 1
    WHERE chave = p_chave AND vigente_ate IS NULL;

    INSERT INTO public.parametros_precificacao
      (grupo, chave, descricao, valor_numero, valor_texto, valor_json,
       unidade, valor_minimo, valor_maximo, requer_aprovacao_kalebe,
       alterado_por, motivo_alteracao, vigente_de)
    VALUES
      (v_param.grupo, p_chave, v_param.descricao,
       p_valor_numero, p_valor_texto, p_valor_json,
       v_param.unidade, v_param.valor_minimo, v_param.valor_maximo,
       v_param.requer_aprovacao_kalebe,
       auth.uid(), p_motivo, current_date);
  END IF;

  -- Retorna o valor FINAL persistido (client pode conferir sem precisar re-fetch)
  SELECT * INTO v_param FROM public.parametros_precificacao
  WHERE chave = p_chave AND vigente_ate IS NULL
  ORDER BY created_at DESC
  LIMIT 1;

  RETURN jsonb_build_object(
    'sucesso', true,
    'parametro', p_chave,
    'valor_numero', v_param.valor_numero,
    'valor_texto', v_param.valor_texto,
    'valor_json', v_param.valor_json,
    'vigente_de', v_param.vigente_de
  );
END;
$$;

COMMIT;
