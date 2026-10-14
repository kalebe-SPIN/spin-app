import type { createAdminClient } from '@/lib/supabase/admin'
import { calcularFormasPagamento, getNum, paramsToRecord, type ParametrosVigentes } from '@/lib/precificacao/calcular'
import { imagemComoDataUrl } from '@/lib/spinzap/orcamento-lais'
import {
  calcularPropostaRecarga, respostasPadrao,
  type EntradaRecarga, type ParametrosRecarga, type PropostaRecarga, type TipoEquipamentoRecarga,
} from './proposta-recarga'
import { gerarPdfPropostaRecarga } from './pdf-proposta-recarga'

/**
 * Lado servidor da proposta de estação de recarga (Kalebe 2026-10-14):
 * parâmetros, catálogo de carregadores/opcionais, cadastro de equipamento
 * novo, e "gerar" = salva no projeto + PDF nos arquivos (projeto e Spinzap).
 * Usado pelo Spinzap (conversa) e pela tela do projeto (/projetos/[id]/ve).
 */

type Admin = ReturnType<typeof createAdminClient>

export type EquipamentoCatalogoRecarga = {
  id: string
  modelo: string
  fabricante: string | null
  tipo: TipoEquipamentoRecarga
  potencia_kw: number
  /** Custo Spin vigente (0 = sob cotação: digita na linha) */
  preco: number
}

export type DadosRecarga = {
  equipamentos: EquipamentoCatalogoRecarga[]
  distancia_padrao_m: number
  km_deslocamento: number
  cidade: string | null
  salva: EntradaRecarga | null
  url_pdf: string | null
  projeto_id: string | null
  projeto_codigo: string | null
  eh_admin: boolean
  margem_padrao_pct: number | null
  comissao_padrao_pct: number | null
}

export async function carregarParametrosRecarga(admin: Admin): Promise<{ params: ParametrosRecarga; record: ParametrosVigentes }> {
  const { data } = await admin.from('parametros_precificacao')
    .select('chave, valor_numero, valor_json, unidade').is('vigente_ate', null).eq('ativo', true)
  const rec = paramsToRecord(data || [])
  return {
    record: rec,
    params: {
      diagrama_unifilar: getNum(rec, 'valor_diagrama_unifilar', 350),
      diagrama_trifilar: getNum(rec, 'valor_diagrama_trifilar', 250),
      diaria_eletrica: getNum(rec, 'valor_diaria_eletrica_predial', 350),
      horas_por_diaria: getNum(rec, 've_horas_por_diaria', 8),
      instaladores: getNum(rec, 've_instaladores', 2),
      horas_por_carregador: getNum(rec, 've_horas_instalacao_por_carregador', 2),
      dias_extra_alvenaria: getNum(rec, 've_dias_extra_alvenaria', 1),
      distancia_padrao_m: getNum(rec, 've_distancia_padrao_m', 5),
      valor_km: getNum(rec, 'valor_km_rodado', 2.5),
      margem_pct: getNum(rec, 'margem_contribuicao_perc', 20),
      comissao_pct: getNum(rec, 'comissao_vendedor_perc', 5),
      imposto_pct: getNum(rec, 'aliquota_simples_perc', 15),
      margem_minima_pct: getNum(rec, 'margem_minima_negociacao_perc', 15),
    },
  }
}

/** Preço vigente por produto (2 queries — o embed de precos_produtos já deu vazio no PostgREST). */
async function precosVigentes(admin: Admin, ids: string[]): Promise<Map<string, { venda: number; custo: number }>> {
  const mapa = new Map<string, { venda: number; custo: number }>()
  if (!ids.length) return mapa
  const { data } = await admin.from('precos_produtos').select('produto_id, preco_venda, preco_custo, vigente_de')
    .in('produto_id', ids).is('vigente_ate', null).order('vigente_de', { ascending: false })
  for (const p of (data || []) as any[]) {
    if (!mapa.has(p.produto_id)) mapa.set(p.produto_id, { venda: Number(p.preco_venda) || 0, custo: Number(p.preco_custo) || 0 })
  }
  return mapa
}

/** Totem, suporte e afins entram como opcionais; o resto da linha VE é carregador. */
const ehOpcional = (modelo: string, subcategoria: string | null) =>
  subcategoria === 've_opcional' || /totem|suporte|holder|pedestal/i.test(modelo)

export async function carregarEquipamentosRecarga(admin: Admin): Promise<EquipamentoCatalogoRecarga[]> {
  const { data } = await admin.from('produtos').select('id, modelo, fabricante, subcategoria, specs, sob_cotacao')
    .in('subcategoria', ['ve_wallbox', 've_opcional']).eq('ativo', true)
  const prods = (data || []) as any[]
  const precos = await precosVigentes(admin, prods.map((p) => p.id))
  return prods
    .map((p) => {
      const pr = precos.get(p.id)
      const s = (p.specs || {}) as Record<string, any>
      return {
        id: p.id as string,
        modelo: String(p.modelo || ''),
        fabricante: p.fabricante || null,
        tipo: (ehOpcional(String(p.modelo || ''), p.subcategoria) ? 'opcional' : 'carregador') as TipoEquipamentoRecarga,
        potencia_kw: Number(s.potencia_kw || s.potencia_nominal_ca_kw) || 0,
        preco: pr ? (pr.custo > 0 ? pr.custo : pr.venda) : 0,
      }
    })
    .sort((a, b) => a.modelo.localeCompare(b.modelo, 'pt-BR'))
}

/** Disjuntores e DPS do catálogo: modelo (maiúsculo) → preço de venda. */
export async function precosCatalogoMateriais(admin: Admin): Promise<Record<string, number>> {
  const { data } = await admin.from('produtos').select('id, modelo').in('categoria', ['disjuntor', 'dps']).eq('ativo', true)
  const prods = (data || []) as any[]
  const precos = await precosVigentes(admin, prods.map((p) => p.id))
  const out: Record<string, number> = {}
  for (const p of prods) {
    const v = precos.get(p.id)?.venda || 0
    if (v > 0) out[String(p.modelo || '').trim().toUpperCase()] = v
  }
  return out
}

/** km de ida da Spin até a cidade (cadastro em /admin/precificacao/cidades). */
export async function kmDaCidade(admin: Admin, cidade: string | null, uf: string | null): Promise<number> {
  if (!cidade) return 0
  const { data } = await admin.from('cidades_distancia').select('km')
    .ilike('cidade', cidade.trim()).eq('uf', String(uf || 'SC').toUpperCase()).eq('ativo', true).maybeSingle()
  return Number((data as any)?.km) || 0
}

/** Calcula no servidor com parâmetros e preços do banco (a tela não decide preço). */
export async function calcularNoServidor(admin: Admin, entrada: EntradaRecarga, ehAdmin: boolean): Promise<{ proposta: PropostaRecarga; params: ParametrosRecarga; record: ParametrosVigentes }> {
  const [{ params, record }, precos] = await Promise.all([carregarParametrosRecarga(admin), precosCatalogoMateriais(admin)])
  // Margem/comissão só o admin ajusta
  const e: EntradaRecarga = ehAdmin ? entrada : { ...entrada, margem_pct: null, comissao_pct: null }
  return { proposta: calcularPropostaRecarga(e, params, precos), params, record }
}

/** Esconde o interno (margem, comissão, imposto, desconto) de quem não é admin. */
export function visaoDoUsuario(p: PropostaRecarga, ehAdmin: boolean): PropostaRecarga {
  if (ehAdmin) return p
  return { ...p, margem: 0, comissao: 0, imposto: 0, desconto_max: 0, margem_pct: 0, comissao_pct: 0, imposto_pct: 0 }
}

export async function dadosBaseRecarga(admin: Admin, a: {
  projetoId: string | null
  cidade: string | null
  uf: string | null
  ehAdmin: boolean
}): Promise<DadosRecarga> {
  const [{ params }, equipamentos] = await Promise.all([carregarParametrosRecarga(admin), carregarEquipamentosRecarga(admin)])
  let salva: EntradaRecarga | null = null, url: string | null = null, codigo: string | null = null
  let cidade = a.cidade, uf = a.uf
  if (a.projetoId) {
    const { data: pj } = await admin.from('projetos').select('codigo, ve_recarga_selecionada, endereco_instalacao, cliente_endereco').eq('id', a.projetoId).maybeSingle()
    const sel = (pj as any)?.ve_recarga_selecionada
    if (sel?.versao === 2 && sel.entrada) salva = sel.entrada as EntradaRecarga
    url = sel?.url_pdf_proposta_ve || null
    codigo = (pj as any)?.codigo || null
    const end = (pj as any)?.endereco_instalacao || (pj as any)?.cliente_endereco || null
    cidade = cidade || end?.cidade || end?.municipio || null
    uf = uf || end?.uf || null
  }
  const km = await kmDaCidade(admin, cidade, uf)
  return {
    equipamentos,
    distancia_padrao_m: params.distancia_padrao_m,
    km_deslocamento: km,
    cidade: cidade ? `${cidade}${uf ? `/${String(uf).toUpperCase()}` : ''}` : null,
    salva: salva || null,
    url_pdf: url,
    projeto_id: a.projetoId,
    projeto_codigo: codigo,
    eh_admin: a.ehAdmin,
    margem_padrao_pct: a.ehAdmin ? params.margem_pct : null,
    comissao_padrao_pct: a.ehAdmin ? params.comissao_pct : null,
  }
}

export { respostasPadrao }

/** "Cadastrar novo" carregador ou opcional (totem, suporte…) direto da proposta. */
export async function cadastrarEquipamentoRecarga(admin: Admin, input: {
  tipo: TipoEquipamentoRecarga
  modelo: string
  fabricante?: string | null
  potencia_kw?: number | null
  preco: number
}, autor: string): Promise<{ equipamento: EquipamentoCatalogoRecarga } | { erro: string }> {
  const modelo = String(input.modelo || '').trim()
  if (!modelo) return { erro: 'Informe o nome/modelo do equipamento' }
  const preco = Number(input.preco)
  if (!(preco > 0)) return { erro: 'Informe o custo do equipamento' }
  const potencia = Number(input.potencia_kw) || 0
  if (input.tipo === 'carregador' && !(potencia > 0)) return { erro: 'Informe a potência do carregador (kW)' }
  const { data: criado, error } = await admin.from('produtos').insert({
    codigo_weg: null,
    codigo_interno_spin: `VE-${Date.now().toString(36).toUpperCase()}`,
    modelo,
    fabricante: String(input.fabricante || '').trim() || 'Não informado',
    categoria: 'outro',
    subcategoria: input.tipo === 'carregador' ? 've_wallbox' : 've_opcional',
    descricao_curta: modelo,
    descricao_tecnica: `Cadastrado na proposta de estação de recarga por ${autor}`,
    specs: input.tipo === 'carregador' ? { potencia_kw: potencia } : {},
    ativo: true,
    disponivel_estoque: true,
  }).select('id').single()
  if (error || !criado) return { erro: `Não consegui cadastrar: ${error?.message || 'sem detalhes'}` }
  await admin.from('precos_produtos').insert({
    produto_id: criado.id, preco_venda: preco, preco_custo: preco, vigente_de: new Date().toISOString().slice(0, 10),
  })
  return {
    equipamento: {
      id: criado.id as string, modelo, fabricante: String(input.fabricante || '').trim() || null,
      tipo: input.tipo, potencia_kw: input.tipo === 'carregador' ? potencia : 0, preco,
    },
  }
}

/**
 * Gera a proposta: recalcula no servidor, salva no projeto (compatível com a
 * tela antiga /ve/proposta), gera o PDF e guarda no histórico do projeto e
 * nos arquivos do contato do Spinzap.
 */
export async function gerarPropostaRecarga(admin: Admin, a: {
  projetoId: string
  entrada: EntradaRecarga
  ehAdmin: boolean
  usuarioId: string
  contatoId?: string | null
}): Promise<{ url_pdf: string; proposta: PropostaRecarga } | { erro: string }> {
  const { proposta, params, record } = await calcularNoServidor(admin, a.entrada, a.ehAdmin)
  if (!proposta.equipamentos.length) return { erro: 'Adicione pelo menos um equipamento' }
  const semCusto = proposta.equipamentos.filter((e) => !(e.preco_unitario > 0))
  if (semCusto.length) return { erro: `Falta o custo de: ${semCusto.map((e) => e.modelo).join(', ')}` }
  if (!(proposta.pv_total > 0)) return { erro: proposta.avisos[0] || 'Não deu pra calcular o preço' }

  const { data: pj } = await admin.from('projetos')
    .select('codigo, cliente_id, cliente_razao_social, cliente_cpf_cnpj, endereco_instalacao, cliente_endereco, wa_contato_id, ve_recarga_selecionada')
    .eq('id', a.projetoId).maybeSingle()
  if (!pj) return { erro: 'Projeto não encontrado' }
  const projeto = pj as any
  let nome = projeto.cliente_razao_social || null
  let documento = projeto.cliente_cpf_cnpj || null
  if ((!nome || !documento) && projeto.cliente_id) {
    const { data: c } = await admin.from('clientes').select('razao_social, cpf_cnpj').eq('id', projeto.cliente_id).maybeSingle()
    nome = nome || (c as any)?.razao_social || null
    documento = documento || (c as any)?.cpf_cnpj || null
  }
  const end = projeto.endereco_instalacao || projeto.cliente_endereco || {}
  const cidade = end?.cidade || end?.municipio ? `${end.cidade || end.municipio}${end.uf ? `/${String(end.uf).toUpperCase()}` : ''}` : null

  const { data: empresa } = await admin.from('configuracoes_empresa')
    .select('razao_social, cnpj, telefone, email, logo_url, rt_nome, rt_assinatura_url').limit(1).maybeSingle()
  const [assinatura, logo] = await Promise.all([
    imagemComoDataUrl((empresa as any)?.rt_assinatura_url), imagemComoDataUrl((empresa as any)?.logo_url),
  ])
  const formas = calcularFormasPagamento(proposta.pv_total, record)
  const pdf = gerarPdfPropostaRecarga({
    codigo_projeto: projeto.codigo || null,
    cliente_nome: nome || 'Cliente',
    cliente_documento: documento,
    cidade,
    proposta,
    respostas: a.entrada.respostas,
    formas_pagamento: formas,
    validade_dias: getNum(record, 'prazo_validade_orcamento_dias', 15),
    empresa: (empresa as any) || {},
    assinatura, logo,
  })
  const caminho = `${a.projetoId}/proposta-recarga-${Date.now()}.pdf`
  const up = await admin.storage.from('propostas-pdf').upload(caminho, Buffer.from(pdf), { contentType: 'application/pdf', upsert: false })
  if (up.error) return { erro: `Falha ao guardar o PDF: ${up.error.message}` }
  const url = admin.storage.from('propostas-pdf').getPublicUrl(caminho).data.publicUrl

  // Salva no projeto — mesmo campo da tela antiga (equipamentos/itens_ca/preço final)
  const p = proposta
  const principal = p.equipamentos.find((e) => e.tipo === 'carregador') || p.equipamentos[0]
  const km = Number(a.entrada.respostas.km_deslocamento) || 0
  const deslocamento = p.execucao.find((x) => x.chave === 'deslocamento')?.valor || 0
  const selecao = {
    versao: 2,
    entrada: { ...a.entrada, margem_pct: a.ehAdmin ? a.entrada.margem_pct ?? null : null, comissao_pct: a.ehAdmin ? a.entrada.comissao_pct ?? null : null },
    equipamentos: p.equipamentos.map((e) => ({
      produto_id: e.produto_id, codigo_weg: '', modelo: e.modelo, tipo: e.tipo, potencia_kw: e.potencia_kw, qtd: e.qtd, preco_unitario: e.preco_unitario,
    })),
    wallbox: { id: principal.produto_id, codigo_weg: '', modelo: principal.modelo, potencia_kw: principal.potencia_kw, preco_unitario: principal.preco_unitario },
    qtd: principal.qtd,
    itens_ca: p.materiais.map((m) => ({
      produto_id: m.codigo, codigo_weg: m.codigo, modelo: m.descricao, categoria: m.grupo, qtd: m.qtd, preco_unitario: m.preco_unitario,
    })),
    inclui_diagrama_unifilar: true,
    inclui_diagrama_trifilar: true,
    valor_diagrama_unifilar: params.diagrama_unifilar,
    valor_diagrama_trifilar: params.diagrama_trifilar,
    preco_diagramas_total: p.subtotal_projeto,
    deslocamento_km: km,
    deslocamento_km_total: km * 2,
    deslocamento_rs_km: params.valor_km,
    preco_deslocamento_total: deslocamento,
    preco_wallbox_total: p.subtotal_equipamentos,
    preco_acessorios_total: p.subtotal_materiais,
    preco_servicos_execucao: p.subtotal_servicos_execucao,
    preco_bruto: p.custo_total,
    base_impostavel: p.base_impostavel,
    margem_pct: p.margem_pct,
    comissao_pct: p.comissao_pct,
    impostos_pct: p.imposto_pct,
    margem_r: p.margem,
    comissao_r: p.comissao,
    impostos_r: p.imposto,
    potencia_efetiva_kw: p.potencia_total_kw,
    preco_final_cliente: p.pv_total,
    url_pdf_proposta_ve: url,
    gerado_em: new Date().toISOString(),
  }
  await admin.from('projetos').update({ ve_recarga_selecionada: selecao }).eq('id', a.projetoId)
  await admin.from('projeto_itens').update({ valor_estimado: p.pv_total })
    .eq('projeto_id', a.projetoId).eq('tipo', 've_recarga').neq('status', 'removido')
  await admin.from('projeto_propostas_historico').insert({
    projeto_id: a.projetoId, url_pdf: url, pv_total: p.pv_total, potencia_ca_kw: p.potencia_total_kw,
    modo_composicao: 'estacao_recarga', gerado_por: a.usuarioId,
    memoria_calculo: {
      margem_pct: p.margem_pct, comissao_pct: p.comissao_pct, impostos_pct: p.imposto_pct,
      equipamentos: p.subtotal_equipamentos, projeto: p.subtotal_projeto, materiais: p.subtotal_materiais,
      servicos_execucao: p.subtotal_servicos_execucao, custo_total: p.custo_total, desconto_max: p.desconto_max,
    },
  })

  // Arquivos do contato no Spinzap (do projeto ou de quem montou pela conversa)
  let contatoId = a.contatoId || projeto.wa_contato_id || null
  if (!contatoId) {
    const { data: c } = await admin.from('wa_contatos').select('id').eq('projeto_id', a.projetoId).limit(1).maybeSingle()
    contatoId = (c as any)?.id || null
  }
  if (contatoId) {
    await admin.from('spinzap_arquivos').insert({
      contato_id: contatoId, categoria: 'orcamento', url, nome: 'Proposta estação de recarga', mime: 'application/pdf',
      origem: 'gerado', projeto_id: a.projetoId, criado_por: a.usuarioId,
    })
  }
  return { url_pdf: url, proposta }
}
