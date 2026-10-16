'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'
import { garantirProjetoDaCategoria, projetosDoContato } from '@/lib/propostas/projetos-contato'
import { carregarPerfil } from '@/lib/spinzap/orcamento-lais'
import { carregarFaixasSecoes, secoesDoProjeto } from '@/lib/propostas/secoes-servidor'
import { kmDaCidade } from '@/lib/estacao-ve/proposta-recarga-servidor'
import { finalizarPropostaCategoria } from '@/lib/propostas/finalizar-proposta'
import { normalizarKitBess, type KitBess } from '@/lib/propostas/bess'
import type { CategoriaProposta } from '@/lib/propostas/categorias'
import type { FaixaSecao, SecaoProposta } from '@/lib/propostas/secoes'
import type { FechamentoVenda } from '@/lib/propostas/fechamento'
import {
  carregarParams, carregarCatalogoBess, calcularEntradaBess, semInternoBess, blocosPdfBess,
  carregarParamsOM, calcularEntradaOM, blocosPdfOM, TIPO_DO_SERVICO_OM,
  carregarFaixasTecnico, calcularEntradaTecnico, semInternoTecnico, tipoDoTecnico, blocosPdfTecnico,
  type CatalogoBess, type EntradaBess, type ResultadoBess, type ParamsOM, type EntradaOM, type ResultadoOM,
  type EntradaTecnico, type ResultadoTecnico,
} from '@/lib/propostas/categorias-servidor'

/**
 * Propostas de BESS, O&M, projetos técnicos e venda (PDV) dentro do Spinzap
 * (Kalebe 2026-10-14): mesmo formato do fotovoltaico — popup próprio, PDF
 * nos arquivos e envio no WhatsApp, sem abrir aba externa.
 */

async function acesso(conversa_id: string) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { erro: 'Não autenticado' as const }
  const { data: conv } = await supabase.from('wa_conversas').select('id').eq('id', conversa_id).maybeSingle()
  if (!conv) return { erro: 'Você não tem acesso a esta conversa' as const }
  const admin = createAdminClient()
  const [{ data: c }, { data: perfilUser }] = await Promise.all([
    admin.from('wa_conversas').select('id, cidade, uf, contato:contato_id(id, telefone, nome_exibicao, projeto_id, cliente_id)').eq('id', conversa_id).maybeSingle(),
    admin.from('profiles').select('role').eq('id', user.id).maybeSingle(),
  ])
  const contato = (c as any)?.contato
  if (!contato) return { erro: 'Conversa sem contato' as const }
  return { user, admin, conv: c as any, contato, ehAdmin: perfilUser?.role === 'admin' }
}
type Acesso = Exclude<Awaited<ReturnType<typeof acesso>>, { erro: any }>

async function projetoAberto(a: Acesso, categoria: CategoriaProposta) {
  return (await projetosDoContato(a.admin, a.contato)).find((p) => p.aberto && p.categoria === categoria) || null
}

async function garantir(a: Acesso, categoria: CategoriaProposta, tipo: string) {
  const proj = await garantirProjetoDaCategoria(a.admin, {
    contato: a.contato, categoria, tipo, usuario_id: a.user.id, papel: a.ehAdmin ? 'admin' : null, nome_cliente: a.contato.nome_exibicao || null,
  })
  if ('erro' in proj) return proj
  await a.admin.from('projetos').update({ consultor_id: a.user.id }).eq('id', proj.projeto_id).is('consultor_id', null)
  return proj
}

async function kmDoContato(a: Acesso): Promise<{ km: number; cidade: string | null }> {
  const perfil = await carregarPerfil(a.admin, a.contato.id)
  const cidade = perfil.contato.endereco?.cidade || a.conv.cidade || null
  const uf = perfil.contato.endereco?.uf || a.conv.uf || null
  return { km: await kmDaCidade(a.admin, cidade, uf), cidade: cidade ? `${cidade}${uf ? `/${uf}` : ''}` : null }
}

type Base = { eh_admin: boolean; faixas: FaixaSecao[]; secoes: SecaoProposta[]; projeto_id: string | null; projeto_codigo: string | null }

// ─────────────────────────── BESS ───────────────────────────

export async function dadosBessAction(conversa_id: string): Promise<(Base & {
  catalogo: CatalogoBess; kit: KitBess | null; margem_padrao_pct: number | null; comissao_padrao_pct: number | null
}) | { erro: string }> {
  const a = await acesso(conversa_id)
  if ('erro' in a) return { erro: a.erro as string }
  const proj = await projetoAberto(a, 'bess')
  const [catalogo, faixas, secoes, params, pj, it] = await Promise.all([
    carregarCatalogoBess(a.admin), carregarFaixasSecoes(a.admin), secoesDoProjeto(a.admin, proj?.id || null), carregarParams(a.admin),
    proj ? a.admin.from('projetos').select('kit_selecionado').eq('id', proj.id).maybeSingle() : Promise.resolve({ data: null }),
    proj ? a.admin.from('projeto_itens').select('dados').eq('projeto_id', proj.id).eq('tipo', 'bess').neq('status', 'removido').limit(1).maybeSingle() : Promise.resolve({ data: null }),
  ])
  const k = (pj as any)?.data?.kit_selecionado
  // Kalebe 2026-10-16: reabrir a proposta com a margem/comissão que o admin usou
  const salva = (it as any)?.data?.dados?.entrada_spinzap || {}
  const { getNum } = await import('@/lib/precificacao/calcular')
  return {
    eh_admin: a.ehAdmin, faixas, secoes, projeto_id: proj?.id || null, projeto_codigo: proj?.codigo || null,
    catalogo, kit: k?.modo === 'bess_puro' ? normalizarKitBess(k) : null,
    margem_padrao_pct: a.ehAdmin ? (salva.margem_pct ?? getNum(params, 'margem_contribuicao_perc', 20)) : null,
    comissao_padrao_pct: a.ehAdmin ? (salva.comissao_pct ?? getNum(params, 'comissao_vendedor_perc', 5)) : null,
  }
}

export async function calcularBessAction(conversa_id: string, e: EntradaBess): Promise<{ r: ResultadoBess } | { erro: string }> {
  const a = await acesso(conversa_id)
  if ('erro' in a) return { erro: a.erro as string }
  const r = calcularEntradaBess(e, await carregarParams(a.admin), a.ehAdmin)
  return { r: semInternoBess(r, a.ehAdmin) }
}

export async function gerarBessAction(conversa_id: string, e: EntradaBess, fechamento?: FechamentoVenda | null): Promise<{ url_pdf: string; projeto_id: string } | { erro: string }> {
  const a = await acesso(conversa_id)
  if ('erro' in a) return { erro: a.erro as string }
  const params = await carregarParams(a.admin)
  const r = calcularEntradaBess(e, params, a.ehAdmin)
  if (r.pendencia) return { erro: r.pendencia }
  if (!(r.calculo.pv_total > 0)) return { erro: 'Não deu pra calcular o preço' }
  const proj = await garantir(a, 'bess', 'bess')
  if ('erro' in proj) return proj
  const kit = normalizarKitBess(e.kit)
  const f = await finalizarPropostaCategoria(a.admin, {
    projetoId: proj.projeto_id, usuarioId: a.user.id, contatoId: a.contato.id,
    item: { tipo: 'bess', titulo: 'BESS standalone', dados: { kit, calculo: r.calculo, entrada_spinzap: { margem_pct: a.ehAdmin ? e.margem_pct ?? null : null, comissao_pct: a.ehAdmin ? e.comissao_pct ?? null : null } }, valor: r.calculo.pv_total },
    secoes: e.secoes || [],
    pdf: {
      subtitulo: 'Proposta de sistema de armazenamento (BESS)',
      blocos: blocosPdfBess(kit, r.calculo),
      rotulo_total: r.total_secoes > 0 ? 'Valor total (sistema e serviços adicionais)' : 'Valor total (equipamentos, projeto e execução)',
      garantias: [{ rotulo: 'Equipamentos', valor: 'garantia de fábrica' }, { rotulo: 'Instalação Spin', valor: '1 ano de mão de obra' }],
    },
    total: r.total,
    memoria: { ...r.calculo, total_secoes: r.total_secoes },
    modo: 'bess_spinzap', prefixoArquivo: 'proposta-bess', fechamento,
    // Mesmo formato do /kit → a tela /bess/proposta continua abrindo o projeto
    extraProjeto: { kit_selecionado: { modo: 'bess_puro', ...kit, preco_total_estimado: r.calculo.kit_bess_bruto, salvo_em: new Date().toISOString() }, tipo_projeto: 'bess' },
  })
  if ('erro' in f) return f
  revalidatePath('/spinzap')
  return { url_pdf: f.url_pdf, projeto_id: proj.projeto_id }
}

// ─────────────────────────── O&M ───────────────────────────

export async function dadosOMAction(conversa_id: string): Promise<(Base & {
  params: ParamsOM; faixas_om: FaixaSecao[]; km: number; cidade: string | null; entrada: EntradaOM | null
}) | { erro: string }> {
  const a = await acesso(conversa_id)
  if ('erro' in a) return { erro: a.erro as string }
  const proj = await projetoAberto(a, 'om')
  const [{ params, faixas: faixasOm }, faixas, secoes, local] = await Promise.all([
    carregarParamsOM(a.admin), carregarFaixasSecoes(a.admin), secoesDoProjeto(a.admin, proj?.id || null), kmDoContato(a),
  ])
  let entrada: EntradaOM | null = null
  if (proj) {
    const { data: itens } = await a.admin.from('projeto_itens').select('tipo, dados')
      .eq('projeto_id', proj.id).in('tipo', Object.values(TIPO_DO_SERVICO_OM)).neq('status', 'removido').limit(1)
    entrada = ((itens || [])[0] as any)?.dados?.entrada_spinzap || null
  }
  return {
    eh_admin: a.ehAdmin, faixas, secoes, projeto_id: proj?.id || null, projeto_codigo: proj?.codigo || null,
    params, faixas_om: faixasOm, km: local.km, cidade: local.cidade, entrada,
  }
}

export async function gerarOMAction(conversa_id: string, e: EntradaOM, fechamento?: FechamentoVenda | null): Promise<{ url_pdf: string; projeto_id: string } | { erro: string }> {
  const a = await acesso(conversa_id)
  if ('erro' in a) return { erro: a.erro as string }
  const { params } = await carregarParamsOM(a.admin)
  const r: ResultadoOM = calcularEntradaOM(e, params)
  if (r.erro) return { erro: r.erro }
  if (!(r.valor_servico > 0)) return { erro: 'Valor do serviço zerado' }
  const tipo = TIPO_DO_SERVICO_OM[e.servico]
  const proj = await garantir(a, 'om', tipo)
  if ('erro' in proj) return proj
  const titulo = e.servico === 'limpeza' ? 'Limpeza fotovoltaica' : e.servico === 'revisao' ? 'Manutenção com revisão' : 'Retirada e recolocação de placas'
  const entradasServico = e.servico === 'limpeza' ? e.limpeza : e.servico === 'revisao' ? e.revisao : e.retirada
  const f = await finalizarPropostaCategoria(a.admin, {
    projetoId: proj.projeto_id, usuarioId: a.user.id, contatoId: a.contato.id,
    // Mesmo formato das telas de serviço do projeto (entradas + resultado + valor final)
    item: { tipo, titulo, dados: { entradas: entradasServico, resultado_calculado: r.resultado, valor_final_com_ajuste: r.valor_servico, entrada_spinzap: e }, valor: r.valor_servico },
    secoes: e.secoes || [],
    pdf: {
      subtitulo: `Proposta de O&M — ${titulo}`,
      blocos: blocosPdfOM(e),
      rotulo_total: r.total_secoes > 0 ? 'Valor total (serviço e serviços adicionais)' : 'Valor total do serviço',
    },
    total: r.total,
    memoria: { servico: e.servico, subtotal: r.subtotal, ajuste: e.ajuste, valor_servico: r.valor_servico, total_secoes: r.total_secoes, memoria: r.memoria },
    modo: 'om_spinzap', prefixoArquivo: 'proposta-om', fechamento,
  })
  if ('erro' in f) return f
  revalidatePath('/spinzap')
  return { url_pdf: f.url_pdf, projeto_id: proj.projeto_id }
}

// ─────────────────────── Projetos técnicos ───────────────────────

export async function dadosTecnicoAction(conversa_id: string): Promise<(Base & {
  faixas_tecnico: FaixaSecao[]; entrada: EntradaTecnico | null; margem_padrao_pct: number | null; comissao_padrao_pct: number | null
}) | { erro: string }> {
  const a = await acesso(conversa_id)
  if ('erro' in a) return { erro: a.erro as string }
  const proj = await projetoAberto(a, 'projetos')
  const [faixasTec, faixas, secoes, params] = await Promise.all([
    carregarFaixasTecnico(a.admin), carregarFaixasSecoes(a.admin), secoesDoProjeto(a.admin, proj?.id || null), carregarParams(a.admin),
  ])
  let entrada: EntradaTecnico | null = null
  if (proj) {
    const { data: itens } = await a.admin.from('projeto_itens').select('dados')
      .eq('projeto_id', proj.id).in('tipo', ['srv_projeto_tecnico', 'srv_laudo_tecnico', 'srv_analise_rede']).neq('status', 'removido').limit(1)
    entrada = ((itens || [])[0] as any)?.dados?.entrada_spinzap || null
  }
  const { getNum } = await import('@/lib/precificacao/calcular')
  return {
    eh_admin: a.ehAdmin, faixas, secoes, projeto_id: proj?.id || null, projeto_codigo: proj?.codigo || null,
    faixas_tecnico: faixasTec, entrada,
    margem_padrao_pct: a.ehAdmin ? getNum(params, 'margem_contribuicao_perc', 20) : null,
    comissao_padrao_pct: a.ehAdmin ? getNum(params, 'comissao_vendedor_perc', 5) : null,
  }
}

export async function calcularTecnicoAction(conversa_id: string, e: EntradaTecnico): Promise<{ r: ResultadoTecnico } | { erro: string }> {
  const a = await acesso(conversa_id)
  if ('erro' in a) return { erro: a.erro as string }
  const [params, faixas] = await Promise.all([carregarParams(a.admin), carregarFaixasTecnico(a.admin)])
  return { r: semInternoTecnico(calcularEntradaTecnico(e, params, faixas, a.ehAdmin), a.ehAdmin) }
}

export async function gerarTecnicoAction(conversa_id: string, e: EntradaTecnico, fechamento?: FechamentoVenda | null): Promise<{ url_pdf: string; projeto_id: string } | { erro: string }> {
  const a = await acesso(conversa_id)
  if ('erro' in a) return { erro: a.erro as string }
  const [params, faixas] = await Promise.all([carregarParams(a.admin), carregarFaixasTecnico(a.admin)])
  const r = calcularEntradaTecnico(e, params, faixas, a.ehAdmin)
  if (r.erro) return { erro: r.erro }
  if (!(r.total > 0)) return { erro: 'Valor zerado' }
  const tipo = tipoDoTecnico(e)
  const proj = await garantir(a, 'projetos', tipo)
  if ('erro' in proj) {
    return /srv_projeto_tecnico|invalid input value/i.test(proj.erro) ? { erro: 'Falta rodar a migration 155 (tipo "Projeto técnico") no Supabase.' } : proj
  }
  const f = await finalizarPropostaCategoria(a.admin, {
    projetoId: proj.projeto_id, usuarioId: a.user.id, contatoId: a.contato.id,
    item: { tipo, titulo: 'Projeto técnico', dados: { linhas: r.linhas, entrada_spinzap: { ...e, margem_pct: a.ehAdmin ? e.margem_pct ?? null : null, comissao_pct: a.ehAdmin ? e.comissao_pct ?? null : null } }, valor: r.pv_custos + r.tabela },
    secoes: e.secoes || [],
    pdf: {
      subtitulo: 'Proposta de projetos técnicos',
      blocos: blocosPdfTecnico(e, r),
      rotulo_total: r.total_secoes > 0 ? 'Valor total (serviços técnicos e adicionais)' : 'Valor total',
      garantias: [{ rotulo: 'Documentos técnicos', valor: 'cópia digital + ART' }],
    },
    total: r.total,
    memoria: { linhas: r.linhas, custo: r.custo, pv_custos: r.pv_custos, tabela: r.tabela, margem_pct: r.margem_pct, comissao_pct: r.comissao_pct, imposto_pct: r.imposto_pct, total_secoes: r.total_secoes },
    modo: 'tecnico_spinzap', prefixoArquivo: 'proposta-tecnica', fechamento,
  })
  if ('erro' in f) return f
  revalidatePath('/spinzap')
  return { url_pdf: f.url_pdf, projeto_id: proj.projeto_id }
}

// ─────────────────────── Venda (ponto de venda) ───────────────────────

/** Abre a venda direta do contato: garante o projeto e devolve o mesmo que a tela /venda-direta usa. */
export async function dadosVendaDiretaAction(conversa_id: string): Promise<{
  projeto: any; dadosIniciais: any; catalogo: any[]; params: any; configEmpresa: any; ehAdmin: boolean
} | { erro: string }> {
  const a = await acesso(conversa_id)
  if ('erro' in a) return { erro: a.erro as string }
  const proj = await garantir(a, 'venda', 'venda_equipamentos')
  if ('erro' in proj) return proj
  const { precoVigente } = await import('@/lib/venda-direta/preco')
  const { dadosVazios } = await import('@/lib/venda-direta/tipos')
  const [{ data: projeto }, { data: item }, { data: produtos }, params, { data: configEmpresa }] = await Promise.all([
    a.admin.from('projetos').select('*').eq('id', proj.projeto_id).maybeSingle(),
    a.admin.from('projeto_itens').select('id, dados').eq('projeto_id', proj.projeto_id).eq('tipo', 'venda_equipamentos').neq('status', 'removido').limit(1).maybeSingle(),
    a.admin.from('produtos')
      .select('id, modelo, fabricante, descricao_curta, categoria, subcategoria, specs, precos_produtos(preco_venda, vigente_de, vigente_ate)')
      .eq('ativo', true).neq('categoria', 'frete').order('modelo').limit(5000),
    carregarParams(a.admin),
    a.admin.from('configuracoes_empresa').select('*').eq('singleton', true).maybeSingle(),
  ])
  if (!projeto) return { erro: 'Projeto não encontrado' }
  const p = projeto as any
  const catalogo = ((produtos || []) as any[]).map((x) => {
    const preco = precoVigente(x.precos_produtos) || 0
    return {
      id: x.id, modelo: x.modelo, fabricante: x.fabricante || null, descricao: x.descricao_curta || null,
      categoria: x.categoria || null, subcategoria: x.subcategoria || null,
      detalhe: typeof x.specs?.descricao === 'string' ? x.specs.descricao : null,
      preco_tabela: preco, sem_preco: preco <= 0,
    }
  })
  const base = dadosVazios()
  const salvo = ((item as any)?.dados || {}) as Record<string, any>
  const e = (p.cliente_endereco && typeof p.cliente_endereco === 'object') ? p.cliente_endereco : {}
  const nfProjeto = p.cliente_razao_social ? {
    nome: p.cliente_razao_social || '', documento: p.cliente_cpf_cnpj || '', email: p.cliente_email || '',
    telefone: p.cliente_telefone || p.cliente_whatsapp || '',
    endereco: { cep: e.cep || '', rua: e.rua || e.logradouro || '', numero: e.numero ? String(e.numero) : '', complemento: e.complemento || '', bairro: e.bairro || '', cidade: e.cidade || '', uf: e.uf || 'SC' },
  } : null
  const nf = salvo.nf?.nome ? salvo.nf : nfProjeto
  const dadosIniciais = {
    nf: { ...base.nf, ...(nf || {}), endereco: { ...base.nf.endereco, ...(nf?.endereco || {}) } },
    entrega: { ...base.entrega, ...(salvo.entrega || {}), endereco: { ...base.entrega.endereco, ...(salvo.entrega?.endereco || {}) } },
    itens: salvo.itens || [], frete: Number(salvo.frete) || 0, cupom: salvo.cupom || null, url_pdf: salvo.url_pdf || null,
  }
  return { projeto: p, dadosIniciais, catalogo, params, configEmpresa, ehAdmin: a.ehAdmin }
}
