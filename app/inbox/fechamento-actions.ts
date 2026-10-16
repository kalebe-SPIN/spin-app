'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'
import { projetosDoContato } from '@/lib/propostas/projetos-contato'
import { secoesDoProjeto } from '@/lib/propostas/secoes-servidor'
import { normalizarKitBess } from '@/lib/propostas/bess'
import { CONDICOES_VENDA, normalizarFechamento, textoCondicao, type ClienteVenda, type FechamentoVenda } from '@/lib/propostas/fechamento'
import type { CategoriaProposta } from '@/lib/propostas/categorias'
import { validarCnpj, validarCpf } from '@/lib/formatters'
import { entradaFvDoProjeto } from '@/lib/spinzap/entrada-fv'
import type { DadosPdfOficial } from './proposta-actions'
import { custosDaPropostaSpinzap } from '@/lib/financeiro/custos-spinzap'

/**
 * Fechar a venda pelo Spinzap (Kalebe 2026-10-16): da proposta que foi
 * enviada → desconto negociado, forma de pagamento e dados do cliente →
 * proposta FINAL atualizada pro cliente → negócio fechado (status vendido,
 * venda_fechada no mesmo formato do "Fechar venda" do projeto: dashboard,
 * CRM e fluxo de caixa leem dali).
 *
 * Diferente do "Fechar venda" do projeto, aqui NÃO exclui as outras
 * propostas do cliente: no Spinzap cada categoria (FV, BESS, recarga…) é um
 * projeto próprio do mesmo cliente.
 */

async function acesso(conversa_id: string, projeto_id: string) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { erro: 'Não autenticado' as const }
  const { data: conv } = await supabase.from('wa_conversas').select('id').eq('id', conversa_id).maybeSingle()
  if (!conv) return { erro: 'Você não tem acesso a esta conversa' as const }
  const admin = createAdminClient()
  const [{ data: c }, { data: perfilUser }] = await Promise.all([
    admin.from('wa_conversas').select('id, cidade, uf, contexto_qualificacao, contato:contato_id(id, telefone, nome_exibicao, projeto_id, cliente_id)').eq('id', conversa_id).maybeSingle(),
    admin.from('profiles').select('role').eq('id', user.id).maybeSingle(),
  ])
  const contato = (c as any)?.contato
  if (!contato) return { erro: 'Conversa sem contato' as const }
  const doContato = (await projetosDoContato(admin, contato)).find((p) => p.id === projeto_id)
  if (!doContato) return { erro: 'Projeto não é deste contato' as const }
  return { user, admin, conv: c as any, contato, ehAdmin: perfilUser?.role === 'admin', projeto: doContato }
}
type Acesso = Exclude<Awaited<ReturnType<typeof acesso>>, { erro: any }>

/** Categorias que geram a proposta final no próprio Spinzap */
const COM_PROPOSTA_FINAL: CategoriaProposta[] = ['fotovoltaico', 'recarga', 'bess', 'om', 'projetos', 'venda']

/** Última proposta enviada (não a final) e o desconto máximo que o motor calculou pra ela. */
async function ultimaProposta(a: Acesso) {
  const { data } = await a.admin.from('projeto_propostas_historico')
    .select('id, url_pdf, gerado_em, pv_total, modo_composicao, memoria_calculo, excluida_em')
    .eq('projeto_id', a.projeto.id).order('gerado_em', { ascending: false }).limit(20)
  const linhas = ((data || []) as any[]).filter((h) => !h.excluida_em)
  const base = linhas.find((h) => !String(h.modo_composicao || '').endsWith('_final')) || null
  const final = linhas.find((h) => String(h.modo_composicao || '').endsWith('_final')) || null
  const m = (base?.memoria_calculo || {}) as Record<string, any>
  const descontoMax = Number(m.desconto_max_negociacao ?? m.desconto_max)
  return {
    base: base ? { valor: Number(base.pv_total) || 0, url_pdf: base.url_pdf as string | null, gerado_em: base.gerado_em as string } : null,
    /** Custos da proposta enviada (fluxo de caixa) */
    custos: base ? custosDaPropostaSpinzap(base.modo_composicao, base.memoria_calculo) : null,
    final: final ? { valor: Number(final.pv_total) || 0, url_pdf: final.url_pdf as string | null, gerado_em: final.gerado_em as string } : null,
    desconto_max: Number.isFinite(descontoMax) && descontoMax > 0 ? Math.round(descontoMax * 100) / 100 : null,
  }
}

const hojeBRT = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' })
const dataValida = (d: any) => (typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : null)

/** Confere o fechamento no servidor: valor vem da proposta, desconto respeita o limite. */
async function validarFechamento(a: Acesso, f: FechamentoVenda): Promise<{ fechamento: FechamentoVenda; custos: ReturnType<typeof custosDaPropostaSpinzap> } | { erro: string }> {
  const up = await ultimaProposta(a)
  if (!up.base || !(up.base.valor > 0)) return { erro: 'Gere e envie a proposta antes de fechar a venda' }
  const n = normalizarFechamento({ ...f, valor_proposta: up.base.valor })
  if (!(CONDICOES_VENDA as readonly string[]).includes(n.condicao_pagamento)) return { erro: 'Escolha a forma de pagamento' }
  if (/^outra/i.test(n.condicao_pagamento) && !n.observacoes) return { erro: 'Descreva a forma de pagamento nas observações' }
  if (n.desconto > 0 && !a.ehAdmin) {
    // Limite do motor (margem mínima na negociação); sem ele, só o admin dá desconto
    if (up.desconto_max == null) return { erro: 'Desconto nesta proposta só com o admin' }
    if (n.desconto > up.desconto_max + 0.01) return { erro: `Desconto acima do máximo desta proposta (R$ ${up.desconto_max.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}) — só o admin libera` }
  }
  return { fechamento: { ...n, data_venda: dataValida(n.data_venda) || hojeBRT(), data_pagamento: dataValida(n.data_pagamento) }, custos: up.custos }
}

function validarCliente(c: ClienteVenda): string | null {
  if (!c.nome?.trim()) return 'Informe o nome (ou razão social) do cliente'
  const doc = String(c.cpf_cnpj || '').replace(/\D/g, '')
  if (doc.length === 11 ? !validarCpf(doc) : doc.length === 14 ? !validarCnpj(doc) : true) return 'CPF ou CNPJ inválido'
  return null
}

// ───────────────────────────── Dados da tela ─────────────────────────────

export type DadosFechamento = {
  projeto: { id: string; codigo: string | null; categoria: CategoriaProposta | null; status: string; vendido: boolean }
  proposta: { valor: number; url_pdf: string | null; gerado_em: string } | null
  final: { valor: number; url_pdf: string | null; gerado_em: string } | null
  /** null = só admin dá desconto */
  desconto_max: number | null
  eh_admin: boolean
  pode_gerar_final: boolean
  /** Por que não gera a proposta final por aqui (e o que fazer) */
  aviso_final: string | null
  cliente: ClienteVenda
  venda_atual: { preco_final: number; condicao_pagamento: string; data_venda: string | null } | null
}

export async function dadosFechamentoAction(conversa_id: string, projeto_id: string): Promise<DadosFechamento | { erro: string }> {
  const a = await acesso(conversa_id, projeto_id)
  if ('erro' in a) return { erro: a.erro as string }
  const [{ data: pj }, up] = await Promise.all([
    a.admin.from('projetos').select('codigo, status, cliente_id, cliente_razao_social, cliente_cpf_cnpj, cliente_email, cliente_telefone, cliente_endereco, endereco_instalacao, orcamento_consolidado')
      .eq('id', projeto_id).maybeSingle(),
    ultimaProposta(a),
  ])
  const p = (pj || {}) as any
  let cli: any = null
  if (p.cliente_id) cli = (await a.admin.from('clientes').select('razao_social, cpf_cnpj, email, telefone, whatsapp, endereco').eq('id', p.cliente_id).maybeSingle()).data
  // Fatura lida na conversa (nome e CPF/CNPJ do titular) como último recurso
  const fat = a.conv?.contexto_qualificacao?.fatura || {}
  const end = (p.cliente_endereco && Object.keys(p.cliente_endereco).length ? p.cliente_endereco : null) || (p.endereco_instalacao && Object.keys(p.endereco_instalacao).length ? p.endereco_instalacao : null) || cli?.endereco || {}
  const vf = p.orcamento_consolidado?.venda_fechada
  const FECHADOS = ['vendido', 'aceito', 'em_homologacao', 'em_execucao', 'instalado', 'ativo_pos_venda']
  // FV: a proposta final sai do que foi montado no Montar proposta (guardado desde 2026-10-16)
  let podeFinal = !!a.projeto.categoria && COM_PROPOSTA_FINAL.includes(a.projeto.categoria)
  let avisoFinal: string | null = podeFinal ? null : 'Esta categoria ainda não gera a proposta final por aqui — vai a última proposta enviada.'
  if (a.projeto.categoria === 'venda') {
    const { data: it } = await a.admin.from('projeto_itens').select('dados').eq('projeto_id', projeto_id).eq('tipo', 'venda_equipamentos').neq('status', 'removido').limit(1).maybeSingle()
    if (!(it as any)?.dados?.itens?.length || !(it as any)?.dados?.calculo) {
      podeFinal = false
      avisoFinal = 'Abra a venda, salve os equipamentos e gere o PDF antes — sem isso vai a última proposta enviada.'
    }
  }
  if (a.projeto.categoria === 'fotovoltaico' && !(await entradaFvDoProjeto(a.admin, projeto_id))) {
    podeFinal = false
    avisoFinal = 'Esta proposta foi montada antes (ou pela tela do projeto) e não dá pra gerar a final com o desconto por aqui. Pra sair a proposta final, use “Editar proposta”, gere o PDF de novo e volte; ou feche assim e vai a última proposta enviada.'
  }
  return {
    projeto: { id: projeto_id, codigo: p.codigo || null, categoria: a.projeto.categoria, status: String(p.status || ''), vendido: FECHADOS.includes(String(p.status)) },
    proposta: up.base, final: up.final,
    desconto_max: up.desconto_max,
    eh_admin: a.ehAdmin,
    pode_gerar_final: podeFinal,
    aviso_final: avisoFinal,
    cliente: {
      nome: p.cliente_razao_social && p.cliente_razao_social !== 'Cliente' ? p.cliente_razao_social : cli?.razao_social || fat.razao_social || a.contato.nome_exibicao || '',
      cpf_cnpj: p.cliente_cpf_cnpj || cli?.cpf_cnpj || fat.cpf_cnpj || '',
      email: p.cliente_email || cli?.email || '',
      telefone: p.cliente_telefone || cli?.telefone || cli?.whatsapp || a.contato.telefone || '',
      endereco: {
        cep: end.cep || '', rua: end.rua || end.logradouro || '', numero: end.numero ? String(end.numero) : '', complemento: end.complemento || '',
        bairro: end.bairro || '', cidade: end.cidade || end.municipio || a.conv?.cidade || '', uf: String(end.uf || a.conv?.uf || 'SC').toUpperCase(),
      },
    },
    venda_atual: vf?.preco_final ? { preco_final: Number(vf.preco_final), condicao_pagamento: vf.condicao_pagamento || '', data_venda: vf.data_venda || null } : null,
  }
}

// ───────────────────────── Proposta final (PDF) ─────────────────────────

/** Recarga, BESS, O&M e projetos técnicos: o PDF final sai no servidor, com a entrada salva da proposta. */
export async function gerarPdfFinalServidorAction(conversa_id: string, projeto_id: string, f: FechamentoVenda): Promise<{ url_pdf: string; fechamento: FechamentoVenda } | { erro: string }> {
  const a = await acesso(conversa_id, projeto_id)
  if ('erro' in a) return { erro: a.erro as string }
  const v = await validarFechamento(a, f)
  if ('erro' in v) return v
  const fechamento = v.fechamento
  const cat = a.projeto.categoria
  if (cat === 'recarga') {
    const { data: pj } = await a.admin.from('projetos').select('ve_recarga_selecionada').eq('id', projeto_id).maybeSingle()
    const sel = (pj as any)?.ve_recarga_selecionada
    if (sel?.versao !== 2 || !sel?.entrada) return { erro: 'Abra a proposta da estação e gere o PDF de novo antes de fechar' }
    const { gerarPropostaRecarga } = await import('@/lib/estacao-ve/proposta-recarga-servidor')
    const r = await gerarPropostaRecarga(a.admin, { projetoId: projeto_id, entrada: sel.entrada, ehAdmin: a.ehAdmin, usuarioId: a.user.id, contatoId: a.contato.id, fechamento })
    if ('erro' in r) return r
    return { url_pdf: r.url_pdf, fechamento }
  }
  const acoes = await import('./propostas-categorias-actions')
  if (cat === 'bess') {
    const [{ data: pj }, { data: it }, secoes] = await Promise.all([
      a.admin.from('projetos').select('kit_selecionado').eq('id', projeto_id).maybeSingle(),
      a.admin.from('projeto_itens').select('dados').eq('projeto_id', projeto_id).eq('tipo', 'bess').neq('status', 'removido').limit(1).maybeSingle(),
      secoesDoProjeto(a.admin, projeto_id),
    ])
    const k = (pj as any)?.kit_selecionado
    if (k?.modo !== 'bess_puro') return { erro: 'Abra a proposta do BESS e gere o PDF de novo antes de fechar' }
    const salva = (it as any)?.dados?.entrada_spinzap || {}
    const r = await acoes.gerarBessAction(conversa_id, { kit: normalizarKitBess(k), secoes, margem_pct: salva.margem_pct ?? null, comissao_pct: salva.comissao_pct ?? null }, fechamento)
    return 'erro' in r ? r : { url_pdf: r.url_pdf, fechamento }
  }
  if (cat === 'om' || cat === 'projetos') {
    const tipos = cat === 'om' ? ['srv_limpeza', 'srv_manutencao', 'srv_retirada_recolocacao'] : ['srv_projeto_tecnico', 'srv_laudo_tecnico', 'srv_analise_rede']
    const { data: itens } = await a.admin.from('projeto_itens').select('dados').eq('projeto_id', projeto_id).in('tipo', tipos).neq('status', 'removido').limit(1)
    const entrada = ((itens || [])[0] as any)?.dados?.entrada_spinzap
    if (!entrada) return { erro: 'Abra a proposta e gere o PDF de novo antes de fechar' }
    const r = cat === 'om' ? await acoes.gerarOMAction(conversa_id, entrada, fechamento) : await acoes.gerarTecnicoAction(conversa_id, entrada, fechamento)
    return 'erro' in r ? r : { url_pdf: r.url_pdf, fechamento }
  }
  return { erro: 'Esta categoria ainda não gera a proposta final por aqui — feche a venda e envie o PDF da proposta' }
}

/** FV: dados do modelo oficial com desconto e pagamento acordados (o navegador desenha, como no projeto). */
export async function prepararPdfFinalFvAction(conversa_id: string, projeto_id: string, f: FechamentoVenda, cliente: ClienteVenda): Promise<
  { dados: DadosPdfOficial; nome_arquivo: string; fechamento: FechamentoVenda; condicao: { titulo: string; valor: string; sub?: string } } | { erro: string }
> {
  const a = await acesso(conversa_id, projeto_id)
  if ('erro' in a) return { erro: a.erro as string }
  if (a.projeto.categoria !== 'fotovoltaico') return { erro: 'Projeto não é fotovoltaico' }
  const v = await validarFechamento(a, f)
  if ('erro' in v) return v
  const erroCli = validarCliente(cliente)
  if (erroCli) return { erro: erroCli }
  const salva = await entradaFvDoProjeto(a.admin, projeto_id)
  if (!salva?.entrada) return { erro: 'Esta proposta é de antes de o sistema guardar o que foi montado — abra o Montar proposta, gere o PDF de novo e depois feche a venda' }
  const { prepararPdfOficialPropostaRapidaAction } = await import('./proposta-actions')
  const r = await prepararPdfOficialPropostaRapidaAction(conversa_id, salva.entrada)
  if ('erro' in r) return r
  if (r.projeto_id !== projeto_id) return { erro: 'A proposta aberta do cliente é de outro projeto' }
  const fe = v.fechamento
  const dados: DadosPdfOficial = {
    ...r.dados,
    // Valor da proposta enviada + desconto negociado no bloco de ajuste do modelo oficial
    pv_total: fe.valor_proposta,
    projeto: {
      ...r.dados.projeto,
      cliente_razao_social: cliente.nome.trim(),
      cliente_cpf_cnpj: cliente.cpf_cnpj.replace(/\D/g, ''),
      cliente_endereco: { ...(r.dados.projeto.cliente_endereco || {}), cidade: cliente.endereco.cidade || r.dados.projeto.cliente_endereco?.cidade, uf: cliente.endereco.uf || r.dados.projeto.cliente_endereco?.uf },
      desconto_admin_pct: 0,
      desconto_admin_valor: fe.desconto,
      desconto_admin_motivo: fe.desconto > 0 ? 'desconto negociado' : null,
    },
  }
  const { nomearProposta } = await import('@/lib/downloads')
  const k = r.dados.projeto.kit_selecionado || {}
  return {
    dados, fechamento: fe,
    nome_arquivo: nomearProposta({ cliente: cliente.nome, potenciaCcKwp: k.potencia_cc_kwp, potenciaCaKw: k.potencia_ca_kw }).replace(/^PROPOSTA_/, 'PROPOSTA-FINAL_'),
    condicao: { titulo: 'Forma de pagamento', valor: textoCondicao(fe), sub: `Valor final R$ ${fe.valor_final.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}` },
  }
}

/** FV e venda de equipamento: registra o PDF final que o navegador desenhou e subiu. */
export async function registrarPdfFinalAction(conversa_id: string, projeto_id: string, url_pdf: string, f: FechamentoVenda): Promise<{ sucesso: true } | { erro: string }> {
  const a = await acesso(conversa_id, projeto_id)
  if ('erro' in a) return { erro: a.erro as string }
  if (!url_pdf.includes(`/propostas-pdf/${projeto_id}/`)) return { erro: 'PDF inválido' }
  const v = await validarFechamento(a, f)
  if ('erro' in v) return v
  const fe = v.fechamento
  const venda = a.projeto.categoria === 'venda'
  await a.admin.from('projeto_propostas_historico').insert({
    projeto_id, url_pdf, pv_total: fe.valor_final, pv_bruto: fe.valor_proposta, desconto_valor: fe.desconto,
    modo_composicao: venda ? 'venda_direta_final' : 'orcamento_spinzap_final', gerado_por: a.user.id, memoria_calculo: { fechamento: fe },
  })
  await a.admin.from('spinzap_arquivos').insert({
    contato_id: a.contato.id, categoria: 'orcamento', url: url_pdf, nome: venda ? 'Proposta final — equipamentos' : 'Proposta final — fotovoltaico', mime: 'application/pdf',
    origem: 'gerado', projeto_id, criado_por: a.user.id,
  })
  revalidatePath('/spinzap')
  return { sucesso: true }
}

/** Venda de equipamento: dados do modelo da venda direta com o fechamento (o navegador desenha). */
export async function prepararPdfFinalVendaAction(conversa_id: string, projeto_id: string, f: FechamentoVenda, cliente: ClienteVenda): Promise<
  { projeto: any; dados: any; calculo: any; config_empresa: any; nome_arquivo: string; fechamento: FechamentoVenda } | { erro: string }
> {
  const a = await acesso(conversa_id, projeto_id)
  if ('erro' in a) return { erro: a.erro as string }
  if (a.projeto.categoria !== 'venda') return { erro: 'Projeto não é de venda de equipamento' }
  const v = await validarFechamento(a, f)
  if ('erro' in v) return v
  const erroCli = validarCliente(cliente)
  if (erroCli) return { erro: erroCli }
  const [{ data: pj }, { data: item }, { data: emp }] = await Promise.all([
    a.admin.from('projetos').select('*').eq('id', projeto_id).maybeSingle(),
    a.admin.from('projeto_itens').select('dados').eq('projeto_id', projeto_id).eq('tipo', 'venda_equipamentos').neq('status', 'removido').limit(1).maybeSingle(),
    a.admin.from('configuracoes_empresa').select('*').eq('singleton', true).maybeSingle(),
  ])
  const dados = (item as any)?.dados
  if (!pj || !dados?.itens?.length || !dados?.calculo) return { erro: 'Abra a venda, salve os equipamentos e gere o PDF de novo antes de fechar' }
  // Nome e CPF/CNPJ do fechamento no bloco do cliente
  const nf = { ...(dados.nf || {}), nome: cliente.nome.trim(), documento: cliente.cpf_cnpj.replace(/\D/g, '') }
  const nome = cliente.nome.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/[^A-Z0-9]+/g, '')
  return { projeto: pj, dados: { ...dados, nf }, calculo: dados.calculo, config_empresa: emp || {}, nome_arquivo: `PROPOSTA-FINAL_EQUIPAMENTOS_${nome || 'CLIENTE'}.pdf`, fechamento: v.fechamento }
}

// ─────────────────────────── Fechar a venda ───────────────────────────

export async function fecharVendaConversaAction(entrada: {
  conversa_id: string
  projeto_id: string
  fechamento: FechamentoVenda
  cliente: ClienteVenda
  /** PDF final (já gerado); sem ele, fecha sem mandar documento novo */
  url_pdf_final?: string | null
  enviar: boolean
  legenda?: string
  nome_arquivo?: string
}): Promise<{ sucesso: true; enviado: boolean } | { erro: string; janela_fechada?: boolean }> {
  const a = await acesso(entrada.conversa_id, entrada.projeto_id)
  if ('erro' in a) return { erro: a.erro as string }
  const v = await validarFechamento(a, entrada.fechamento)
  if ('erro' in v) return v
  const fe = v.fechamento
  const erroCli = validarCliente(entrada.cliente)
  if (erroCli) return { erro: erroCli }
  const { data: pj } = await a.admin.from('projetos')
    .select('status, cliente_id, endereco_instalacao, orcamento_consolidado').eq('id', entrada.projeto_id).maybeSingle()
  const projeto = (pj || {}) as any
  if (['vendido', 'aceito', 'em_homologacao', 'em_execucao', 'instalado', 'ativo_pos_venda'].includes(String(projeto.status))) {
    return { erro: 'Esta venda já está fechada' }
  }

  // 1. Dados do cliente (cadastro + projeto); o PDF continua só com nome e CPF/CNPJ
  const c = entrada.cliente
  const doc = c.cpf_cnpj.replace(/\D/g, '')
  const endereco = {
    cep: c.endereco.cep.replace(/\D/g, ''), rua: c.endereco.rua.trim(), numero: c.endereco.numero.trim(), complemento: c.endereco.complemento.trim(),
    bairro: c.endereco.bairro.trim(), cidade: c.endereco.cidade.trim(), uf: c.endereco.uf.trim().toUpperCase().slice(0, 2),
  }
  const dadosCliente = {
    razao_social: c.nome.trim(), cpf_cnpj: doc, tipo: doc.length === 14 ? 'pj' : 'pf',
    email: c.email.trim() || null, telefone: c.telefone.trim() || null, endereco,
  }
  let clienteId: string | null = projeto.cliente_id || a.contato.cliente_id || null
  if (!clienteId) {
    const { data: ja } = await a.admin.from('clientes').select('id').eq('cpf_cnpj', doc).limit(1).maybeSingle()
    clienteId = (ja as any)?.id || null
  }
  if (clienteId) {
    await a.admin.from('clientes').update({ ...dadosCliente, updated_at: new Date().toISOString() }).eq('id', clienteId)
  } else {
    const { data: novo, error } = await a.admin.from('clientes').insert({
      ...dadosCliente, whatsapp: a.contato.telefone || null, origem: 'spinzap', proprietario_id: a.user.id,
    }).select('id').single()
    if (error || !novo) return { erro: `Não consegui salvar o cliente: ${error?.message || 'sem detalhes'}` }
    clienteId = (novo as any).id
  }
  if (!a.contato.cliente_id && clienteId) await a.admin.from('wa_contatos').update({ cliente_id: clienteId }).eq('id', a.contato.id)

  // 2. Proposta final pro cliente (antes de fechar: se o envio falhar, nada muda)
  let enviado = false
  if (entrada.enviar && entrada.url_pdf_final) {
    const { enviarPdfPropostaRapidaAction } = await import('./proposta-actions')
    const nome = entrada.nome_arquivo && /^[\w .-]+\.pdf$/i.test(entrada.nome_arquivo) ? entrada.nome_arquivo : 'Proposta-final-Spin-Solar.pdf'
    const r = await enviarPdfPropostaRapidaAction(entrada.conversa_id, entrada.projeto_id, entrada.url_pdf_final, entrada.legenda || '', nome, true)
    if ('erro' in r) return { erro: `Não enviei a proposta final: ${r.erro}. A venda não foi fechada — tente de novo ou desmarque o envio.` }
    enviado = true
  }

  // 3. Venda fechada — mesmo formato do "Fechar venda" do projeto (dashboard, CRM, fluxo de caixa)
  const vfAntes: any = projeto.orcamento_consolidado?.venda_fechada
  const consolidado = {
    ...(projeto.orcamento_consolidado || {}),
    pv_total: fe.valor_final,
    pv_acordado: fe.valor_final,
    condicao_pagamento_acordada: fe.condicao_pagamento,
    parcelas_acordadas: fe.parcelas,
    venda_fechada: {
      preco_final: fe.valor_final,
      condicao_pagamento: fe.condicao_pagamento,
      parcelas: fe.parcelas,
      observacoes: fe.observacoes,
      data_venda: fe.data_venda,
      data_pagamento: fe.data_pagamento || null,
      fechada_em: new Date().toISOString(),
      fechada_por: a.user.id,
      // Kalebe 2026-10-16: negociação pelo Spinzap
      valor_proposta: fe.valor_proposta,
      desconto: fe.desconto,
      entrada_valor: fe.entrada_valor || null,
      url_pdf_final: entrada.url_pdf_final || null,
      origem: 'spinzap',
      // Custos da proposta (no valor da proposta) — o fluxo de caixa ajusta ao valor vendido
      custos_proposta: v.custos || null,
      ...(vfAntes ? { alteracoes: [...(Array.isArray(vfAntes.alteracoes) ? vfAntes.alteracoes : []), { ...vfAntes, alteracoes: undefined, alterada_em: new Date().toISOString(), alterada_por: a.user.id }].slice(-20) } : {}),
    },
  }
  const temEndInst = projeto.endereco_instalacao && Object.keys(projeto.endereco_instalacao).length > 0
  const { error: eUp } = await a.admin.from('projetos').update({
    orcamento_consolidado: consolidado,
    cliente_id: clienteId,
    cliente_razao_social: dadosCliente.razao_social,
    cliente_cpf_cnpj: doc,
    cliente_email: dadosCliente.email,
    cliente_telefone: dadosCliente.telefone,
    cliente_endereco: endereco,
    ...(temEndInst ? {} : { endereco_instalacao: endereco }),
    desconto_admin_pct: 0,
    desconto_admin_valor: fe.desconto,
    desconto_admin_motivo: fe.desconto > 0 ? 'Desconto negociado no fechamento (Spinzap)' : null,
    desconto_admin_por: fe.desconto > 0 ? a.user.id : null,
    desconto_admin_em: fe.desconto > 0 ? new Date().toISOString() : null,
  }).eq('id', entrada.projeto_id)
  if (eUp) return { erro: `Proposta ${enviado ? 'enviada, mas a venda' : 'e venda'} não gravou: ${eUp.message}` }

  // 4. Negócio fechado: status vendido (execução, contrato, homologação quando couber),
  //    fluxo de caixa e a conversa em "Fechado"
  const { mudarEtapaProjetoAction } = await import('@/app/projetos/[id]/etapa/actions')
  const st = await mudarEtapaProjetoAction(entrada.projeto_id, 'vendido', `Venda fechada pelo Spinzap — ${fe.condicao_pagamento}${fe.desconto > 0 ? ` · desconto R$ ${fe.desconto.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}` : ''}`)
  if ('erro' in st && st.erro) return { erro: `Venda gravada, mas a etapa não mudou: ${st.erro}` }
  try {
    const { sincronizarVendasNoFluxo } = await import('@/lib/financeiro/sync-vendas')
    await sincronizarVendasNoFluxo()
  } catch (e: any) { console.error('[fechar venda spinzap] fluxo:', e?.message) }
  const { moverEtapaPeloProjeto } = await import('@/lib/spinzap/etapas')
  await moverEtapaPeloProjeto(entrada.projeto_id, 'fechado')

  revalidatePath('/spinzap'); revalidatePath('/dashboard'); revalidatePath(`/projetos/${entrada.projeto_id}`)
  return { sucesso: true, enviado }
}
