import type { createAdminClient } from '@/lib/supabase/admin'
import { avisarUsuario } from '@/lib/agentes/diretorio'
import { URL_PORTAL } from '@/lib/agentes/nomes'
import { montarOrcamentoLead, type EntradaOrcamentoLead, type OrcamentoLead } from './orcamento-lead'
import { auditarOrcamentoLead } from './auditor-orcamento'
import { gerarPdfOrcamento } from './pdf-orcamento'
import { PERFIL_VAZIO, type PerfilLead } from './perfil'

/**
 * Orçamento da Laís de ponta a ponta (Kalebe 2026-10-10): "sistema monta o
 * orçamento → auditor audita cadastro × orçamento, aplica conformidade técnica
 * e normativa → aprova → Laís envia o PDF". O envio pro cliente passa pela
 * aprovação do admin (link no aviso) — spinzap_orcamentos (mig 150).
 */

type Admin = ReturnType<typeof createAdminClient>
const reais = (n: number) => `R$ ${n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

async function imagemComoDataUrl(url: string | null | undefined): Promise<string | null> {
  if (!url) return null
  try {
    const r = await fetch(url)
    if (!r.ok) return null
    const tipo = (r.headers.get('content-type') || '').split(';')[0]
    if (!/^image\/(png|jpe?g)$/i.test(tipo)) return null
    return `data:${tipo};base64,${Buffer.from(await r.arrayBuffer()).toString('base64')}`
  } catch { return null }
}

export async function carregarPerfil(admin: Admin, contatoId: string): Promise<PerfilLead> {
  const { data } = await admin.from('spinzap_perfis').select('*').eq('contato_id', contatoId).maybeSingle()
  if (!data) return structuredClone(PERFIL_VAZIO)
  const d = data as any
  return { contato: d.contato || {}, infra_civil: d.infra_civil || {}, infra_eletrica: d.infra_eletrica || {}, peculiaridades: d.peculiaridades || {}, pendencias: d.pendencias || [] }
}

type ContatoLead = { id: string; telefone: string; nome_exibicao: string | null; projeto_id: string | null; cliente_id: string | null }

/** Projeto ligado ao contato (cria pelo mesmo caminho da qualificação, se não tiver). */
export async function garantirProjetoDoLead(admin: Admin, contato: ContatoLead, contexto: Record<string, any>): Promise<string | null> {
  let projetoId = contato.projeto_id || contexto.projeto_id || null
  if (!projetoId) {
    const { criarProjetoDoLead } = await import('@/lib/whatsapp/agente-qualificacao')
    projetoId = await criarProjetoDoLead(admin, contato, contexto as any)
    if (projetoId) await admin.from('wa_contatos').update({ projeto_id: projetoId, tipo: 'lead' }).eq('id', contato.id)
  }
  return projetoId
}

/**
 * PDF resumido do orçamento (cliente só nome + CPF/CNPJ, assinatura do
 * Kalebe) guardado no bucket público propostas-pdf. Usado pela Laís e pelo
 * "Montar proposta" do Spinzap.
 */
export async function gerarPdfDoOrcamento(admin: Admin, d: {
  orc: OrcamentoLead
  perfil: PerfilLead
  contato: ContatoLead
  fatura: { razao_social?: string | null; cpf_cnpj?: string | null } | null
  projetoId: string
  cidade: string | null
  uf: string | null
  prefixo: string
}): Promise<{ url: string; nome_cliente: string } | { erro: string }> {
  const { data: empresa } = await admin.from('configuracoes_empresa')
    .select('razao_social, cnpj, telefone, email, logo_url, rt_nome, rt_assinatura_url').limit(1).maybeSingle()
  const titularDaFatura = d.perfil.peculiaridades.titular_fatura !== false && !!d.fatura?.razao_social
  const nomeCliente = titularDaFatura ? d.fatura!.razao_social! : (d.perfil.peculiaridades.titular_nome || d.contato.nome_exibicao || d.perfil.contato.primeiro_nome || 'Cliente')
  const [assinatura, logo] = await Promise.all([imagemComoDataUrl((empresa as any)?.rt_assinatura_url), imagemComoDataUrl((empresa as any)?.logo_url)])
  const o = d.orc
  const pdf = gerarPdfOrcamento({
    cliente_nome: nomeCliente,
    cliente_documento: titularDaFatura ? d.fatura?.cpf_cnpj || null : null,
    cidade: d.cidade ? `${d.cidade}${d.uf ? `/${d.uf}` : ''}` : null,
    kwp: o.kwp, qtd_placas: o.qtd_placas, placa_modelo: o.placa.modelo, placa_wp: o.placa.potencia_wp,
    inversor_modelo: o.inversor.modelo, inversor_kw: o.inversor.potencia_kw, inversor_qtd: o.inversor.qtd,
    extras: (o.extras || []).map((x) => ({ descricao: x.descricao, qtd: x.qtd })),
    geracao_kwh_mes: o.geracao_kwh_mes, consumo_kwh_mes: o.consumo_kwh_mes,
    pv_total: o.pv_total, formas_pagamento: o.formas_pagamento, premissas: o.premissas,
    empresa: (empresa as any) || {}, assinatura, logo,
  })
  const caminho = `${d.projetoId}/${d.prefixo}-${Date.now()}.pdf`
  const { error } = await admin.storage.from('propostas-pdf').upload(caminho, Buffer.from(pdf), { contentType: 'application/pdf', upsert: false })
  if (error) return { erro: `Falha ao guardar o PDF: ${error.message}` }
  return { url: admin.storage.from('propostas-pdf').getPublicUrl(caminho).data.publicUrl, nome_cliente: nomeCliente }
}

export async function prepararOrcamentoDoLead(admin: Admin, e: {
  conversa_id: string
  contato: { id: string; telefone: string; nome_exibicao: string | null; projeto_id: string | null; cliente_id: string | null }
  entrada: EntradaOrcamentoLead
  /** Dados da fatura lida (titular, CPF/CNPJ) quando houver */
  fatura?: { razao_social?: string | null; cpf_cnpj?: string | null } | null
  contexto: Record<string, any>
}): Promise<{ orcamento_id: string; aprovado_auditor: boolean } | { erro: string }> {
  const perfil = await carregarPerfil(admin, e.contato.id)
  const { data: conv } = await admin.from('wa_conversas').select('cidade, uf').eq('id', e.conversa_id).maybeSingle()
  const cidade = perfil.contato.endereco?.cidade || (conv as any)?.cidade || e.contexto.cidade || null

  const orc = await montarOrcamentoLead(admin, { entrada: e.entrada, tipo_rede_perfil: perfil.infra_eletrica.tipo_rede || null, cidade })
  if ('erro' in orc) return orc
  const auditoria = auditarOrcamentoLead(orc, perfil)

  // Projeto do lead (o orçamento fica no histórico dele)
  const projetoId = await garantirProjetoDoLead(admin, e.contato, { ...e.contexto, nome_cliente: e.contexto.nome_cliente || perfil.contato.primeiro_nome || e.contato.nome_exibicao || 'Cliente', cidade })
  if (!projetoId) return { erro: 'Não consegui criar o projeto do lead' }

  const pdf = await gerarPdfDoOrcamento(admin, {
    orc, perfil, contato: e.contato, fatura: e.fatura || null, projetoId,
    cidade, uf: perfil.contato.endereco?.uf || (conv as any)?.uf || null, prefixo: 'orcamento-lais',
  })
  if ('erro' in pdf) return pdf
  const nomeCliente = pdf.nome_cliente

  const { data: linha, error } = await admin.from('spinzap_orcamentos').insert({
    conversa_id: e.conversa_id, contato_id: e.contato.id, projeto_id: projetoId,
    orcamento: orc, auditoria, url_pdf: pdf.url, pv_total: orc.pv_total, potencia_kwp: orc.kwp,
  }).select('id').single()
  if (error || !linha) return { erro: /spinzap_orcamentos/.test(error?.message || '') ? 'Falta rodar a migration 150 no Supabase.' : (error?.message || 'Falha ao registrar') }

  // Aviso pra aprovação (admins)
  const graves = auditoria.itens.filter((i) => i.grave && !i.ok)
  const { data: admins } = await admin.from('profiles').select('id').eq('role', 'admin').eq('ativo', true)
  for (const a of (admins || []) as Array<{ id: string }>) {
    await avisarUsuario({
      destinatario_id: a.id, agente: 'qualificacao', titulo: 'Orçamento da Laís para aprovar',
      mensagem: [
        `📄 Orçamento pronto para *${nomeCliente}*${cidade ? ` (${cidade})` : ''}`,
        `☀️ ${orc.kwp.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} kWp · ${orc.qtd_placas} placas · ${orc.inversor.modelo}`,
        `💰 ${reais(orc.pv_total)}`,
        graves.length ? `⚠️ Auditor barrou: ${graves.map((g) => g.texto).join('; ')}` : '✅ Auditor aprovou',
        `🔗 Aprovar ou ajustar: ${URL_PORTAL}/spinzap/orcamento/${linha.id}`,
      ].join('\n'),
      conversa_id: e.conversa_id, projeto_id: projetoId,
    }).catch((err) => console.error('[orcamento-lais] aviso', err))
  }
  return { orcamento_id: linha.id as string, aprovado_auditor: auditoria.aprovado }
}
