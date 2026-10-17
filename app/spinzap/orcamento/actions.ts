'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { gravarMensagem } from '@/lib/whatsapp/conversas'
import { enviarPropostaPeloCanalAction } from '@/app/inbox/actions'
import { TEXTOS_LAIS } from '@/lib/whatsapp/lais-textos'
import { revalidatePath } from 'next/cache'

/**
 * Aprovação dos orçamentos da Laís (Kalebe 2026-10-10): o admin confere o
 * resumo, a auditoria e o PDF; aprovando, vai pro cliente pelo mesmo envio
 * de proposta do Spinzap (janela fechada → modelo spin_proposta_pronta; CRM em
 * negociação; follow-up de 1 dia).
 */

async function soAdmin() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data: p } = await supabase.from('profiles').select('role, nome_completo').eq('id', user.id).maybeSingle()
  return p?.role === 'admin' ? { id: user.id, nome: (p.nome_completo as string | null) || 'Admin' } : null
}

export async function aprovarOrcamentoLaisAction(id: string): Promise<{ sucesso: true } | { erro: string }> {
  const quem = await soAdmin()
  if (!quem) return { erro: 'Só o admin aprova orçamento' }
  const admin = createAdminClient()
  const { data: o } = await admin.from('spinzap_orcamentos')
    .select('id, status, conversa_id, contato_id, projeto_id, url_pdf, pv_total, potencia_kwp, orcamento').eq('id', id).maybeSingle()
  if (!o) return { erro: 'Orçamento não encontrado' }
  if (o.status !== 'aguardando_aprovacao') return { erro: 'Esse orçamento já foi decidido' }
  if (!o.projeto_id || !o.url_pdf) return { erro: 'Orçamento sem projeto ou PDF' }

  const { data: ct } = await admin.from('wa_contatos').select('nome_exibicao').eq('id', o.contato_id).maybeSingle()
  const nome = String(ct?.nome_exibicao || '').trim().split(/\s+/)[0]
  const r = await enviarPropostaPeloCanalAction({
    projeto_id: o.projeto_id, url_pdf: o.url_pdf,
    nome_arquivo: 'Orcamento-Spin-Solar.pdf',
    legenda: TEXTOS_LAIS.legendaOrcamento(nome),
  })
  if ('erro' in r) return { erro: r.erro }

  const agora = new Date().toISOString()
  await admin.from('spinzap_orcamentos').update({ status: 'enviado', decidido_em: agora, decidido_por: quem.id }).eq('id', id)
  // Fica no banco de arquivos do lead e no histórico de propostas do projeto
  await admin.from('spinzap_arquivos').insert({
    contato_id: o.contato_id, categoria: 'orcamento', url: o.url_pdf, nome: 'Orçamento (Laís)', mime: 'application/pdf',
    origem: 'gerado', projeto_id: o.projeto_id, criado_por: quem.id,
  })
  await admin.from('projeto_propostas_historico').insert({
    projeto_id: o.projeto_id, url_pdf: o.url_pdf, pv_total: o.pv_total, potencia_cc_kwp: o.potencia_kwp,
    potencia_ca_kw: (o.orcamento as any)?.inversor?.potencia_kw ?? null, modo_composicao: 'orcamento_lais_whatsapp',
    memoria_calculo: (o.orcamento as any)?.interno || null,
  })
  // Valor da proposta no projeto (dashboard: "em negociação", funil)
  const { registrarPropostaNoProjeto } = await import('@/lib/propostas/registrar-no-projeto')
  await registrarPropostaNoProjeto(admin, o.projeto_id, { valor: Number(o.pv_total) || 0, url_pdf: o.url_pdf })
  // Roteiro da Laís: orçamento entregue → o consultor/equipe segue a negociação
  const { data: conv } = await admin.from('wa_conversas').select('contexto_qualificacao').eq('id', o.conversa_id).maybeSingle()
  const ctx = ((conv as any)?.contexto_qualificacao || {}) as Record<string, any>
  await admin.from('wa_conversas').update({
    contexto_qualificacao: { ...ctx, roteiro: { ...(ctx.roteiro || {}), passo: 'concluido' } },
    etapa: 'negocio_andamento', etapa_em: agora,
  }).eq('id', o.conversa_id)
  await gravarMensagem(admin, {
    conversa_id: o.conversa_id, direcao: 'outbound', tipo: 'system',
    texto: `✅ ${quem.nome.split(' ')[0]} aprovou o orçamento da Laís — PDF enviado ao cliente.`,
    remetente_id: quem.id, origem_agente_nome: 'Spinzap', status_entrega: 'enviada',
  })
  revalidatePath('/spinzap')
  return { sucesso: true }
}

export async function recusarOrcamentoLaisAction(id: string, motivo: string): Promise<{ sucesso: true } | { erro: string }> {
  const quem = await soAdmin()
  if (!quem) return { erro: 'Só o admin decide o orçamento' }
  const texto = String(motivo || '').trim()
  if (texto.length < 3) return { erro: 'Diga o motivo (vai pro histórico da conversa)' }
  const admin = createAdminClient()
  const { data: o } = await admin.from('spinzap_orcamentos').select('id, status, conversa_id').eq('id', id).maybeSingle()
  if (!o) return { erro: 'Orçamento não encontrado' }
  if (o.status !== 'aguardando_aprovacao') return { erro: 'Esse orçamento já foi decidido' }
  await admin.from('spinzap_orcamentos').update({
    status: 'recusado', decidido_em: new Date().toISOString(), decidido_por: quem.id, motivo_recusa: texto.slice(0, 500),
  }).eq('id', id)
  // A equipe assume a conversa (a Laís não manda nada sobre o orçamento)
  const { data: conv } = await admin.from('wa_conversas').select('contexto_qualificacao').eq('id', o.conversa_id).maybeSingle()
  const ctx = ((conv as any)?.contexto_qualificacao || {}) as Record<string, any>
  await admin.from('wa_conversas').update({
    contexto_qualificacao: { ...ctx, roteiro: { ...(ctx.roteiro || {}), passo: 'concluido' } },
    status: 'em_atendimento', agente_ativo: null,
  }).eq('id', o.conversa_id)
  await gravarMensagem(admin, {
    conversa_id: o.conversa_id, direcao: 'outbound', tipo: 'system',
    texto: `✋ ${quem.nome.split(' ')[0]} segurou o orçamento da Laís: ${texto.slice(0, 300)}`,
    remetente_id: quem.id, origem_agente_nome: 'Spinzap', status_entrega: 'enviada',
  })
  revalidatePath('/spinzap')
  return { sucesso: true }
}
