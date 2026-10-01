'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { formatarCpfCnpj } from '@/lib/formatters'
import { paramsToRecord } from '@/lib/precificacao/calcular'
import { calcularVendaDireta, erroTravaCupom, type CupomAplicado, type ItemVendaDireta } from '@/lib/precificacao/venda-direta'
import { buscarCupomValido } from '@/lib/venda-direta/cupom'
import {
  validarDadosVendaDireta,
  enderecoEntrega,
  tipoPessoa,
  type DadosVendaDireta,
  type ItemDadosVendaDireta,
} from '@/lib/venda-direta/tipos'
import { precoVigente } from '@/lib/venda-direta/preco'

/**
 * Venda direta de equipamentos (Kalebe 2026-09-29). Vira um projeto com um
 * único item 'venda_equipamentos' — assim entra no CRM, no funil e na
 * regra de retenção de arquivos igual às outras propostas.
 */

const TIPO = 'venda_equipamentos' as const
const dig = (s: string) => String(s || '').replace(/\D/g, '')

async function exigirAdmin() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { erro: 'Não autenticado' as string, supabase, user: null }
  const { data: perfil } = await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle()
  if (perfil?.role !== 'admin') return { erro: 'Venda direta é exclusiva do administrador' as string, supabase, user: null }
  return { erro: null, supabase, user }
}

async function exigirUsuario() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  return { supabase, user }
}

/** Acha cliente pelo CPF/CNPJ (com ou sem máscara no banco). */
async function acharClientePorDocumento(supabase: ReturnType<typeof createClient>, documento: string) {
  const d = dig(documento)
  if (d.length !== 11 && d.length !== 14) return null
  const { data } = await supabase
    .from('clientes')
    .select('id, razao_social, cpf_cnpj, email, telefone, whatsapp, endereco')
    .or(`cpf_cnpj.eq.${d},cpf_cnpj.eq.${formatarCpfCnpj(d)}`)
    .limit(1)
  return data?.[0] || null
}

/** Pré-preenche o formulário quando o cliente já existe no cadastro. */
export async function buscarClienteVendaDiretaAction(documento: string): Promise<
  { encontrado: false } | { encontrado: true; nome: string; email: string; telefone: string; endereco: any }
> {
  // Kalebe 2026-10-01: todos vendem — o RLS de clientes limita o que cada um acha
  const { supabase, user } = await exigirUsuario()
  if (!user) return { encontrado: false }
  const c = await acharClientePorDocumento(supabase, documento)
  if (!c) return { encontrado: false }
  return {
    encontrado: true,
    nome: c.razao_social || '',
    email: c.email || '',
    telefone: c.telefone || c.whatsapp || '',
    endereco: c.endereco || null,
  }
}

/** Grava/atualiza o cliente no cadastro (só preenche campos vazios de quem já existe). */
async function sincronizarCliente(
  supabase: ReturnType<typeof createClient>,
  dados: DadosVendaDireta,
  proprietarioId: string,
): Promise<string | null> {
  const existente = await acharClientePorDocumento(supabase, dados.nf.documento)
  if (existente) {
    const patch: any = {}
    if (!existente.email) patch.email = dados.nf.email.trim()
    if (!existente.telefone) patch.telefone = dados.nf.telefone
    if (!existente.whatsapp) patch.whatsapp = dados.nf.telefone
    if (!existente.endereco || Object.keys(existente.endereco || {}).length === 0) patch.endereco = dados.nf.endereco
    if (Object.keys(patch).length > 0) {
      await supabase.from('clientes').update({ ...patch, updated_at: new Date().toISOString() }).eq('id', existente.id)
    }
    return existente.id
  }
  const { data: novo } = await supabase
    .from('clientes')
    .insert({
      razao_social: dados.nf.nome.trim(),
      cpf_cnpj: formatarCpfCnpj(dig(dados.nf.documento)),
      tipo: tipoPessoa(dados.nf.documento),
      email: dados.nf.email.trim(),
      telefone: dados.nf.telefone,
      whatsapp: dados.nf.telefone,
      endereco: dados.nf.endereco,
      origem: 'venda_direta',
      proprietario_id: proprietarioId,
    })
    .select('id')
    .single()
  return novo?.id || null
}

function snapshotCliente(dados: DadosVendaDireta) {
  return {
    cliente_razao_social: dados.nf.nome.trim(),
    cliente_cpf_cnpj: formatarCpfCnpj(dig(dados.nf.documento)),
    cliente_email: dados.nf.email.trim(),
    cliente_telefone: dados.nf.telefone,
    cliente_endereco: dados.nf.endereco,
    endereco_instalacao: enderecoEntrega(dados),   // aqui = endereço de entrega
  }
}

export async function criarVendaDiretaAction(input: {
  dados: DadosVendaDireta
  vendedor_id: string
}): Promise<{ projeto_id: string } | { erro: string }> {
  const { supabase, user } = await exigirUsuario()
  if (!user) return { erro: 'Não autenticado' }

  const invalido = validarDadosVendaDireta(input.dados)
  if (invalido) return { erro: invalido }
  // Kalebe 2026-10-01: todos vendem; só o admin lança em nome de outro vendedor
  const { data: perfil } = await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle()
  const vendedorId = perfil?.role === 'admin' ? (input.vendedor_id || user.id) : user.id

  const clienteId = await sincronizarCliente(supabase, input.dados, vendedorId)

  const { data: projeto, error: errProj } = await supabase
    .from('projetos')
    .insert({
      consultor_id: vendedorId,
      cliente_id: clienteId,
      tipo_projeto: TIPO,
      status: 'rascunho',
      ...snapshotCliente(input.dados),
    })
    .select('id')
    .single()
  if (errProj || !projeto) return { erro: `Erro ao criar a venda: ${errProj?.message || ''}` }

  const dadosItem: ItemDadosVendaDireta = { ...input.dados, itens: [], frete: 0 }
  const { error: errItem } = await supabase.from('projeto_itens').insert({
    projeto_id: projeto.id,
    tipo: TIPO,
    titulo: 'Venda direta de equipamentos',
    dados: dadosItem,
    valor_estimado: 0,
    status: 'pendente',
  })
  if (errItem) {
    // Desfaz: sem o item o projeto ficaria órfão na lista (soft delete, padrão do sistema)
    await supabase
      .from('projetos')
      .update({ excluida_em: new Date().toISOString(), excluida_motivo: 'Falha ao criar venda direta', excluida_por: user.id })
      .eq('id', projeto.id)
    return {
      erro: errItem.message.includes('tipo_item_projeto')
        ? 'Falta rodar a migration 122 (tipo venda_equipamentos) no Supabase.'
        : `Erro ao criar o item: ${errItem.message}`,
    }
  }

  revalidatePath('/venda-direta')
  return { projeto_id: projeto.id }
}

async function carregarItem(supabase: ReturnType<typeof createClient>, projetoId: string) {
  const { data } = await supabase
    .from('projeto_itens')
    .select('id, dados')
    .eq('projeto_id', projetoId)
    .eq('tipo', TIPO)
    .neq('status', 'removido')
    .maybeSingle()
  return data
}

export async function salvarDadosVendaDiretaAction(
  projetoId: string,
  dados: DadosVendaDireta,
): Promise<{ sucesso: true } | { erro: string }> {
  const { supabase, user } = await exigirUsuario()
  if (!user) return { erro: 'Não autenticado' }
  const invalido = validarDadosVendaDireta(dados)
  if (invalido) return { erro: invalido }

  const item = await carregarItem(supabase, projetoId)
  if (!item) return { erro: 'Venda direta não encontrada neste projeto' }

  const { data: proj } = await supabase.from('projetos').select('consultor_id').eq('id', projetoId).maybeSingle()
  const clienteId = await sincronizarCliente(supabase, dados, proj?.consultor_id || user.id)

  await supabase
    .from('projeto_itens')
    .update({ dados: { ...(item.dados || {}), nf: dados.nf, entrega: dados.entrega }, updated_at: new Date().toISOString() })
    .eq('id', item.id)
  await supabase
    .from('projetos')
    .update({ ...snapshotCliente(dados), cliente_id: clienteId })
    .eq('id', projetoId)

  revalidatePath(`/projetos/${projetoId}/venda-direta`)
  return { sucesso: true }
}

/**
 * Kalebe 2026-09-30: confere o cupom antes de salvar (pra tela recalcular na
 * hora). Só admin aplica cupom.
 */
export async function validarCupomVendaDiretaAction(
  projetoId: string,
  codigo: string,
): Promise<{ cupom: CupomAplicado } | { erro: string }> {
  const { erro, supabase } = await exigirAdmin()
  if (erro) return { erro: erro === 'Venda direta é exclusiva do administrador' ? 'Só o admin aplica cupom' : erro }
  return buscarCupomValido(supabase, codigo, projetoId)
}

/**
 * Salva equipamentos + frete (+ cupom). Recalcula no servidor com o PREÇO
 * VIGENTE do catálogo (não confia no preço que veio da tela).
 *
 * cupom: undefined = mantém o que está salvo · '' = remove · código = aplica
 * (os dois últimos só pro admin).
 */
export async function salvarEquipamentosVendaDiretaAction(
  projetoId: string,
  itensTela: ItemVendaDireta[],
  frete: number,
  cupomCodigo?: string,
): Promise<{ sucesso: true; pv_total: number } | { erro: string }> {
  const { supabase, user } = await exigirUsuario()
  if (!user) return { erro: 'Não autenticado' }
  const item = await carregarItem(supabase, projetoId)
  if (!item) return { erro: 'Venda direta não encontrada neste projeto' }

  const ids = itensTela.map((i) => i.produto_id).filter(Boolean) as string[]
  const { data: produtos } = ids.length
    ? await supabase
        .from('produtos')
        .select('id, modelo, fabricante, descricao_curta, categoria, precos_produtos(preco_venda, vigente_de, vigente_ate)')
        .in('id', ids)
    : { data: [] as any[] }
  const porId = new Map((produtos || []).map((p: any) => [p.id, p]))

  // Kalebe 2026-09-29: produto sem preço na planilha aceita preço digitado —
  // só o admin define; pra quem não é admin vale o que o admin já salvou aqui.
  const { data: perfil } = await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle()
  const ehAdmin = perfil?.role === 'admin'
  const salvos = new Map<string, ItemVendaDireta>(
    (((item.dados as any)?.itens || []) as ItemVendaDireta[])
      .filter((x) => x.preco_manual && x.produto_id)
      .map((x) => [x.produto_id as string, x]),
  )

  const itens: ItemVendaDireta[] = []
  for (const i of itensTela) {
    const qtd = Math.max(0, Math.round(Number(i.qtd) || 0))
    if (qtd === 0) continue
    const p: any = i.produto_id ? porId.get(i.produto_id) : null
    if (!p) return { erro: `Produto "${i.modelo}" não está mais no catálogo` }
    const base = {
      produto_id: p.id,
      modelo: p.modelo,
      fabricante: p.fabricante || null,
      descricao: p.descricao_curta || null,
      categoria: p.categoria || null,
      qtd,
    }
    const preco = precoVigente(p.precos_produtos)
    if (preco) {
      itens.push({ ...base, preco_tabela: preco })   // preço da planilha manda (não confia na tela)
      continue
    }
    if (ehAdmin) {
      const manual = Math.round((Number(i.preco_tabela) || 0) * 100) / 100
      if (!(manual > 0)) return { erro: `Informe o preço de "${p.modelo}" (sem preço na planilha)` }
      itens.push({ ...base, preco_tabela: manual, preco_manual: true, base_preco: i.base_preco === 'custo' ? 'custo' : 'tabela' })
      continue
    }
    const doAdmin = salvos.get(p.id)
    if (!doAdmin || !(Number(doAdmin.preco_tabela) > 0)) {
      return { erro: `"${p.modelo}" não tem preço na planilha — peça ao admin pra informar o preço nesta proposta` }
    }
    itens.push({ ...base, preco_tabela: Number(doAdmin.preco_tabela), preco_manual: true, base_preco: doAdmin.base_preco === 'custo' ? 'custo' : 'tabela' })
  }

  // Cupom (Kalebe 2026-09-30): só admin aplica/remove; pros outros vale o salvo
  let cupom: CupomAplicado | null = ((item.dados as any)?.cupom as CupomAplicado) || null
  if (cupomCodigo !== undefined) {
    if (!ehAdmin) return { erro: 'Só o admin aplica ou remove cupom' }
    if (!cupomCodigo.trim()) cupom = null
    else {
      const r = await buscarCupomValido(supabase, cupomCodigo, projetoId)
      if ('erro' in r) return { erro: r.erro }
      cupom = r.cupom
    }
  }

  const { data: paramsRows } = await supabase
    .from('parametros_precificacao')
    .select('chave, valor_numero, valor_json, unidade')
    .eq('ativo', true)
    .is('vigente_ate', null)
  const params = paramsToRecord(paramsRows || [])
  const calculo = calcularVendaDireta({ itens, frete, cupom }, params)
  const trava = erroTravaCupom(calculo, params)
  if (trava) return { erro: ehAdmin ? trava : `${trava} Fale com o admin.` }
  const pv = Math.round(calculo.pv_total * 100) / 100

  // Registro de uso do cupom (limite de usos) — tabela só do admin
  if (ehAdmin && cupomCodigo !== undefined) {
    await supabase.from('cupons_usos').delete().eq('projeto_id', projetoId).neq('cupom_id', cupom?.id || '00000000-0000-0000-0000-000000000000')
    if (cupom) {
      await supabase.from('cupons_usos').upsert({
        cupom_id: cupom.id, projeto_id: projetoId,
        desconto_valor: Math.round(calculo.desconto_cupom * 100) / 100, aplicado_por: user.id,
      })
    }
  }

  const { error } = await supabase
    .from('projeto_itens')
    .update({
      dados: { ...(item.dados || {}), itens, frete: calculo.frete, cupom, calculo },
      valor_estimado: pv,
      status: itens.length > 0 ? 'concluido' : 'pendente',
      updated_at: new Date().toISOString(),
    })
    .eq('id', item.id)
  if (error) return { erro: error.message }

  await supabase
    .from('projetos')
    .update({ pv_total: pv, valor_total_proposta: pv })
    .eq('id', projetoId)

  revalidatePath(`/projetos/${projetoId}/venda-direta`)
  return { sucesso: true, pv_total: pv }
}

/** PDF gerado no navegador e salvo no Storage → registra no projeto + histórico. */
export async function registrarPdfVendaDiretaAction(
  projetoId: string,
  urlPdf: string,
): Promise<{ sucesso: true } | { erro: string }> {
  const { supabase, user } = await exigirUsuario()
  if (!user) return { erro: 'Não autenticado' }
  const item = await carregarItem(supabase, projetoId)
  if (!item) return { erro: 'Venda direta não encontrada neste projeto' }

  const { data: proj } = await supabase.from('projetos').select('status').eq('id', projetoId).maybeSingle()
  const antesDoOrcamento = ['rascunho', 'dimensionado', 'kit_selecionado', 'lista_ca_confirmada']
  const agora = new Date().toISOString()

  await supabase
    .from('projetos')
    .update({
      url_pdf_proposta: urlPdf,
      data_orcamento_gerado: agora,
      ...(proj && antesDoOrcamento.includes(proj.status) ? { status: 'orcamento_gerado' } : {}),
    })
    .eq('id', projetoId)

  await supabase
    .from('projeto_itens')
    .update({ dados: { ...(item.dados || {}), url_pdf: urlPdf } })
    .eq('id', item.id)

  const calc = (item.dados as any)?.calculo || null
  await supabase.from('projeto_propostas_historico').insert({
    projeto_id: projetoId,
    url_pdf: urlPdf,
    pv_total: calc?.pv_total ?? null,
    pv_bruto: calc?.pv_total ?? null,
    modo_composicao: 'venda_direta',
    memoria_calculo: calc,
    gerado_por: user.id,
  })

  revalidatePath(`/projetos/${projetoId}/venda-direta`)
  revalidatePath(`/projetos/${projetoId}`)
  return { sucesso: true }
}
