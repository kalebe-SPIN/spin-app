import type { createAdminClient } from '@/lib/supabase/admin'

/**
 * Proposta gerada no Spinzap → projeto e dashboard (Kalebe 2026-10-17: "ao
 * enviar uma proposta no Spinzap já ser considerado lead em negociação e
 * sincronizar com o dashboard").
 *
 * O dashboard lê o valor de projetos.pv_total (senão orcamento_consolidado /
 * orcamento_final). As propostas do Spinzap não tinham orcamento_final, então
 * os projetos ficavam com valor vazio (R$ 0 em "Em negociação"). Aqui:
 *  - grava o valor da proposta em pv_total e orcamento_consolidado.pv_total
 *  - status sobe pra "orçamento gerado" se ainda estava antes disso
 *    (enviar no WhatsApp leva pra "negociando" — app/inbox/actions.ts)
 * Venda já fechada não é tocada (o valor dela é o da venda).
 */

type Admin = ReturnType<typeof createAdminClient>

const ANTES_DO_ORCAMENTO = ['rascunho', 'fatura_analisada', 'telhado_preenchido', 'dimensionado', 'kit_selecionado', 'lista_ca_confirmada']
const FECHADOS = ['vendido', 'aceito', 'em_homologacao', 'em_execucao', 'instalado', 'ativo_pos_venda']

export async function registrarPropostaNoProjeto(admin: Admin, projetoId: string, a: { valor: number; url_pdf?: string | null }) {
  try {
    const valor = Math.round((Number(a.valor) || 0) * 100) / 100
    if (!(valor > 0)) return
    const { data } = await admin.from('projetos').select('status, orcamento_consolidado').eq('id', projetoId).maybeSingle()
    const p = data as any
    if (!p || FECHADOS.includes(String(p.status))) return
    const patch: Record<string, any> = {
      pv_total: valor,
      orcamento_consolidado: { ...(p.orcamento_consolidado || {}), pv_total: valor },
      data_orcamento_gerado: new Date().toISOString(),
      ...(a.url_pdf ? { url_pdf_proposta: a.url_pdf } : {}),
    }
    // O gatilho de status registra o histórico (projeto_status_historico)
    if (ANTES_DO_ORCAMENTO.includes(String(p.status))) patch.status = 'orcamento_gerado'
    let { error } = await admin.from('projetos').update(patch).eq('id', projetoId)
    // Banco sem alguma coluna opcional: grava o essencial
    if (error && /data_orcamento_gerado|url_pdf_proposta/.test(error.message)) {
      const { data_orcamento_gerado, url_pdf_proposta, ...resto } = patch
      void data_orcamento_gerado; void url_pdf_proposta
      ;({ error } = await admin.from('projetos').update(resto).eq('id', projetoId))
    }
    if (error) console.error('[registrarPropostaNoProjeto]', error.message)
  } catch (e) {
    console.error('[registrarPropostaNoProjeto]', e)
  }
}
