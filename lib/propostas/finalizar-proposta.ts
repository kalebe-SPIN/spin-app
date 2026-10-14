import type { createAdminClient } from '@/lib/supabase/admin'
import { calcularFormasPagamento, getNum, paramsToRecord } from '@/lib/precificacao/calcular'
import { imagemComoDataUrl } from '@/lib/spinzap/orcamento-lais'
import { salvarSecoesNoProjeto } from './secoes-servidor'
import type { SecaoProposta } from './secoes'
import { gerarPdfPropostaCategoria, type DadosPdfCategoria } from './pdf-proposta-categoria'

/**
 * Fecha uma proposta de categoria montada no Spinzap (Kalebe 2026-10-14):
 * grava o item principal do projeto e as seções, gera o PDF, guarda no
 * histórico do projeto e nos arquivos do contato. Usado por BESS, O&M e
 * projetos técnicos (FV e estação de recarga têm o próprio).
 */

type Admin = ReturnType<typeof createAdminClient>

export async function finalizarPropostaCategoria(admin: Admin, a: {
  projetoId: string
  usuarioId: string
  contatoId?: string | null
  /** Item principal do projeto (um por tipo) */
  item: { tipo: string; titulo: string; dados: Record<string, any>; valor: number }
  secoes: SecaoProposta[]
  pdf: Pick<DadosPdfCategoria, 'subtitulo' | 'blocos' | 'rotulo_total' | 'garantias' | 'observacao'>
  /** Total ao cliente (item + seções) */
  total: number
  memoria: Record<string, any>
  modo: string
  prefixoArquivo: string
  /** Campos extras do projeto (ex.: kit_selecionado do BESS) */
  extraProjeto?: Record<string, any>
}): Promise<{ url_pdf: string } | { erro: string }> {
  const { data: pj } = await admin.from('projetos')
    .select('codigo, cliente_id, cliente_razao_social, cliente_cpf_cnpj, wa_contato_id').eq('id', a.projetoId).maybeSingle()
  if (!pj) return { erro: 'Projeto não encontrado' }
  const projeto = pj as any
  let nome = projeto.cliente_razao_social || null
  let documento = projeto.cliente_cpf_cnpj || null
  if ((!nome || !documento) && projeto.cliente_id) {
    const { data: c } = await admin.from('clientes').select('razao_social, cpf_cnpj').eq('id', projeto.cliente_id).maybeSingle()
    nome = nome || (c as any)?.razao_social || null
    documento = documento || (c as any)?.cpf_cnpj || null
  }

  const [{ data: empresa }, { data: linhas }] = await Promise.all([
    admin.from('configuracoes_empresa').select('razao_social, cnpj, telefone, email, logo_url, rt_nome, rt_assinatura_url').limit(1).maybeSingle(),
    admin.from('parametros_precificacao').select('chave, valor_numero, valor_json, unidade').is('vigente_ate', null).eq('ativo', true),
  ])
  const record = paramsToRecord(linhas || [])
  const [assinatura, logo] = await Promise.all([
    imagemComoDataUrl((empresa as any)?.rt_assinatura_url), imagemComoDataUrl((empresa as any)?.logo_url),
  ])
  const pdf = gerarPdfPropostaCategoria({
    ...a.pdf,
    codigo_projeto: projeto.codigo || null,
    cliente_nome: nome || 'Cliente',
    cliente_documento: documento,
    total: a.total,
    formas_pagamento: calcularFormasPagamento(a.total, record),
    validade_dias: getNum(record, 'prazo_validade_orcamento_dias', 15),
    empresa: (empresa as any) || {},
    assinatura, logo,
  })
  const caminho = `${a.projetoId}/${a.prefixoArquivo}-${Date.now()}.pdf`
  const up = await admin.storage.from('propostas-pdf').upload(caminho, Buffer.from(pdf), { contentType: 'application/pdf', upsert: false })
  if (up.error) return { erro: `Falha ao guardar o PDF: ${up.error.message}` }
  const url = admin.storage.from('propostas-pdf').getPublicUrl(caminho).data.publicUrl

  if (a.extraProjeto) await admin.from('projetos').update(a.extraProjeto).eq('id', a.projetoId)

  // Item principal: um por tipo (padrão dos outros fluxos)
  const { data: ja } = await admin.from('projeto_itens').select('id')
    .eq('projeto_id', a.projetoId).eq('tipo', a.item.tipo).neq('status', 'removido').limit(1).maybeSingle()
  const payload = {
    tipo: a.item.tipo, titulo: a.item.titulo,
    dados: { ...a.item.dados, url_pdf: url, gerado_em: new Date().toISOString() },
    valor_estimado: Math.round(a.item.valor * 100) / 100,
    status: 'concluido',
  }
  if (ja) await admin.from('projeto_itens').update({ ...payload, updated_at: new Date().toISOString() }).eq('id', (ja as any).id)
  else await admin.from('projeto_itens').insert({ ...payload, projeto_id: a.projetoId, ordem: 0 })
  await salvarSecoesNoProjeto(admin, a.projetoId, a.secoes || [], a.usuarioId)

  await admin.from('projeto_propostas_historico').insert({
    projeto_id: a.projetoId, url_pdf: url, pv_total: Math.round(a.total * 100) / 100,
    modo_composicao: a.modo, gerado_por: a.usuarioId, memoria_calculo: a.memoria,
  })

  let contatoId = a.contatoId || projeto.wa_contato_id || null
  if (!contatoId) {
    const { data: c } = await admin.from('wa_contatos').select('id').eq('projeto_id', a.projetoId).limit(1).maybeSingle()
    contatoId = (c as any)?.id || null
  }
  if (contatoId) {
    await admin.from('spinzap_arquivos').insert({
      contato_id: contatoId, categoria: 'orcamento', url, nome: a.pdf.subtitulo, mime: 'application/pdf',
      origem: 'gerado', projeto_id: a.projetoId, criado_por: a.usuarioId,
    })
  }
  return { url_pdf: url }
}
