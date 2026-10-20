'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'
import {
  montarOrcamentoLead, carregarCatalogoProposta, destinoDoExtra, aplicarSecoes, TIPOS_SISTEMA_FV,
  type EntradaOrcamentoLead, type OrcamentoLead, type OpcoesKit, type TipoSistemaFv,
} from '@/lib/spinzap/orcamento-lead'
import { carregarFaixasSecoes, salvarSecoesNoProjeto, secoesDoProjeto } from '@/lib/propostas/secoes-servidor'
import { rotuloSecao, type FaixaSecao, type SecaoProposta } from '@/lib/propostas/secoes'
import { auditarOrcamentoLead, type Auditoria } from '@/lib/spinzap/auditor-orcamento'
import { carregarPerfil } from '@/lib/spinzap/orcamento-lais'
import { nomearProposta } from '@/lib/downloads'
import { entradaFvDoProjeto, salvarEntradaFv, type EntradaFvSalva } from '@/lib/spinzap/entrada-fv'
import { garantirProjetoDaCategoria } from '@/lib/propostas/projetos-contato'
import { tarifaDeReferencia } from '@/lib/fatura/tarifa'
import { enviarPropostaPeloCanalAction } from '@/app/inbox/actions'

/**
 * "Montar proposta" direto da conversa do Spinzap (Kalebe 2026-10-13): mesmo
 * motor do Orçamento Rápido/proposta formal (catálogo + matriz de margem),
 * auditor e PDF resumido — o usuário confere e envia sem sair da conversa.
 * Dupla visão: margem e desconto máximo só pro admin.
 */

type Modo = 'consumo_kwh' | 'valor_mensal' | 'qtd_placas'
export type EntradaPropostaRapida = {
  modo: Modo
  valor: number
  inversor_kw?: number | null
  tipo_rede: 'monofasico' | 'bifasico' | 'trifasico'
  cidade: string
  /** Sistema (string/micro/híbrido), modelos e itens extras — Kalebe 2026-10-13 */
  opcoes?: OpcoesKit
  /** Seções incorporadas (aluguel, alvenaria, elétrica predial…) */
  secoes?: SecaoProposta[]
  /** Kalebe 2026-10-17: unidades beneficiárias (consumo + fatura) */
  beneficiarias?: BeneficiariaProposta[]
  /** Kalebe 2026-10-19 (multiempresa): CNPJ da proposta — define fornecedor, catálogo e marca do PDF (vazio = padrão) */
  empresa_id?: string | null
}

/** UC beneficiária no Montar proposta (Kalebe 2026-10-17) */
export type BeneficiariaProposta = {
  uc: string
  titular: string
  consumo_kwh: number
  arquivo_url?: string | null
  arquivo_nome?: string | null
  arquivo_tipo?: string | null
  /** Mensagem da conversa de onde veio a fatura (a análise completa fica nela) */
  mensagem_id?: string | null
  /** Meses de histórico lidos na fatura — 1 = só o consumo do mês, não a média (Kalebe 2026-10-19) */
  meses?: number | null
}

async function acesso(conversa_id: string) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { erro: 'Não autenticado' as const }
  const { data: conv } = await supabase.from('wa_conversas').select('id').eq('id', conversa_id).maybeSingle()
  if (!conv) return { erro: 'Você não tem acesso a esta conversa' as const }
  const admin = createAdminClient()
  const [{ data: c }, { data: perfilUser }] = await Promise.all([
    admin.from('wa_conversas').select('id, cidade, uf, produto, contexto_qualificacao, contato:contato_id(id, telefone, nome_exibicao, projeto_id, cliente_id)').eq('id', conversa_id).maybeSingle(),
    admin.from('profiles').select('role').eq('id', user.id).maybeSingle(),
  ])
  const contato = (c as any)?.contato
  if (!contato) return { erro: 'Conversa sem contato' as const }
  return { user, admin, conv: c as any, contato, ehAdmin: perfilUser?.role === 'admin' }
}

/** Fatura que o sistema já leu desse cliente: a da Laís (contexto) ou a do projeto. */
async function faturaConhecida(admin: ReturnType<typeof createAdminClient>, conv: any, contato: any) {
  const ctx = conv.contexto_qualificacao || {}
  if (ctx.fatura?.consumo_medio_kwh) {
    return {
      consumo_kwh: Number(ctx.fatura.consumo_medio_kwh) || null,
      tarifa_kwh: Number(ctx.fatura.tarifa?.conta_kwh || ctx.fatura.tarifa?.media_kwh) || null,
      subsidio: ctx.fatura.tarifa?.subsidio || null,
      razao_social: ctx.fatura.razao_social || null, cpf_cnpj: ctx.fatura.cpf_cnpj || null, tipo_ligacao: ctx.fatura.tipo_ligacao || null,
    }
  }
  if (contato.projeto_id) {
    const { data: p } = await admin.from('projetos').select('analise_fatura').eq('id', contato.projeto_id).maybeSingle()
    const a = (p as any)?.analise_fatura
    const consumo = Number(a?.consumo_medio_12m_kwh || a?.consumo_mes_kwh) || null
    if (consumo) {
      const t = a?.tarifa_calculada
      return {
        consumo_kwh: consumo,
        tarifa_kwh: Number(t?.tarifa_conta_kwh || t?.tarifa_media_kwh) || null,
        subsidio: t?.subsidio || null,
        razao_social: a?.razao_social || null, cpf_cnpj: a?.cpf_cnpj || null, tipo_ligacao: a?.tipo_ligacao || null,
      }
    }
  }
  return null
}

export async function dadosPropostaRapidaAction(conversa_id: string): Promise<{
  tipo_rede: string | null
  /** Do perfil (infra civil) — escolhe a estrutura do kit */
  tipo_telhado: string | null
  cidade: string | null
  fatura: { consumo_kwh: number | null; tarifa_kwh: number | null; subsidio: string | null } | null
  tarifa_base: { tarifa_kwh: number; amostras: number } | null
  projeto_id: string | null
  eh_admin: boolean
  faixas: FaixaSecao[]
  secoes: SecaoProposta[]
  /** Titular da fatura lida (vai no PDF) */
  titular: string | null
  /** PDFs/fotos do cliente ainda não lidos como fatura (botão "Ler fatura") */
  faturas_pendentes: Array<{ mensagem_id: string; nome: string; mime: string | null; criada_em: string; status: string | null }>
  /** Kalebe 2026-10-16: o que foi montado na última proposta (reabrir e editar) */
  salva: EntradaFvSalva | null
  /** Kalebe 2026-10-17: unidades beneficiárias já cadastradas (proposta salva ou fatura do projeto) */
  beneficiarias: BeneficiariaProposta[]
  /** Kalebe 2026-10-19: empresas que emitem proposta (só aparece o seletor com mais de uma) e a escolhida */
  empresas: Array<{ id: string; nome: string; cnpj: string | null; fornecedor: string | null }>
  empresa_id: string | null
} | { erro: string }> {
  const a = await acesso(conversa_id)
  if ('erro' in a) return { erro: a.erro as string }
  const perfil = await carregarPerfil(a.admin, a.contato.id)
  const fatura = await faturaConhecida(a.admin, a.conv, a.contato)
  const base = await tarifaDeReferencia(a.admin)
  const { projetosDoContato } = await import('@/lib/propostas/projetos-contato')
  const projetoFv = (await projetosDoContato(a.admin, a.contato)).find((p) => p.aberto && p.categoria === 'fotovoltaico')
  const { faturasNaoLidas } = await import('@/lib/spinzap/fatura-conversa')
  const [faixas, secoes, pendentes, salva] = await Promise.all([
    carregarFaixasSecoes(a.admin), secoesDoProjeto(a.admin, projetoFv?.id || null), faturasNaoLidas(a.admin, conversa_id),
    entradaFvDoProjeto(a.admin, projetoFv?.id || null),
  ])
  let beneficiarias: BeneficiariaProposta[] = salva?.entrada?.beneficiarias || []
  if (!salva?.entrada?.beneficiarias && projetoFv?.id) {
    const { data: pjb } = await a.admin.from('projetos').select('beneficiarias').eq('id', projetoFv.id).maybeSingle()
    beneficiarias = (((pjb as any)?.beneficiarias || []) as any[]).map((b) => ({
      uc: b.uc || '', titular: b.titular || '',
      consumo_kwh: Math.round(Number(b.analise?.consumo_medio_12m_kwh || b.analise?.consumo_mes_kwh || b.analise?.consumo_medio_kwh || 0)),
      arquivo_url: b.arquivo_url || null, arquivo_nome: b.arquivo_nome || null, arquivo_tipo: b.arquivo_tipo || null, mensagem_id: null,
    })).filter((b) => b.consumo_kwh > 0)
  }
  // Multiempresa: a da proposta salva, senão a do projeto, senão a padrão
  const { empresasAtivas } = await import('@/lib/empresas/empresas')
  const lista = (await empresasAtivas(a.admin)).filter((x) => x.id)
  let empresaId: string | null = (salva?.entrada as any)?.empresa_id || null
  if (!empresaId && projetoFv?.id) {
    const { data: pje } = await a.admin.from('projetos').select('empresa_id').eq('id', projetoFv.id).maybeSingle()
    empresaId = (pje as any)?.empresa_id || null
  }
  if (!empresaId || !lista.some((x) => x.id === empresaId)) empresaId = lista.find((x) => x.padrao)?.id || lista[0]?.id || null
  return {
    empresas: lista.map((x) => ({ id: x.id!, nome: x.nome, cnpj: x.cnpj, fornecedor: x.fornecedor_nome })),
    empresa_id: empresaId,
    beneficiarias,
    salva,
    faixas,
    secoes,
    titular: fatura?.razao_social || null,
    faturas_pendentes: pendentes,
    tipo_rede: perfil.infra_eletrica.tipo_rede || fatura?.tipo_ligacao || null,
    tipo_telhado: perfil.infra_civil.tipo_telhado || null,
    cidade: perfil.contato.endereco?.cidade || a.conv.cidade || null,
    fatura: fatura ? { consumo_kwh: fatura.consumo_kwh, tarifa_kwh: fatura.tarifa_kwh, subsidio: fatura.subsidio } : null,
    tarifa_base: base ? { tarifa_kwh: base.tarifa_conta_kwh || base.tarifa_kwh, amostras: base.amostras } : null,
    projeto_id: projetoFv?.id || null,
    eh_admin: a.ehAdmin,
  }
}

/**
 * "Ler fatura" no Montar proposta (Kalebe 2026-10-14): lê o PDF/foto que o
 * cliente mandou e devolve o que vai pros campos (consumo, rede, cidade).
 * Também grava no cadastro do cliente, no contexto da conversa e nos arquivos.
 */
export async function lerFaturaPropostaAction(conversa_id: string, mensagem_id: string): Promise<
  { consumo_kwh: number; meses: number; tarifa_kwh: number | null; subsidio: string | null; tipo_rede: string | null; cidade: string | null; titular: string | null; uc: string | null } | { erro: string }
> {
  const a = await acesso(conversa_id)
  if ('erro' in a) return { erro: a.erro as string }
  const { data: m } = await a.admin.from('wa_mensagens').select('conversa_id').eq('id', mensagem_id).maybeSingle()
  if ((m as any)?.conversa_id !== conversa_id) return { erro: 'Arquivo não é desta conversa' }
  const { lerFaturaDaMensagem } = await import('@/lib/spinzap/fatura-conversa')
  // Já lida → devolve o que leu; lendo agora (webhook) → pede pra aguardar; erro/descartada → lê de novo
  const r = await lerFaturaDaMensagem(a.admin, { mensagem_id, origem: 'usuario', usuario_id: a.user.id })
  if ('erro' in r) return { erro: r.erro }
  const f = r.fatura
  revalidatePath('/spinzap')
  return {
    consumo_kwh: f.consumo_kwh, meses: f.meses, tarifa_kwh: f.tarifa_kwh, subsidio: f.subsidio,
    tipo_rede: f.tipo_ligacao, cidade: f.cidade, titular: f.razao_social, uc: f.uc,
  }
}

/** Entrada da tela → entrada do motor (tarifa: da fatura do cliente; senão a da base). */
async function entradaDoMotor(a: Exclude<Awaited<ReturnType<typeof acesso>>, { erro: any }>, e: EntradaPropostaRapida): Promise<EntradaOrcamentoLead | { erro: string }> {
  const valor = Number(e.valor)
  if (!(valor > 0)) return { erro: 'Informe o valor' }
  if (e.modo === 'consumo_kwh') return { modo: 'consumo_kwh', consumo_kwh: valor }
  if (e.modo === 'qtd_placas') return { modo: 'qtd_placas', qtd_placas: Math.round(valor), inversor_kw: Number(e.inversor_kw) || null }
  const fatura = await faturaConhecida(a.admin, a.conv, a.contato)
  if (fatura?.tarifa_kwh) return { modo: 'valor_mensal', valor_mensal: valor, tarifa: { tarifa_kwh: fatura.tarifa_kwh, fonte: 'fatura', subsidio: fatura.subsidio } }
  const base = await tarifaDeReferencia(a.admin)
  if (base) return { modo: 'valor_mensal', valor_mensal: valor, tarifa: { tarifa_kwh: base.tarifa_conta_kwh || base.tarifa_kwh, fonte: 'base', amostras: base.amostras } }
  return { erro: 'Ainda não há fatura desse cliente nem base de tarifas pra converter o valor da conta — use o consumo em kWh' }
}

async function calcular(a: Exclude<Awaited<ReturnType<typeof acesso>>, { erro: any }>, e: EntradaPropostaRapida) {
  const entrada = await entradaDoMotor(a, e)
  if ('erro' in entrada) return entrada
  const perfil = await carregarPerfil(a.admin, a.contato.id)
  // A rede escolhida na tela vale pro cálculo e pro auditor
  perfil.infra_eletrica = { ...perfil.infra_eletrica, tipo_rede: e.tipo_rede }
  const telhado = e.opcoes?.complementos_cc?.tipo_telhado
  if (telhado) perfil.infra_civil = { ...perfil.infra_civil, tipo_telhado: telhado }
  const cidade = e.cidade?.trim() || null
  if (cidade) perfil.contato = { ...perfil.contato, endereco: { ...(perfil.contato.endereco || {}), cidade } }
  // Beneficiárias: o consumo delas soma no dimensionamento
  const bens = (e.beneficiarias || []).filter((b) => Number(b.consumo_kwh) > 0)
  // Multiempresa: a empresa escolhida define o catálogo (fornecedor) — o servidor decide, não a tela
  const { empresaPorId, filtroCatalogoDaEmpresa } = await import('@/lib/empresas/empresas')
  const empresa = await empresaPorId(a.admin, e.empresa_id || null)
  const opcoes = {
    ...(e.opcoes || {}), catalogo: filtroCatalogoDaEmpresa(empresa),
    beneficiarias: bens.length ? { qtd: bens.length, consumo_kwh: bens.reduce((s, b) => s + Number(b.consumo_kwh), 0) } : null,
  }
  const montado = await montarOrcamentoLead(a.admin, { entrada, tipo_rede_perfil: e.tipo_rede, cidade, opcoes })
  if ('erro' in montado) return montado
  const orc = await aplicarSecoes(a.admin, montado, e.secoes)
  return { orc, auditoria: auditarOrcamentoLead(orc, perfil), perfil, cidade, empresa }
}

// Dupla visão: fora do admin, nada de margem nem preço de item (só o total ao cliente)
const semInterno = (o: OrcamentoLead, admin: boolean): OrcamentoLead => (admin ? o : {
  ...o,
  interno: { margem_pct: 0, desconto_max_negociacao: 0 },
  complementos: o.complementos
    ? { ...o.complementos, total: 0, itens: o.complementos.itens.map((i) => ({ ...i, preco_unitario: 0, subtotal: 0 })) }
    : o.complementos,
})

export async function calcularPropostaRapidaAction(conversa_id: string, e: EntradaPropostaRapida): Promise<
  { orcamento: OrcamentoLead; auditoria: Auditoria; mostra_interno: boolean } | { erro: string }
> {
  const a = await acesso(conversa_id)
  if ('erro' in a) return { erro: a.erro as string }
  const r = await calcular(a, e)
  if ('erro' in r) return r
  return { orcamento: semInterno(r.orc, a.ehAdmin), auditoria: r.auditoria, mostra_interno: a.ehAdmin }
}

type Acesso = Exclude<Awaited<ReturnType<typeof acesso>>, { erro: any }>
type Calculado = Exclude<Awaited<ReturnType<typeof calcular>>, { erro: string }>

/** Projeto da categoria fotovoltaica do contato (cria um novo se não houver aberto). */
async function projetoFvDoContato(a: Acesso, r: Calculado): Promise<{ projeto_id: string } | { erro: string }> {
  const etiqueta = String(a.conv.produto || '')
  const tipoItem = r.orc.tipo_sistema === 'hibrido' ? 'fv_hibrido' : etiqueta.startsWith('fv_') ? etiqueta : 'fv_ongrid'
  const proj = await garantirProjetoDaCategoria(a.admin, {
    contato: a.contato, categoria: 'fotovoltaico', tipo: tipoItem, usuario_id: a.user.id, papel: a.ehAdmin ? 'admin' : null,
    nome_cliente: r.perfil.contato.primeiro_nome || a.contato.nome_exibicao || null,
  })
  if ('erro' in proj) return proj
  // Quem montou vira o consultor do projeto, se ainda não tiver
  await a.admin.from('projetos').update({ consultor_id: a.user.id }).eq('id', proj.projeto_id).is('consultor_id', null)
  return { projeto_id: proj.projeto_id }
}

/**
 * Dados pro template da PROPOSTA OFICIAL (components/PropostaPDFTemplate —
 * o mesmo PDF de /projetos/[id]/orcamento). Kalebe 2026-10-15: "quero que a
 * proposta seja igual à proposta oficial que sai via projetos". O PDF é
 * desenhado no navegador (como no projeto) e depois registrado no servidor.
 */
export type DadosPdfOficial = {
  projeto: Record<string, any>
  pv_total: number
  /** Kalebe 2026-10-19: dados da empresa escolhida (marca, CNPJ, logo, quem assina) */
  config_empresa: Record<string, any> & { logo_url: string | null; razao_social: string | null; cnpj: string | null; rt_nome: string | null }
  campanha: { titulo: string; subtitulo?: string | null; condicao_especial: string; vigente_ate?: string | null } | null
}

export async function prepararPdfOficialPropostaRapidaAction(conversa_id: string, e: EntradaPropostaRapida): Promise<
  { projeto_id: string; nome_arquivo: string; dados: DadosPdfOficial } | { erro: string }
> {
  const a = await acesso(conversa_id)
  if ('erro' in a) return { erro: a.erro as string }
  const r = await calcular(a, e)
  if ('erro' in r) return r
  const proj = await projetoFvDoContato(a, r)
  if ('erro' in proj) return proj
  const o = r.orc
  const [{ data: pj }, fatura] = await Promise.all([
    a.admin.from('projetos').select('id, codigo, cliente_razao_social, cliente_cpf_cnpj, analise_fatura, campanha_aplicada_id').eq('id', proj.projeto_id).maybeSingle(),
    faturaConhecida(a.admin, a.conv, a.contato),
  ])
  // Marca do PDF = empresa escolhida no kit (sem a migration 158: a de configuracoes_empresa)
  const { configEmpresaDoPdf } = await import('@/lib/empresas/empresas')
  const emp = configEmpresaDoPdf(r.empresa)
  const p = (pj || {}) as any
  // Histórico de consumo da fatura (gráfico consumo × geração): do projeto FV ou do projeto principal do contato
  let analise = p.analise_fatura || null
  if (!analise?.historico_12_meses?.length && a.contato.projeto_id && a.contato.projeto_id !== proj.projeto_id) {
    const { data: principal } = await a.admin.from('projetos').select('analise_fatura').eq('id', a.contato.projeto_id).maybeSingle()
    if ((principal as any)?.analise_fatura?.historico_12_meses?.length) analise = (principal as any).analise_fatura
  }
  let campanha: DadosPdfOficial['campanha'] = null
  if (p.campanha_aplicada_id) {
    const { data: c } = await a.admin.from('campanhas_mes').select('titulo, subtitulo, condicao_especial, vigente_ate').eq('id', p.campanha_aplicada_id).maybeSingle()
    if (c) campanha = c as any
  }
  const potenciaCa = Math.round(o.inversor.potencia_kw * o.inversor.qtd * 1000) / 1000
  const uf = r.perfil.contato.endereco?.uf || a.conv.uf || 'SC'
  const cliente = fatura?.razao_social || p.cliente_razao_social || a.contato.nome_exibicao || 'Cliente'
  const projeto = {
    id: proj.projeto_id,
    codigo: p.codigo || '',
    // Bloco Cliente do PDF: só nome + CPF/CNPJ
    cliente_razao_social: cliente,
    cliente_cpf_cnpj: fatura?.cpf_cnpj || p.cliente_cpf_cnpj || null,
    cliente_endereco: { cidade: r.cidade || null, uf },
    uf,
    kit_selecionado: {
      placa: { modelo: o.placa.modelo, potencia_wp: o.placa.potencia_wp },
      qtd_placas: o.qtd_placas,
      inversor: { modelo: o.inversor.modelo, potencia_kw: o.inversor.potencia_kw },
      qtd_inversores: o.inversor.qtd,
      potencia_cc_kwp: o.kwp,
      potencia_ca_kw: potenciaCa,
      fci_pct: potenciaCa > 0 ? (o.kwp / potenciaCa) * 100 : 0,
    },
    // Já somados no preço: aparecem como "incluso", sem valor (dupla visão)
    extras_proposta: [
      ...o.extras.map((x) => ({ secao: x.destino === 'kit' ? 'kit_weg' : 'lista_ca', produto_id: x.produto_id, descricao: x.descricao, qtd: x.qtd, valor: 0 })),
      ...(o.secoes || []).map((s) => ({ secao: 'incluso', descricao: rotuloSecao(s).titulo, qtd: 1, valor: 0 })),
    ],
    analise_fatura: analise,
    desconto_admin_pct: 0,
    desconto_admin_valor: 0,
    assinatura_cliente: null,
  }
  return {
    projeto_id: proj.projeto_id,
    nome_arquivo: nomearProposta({ cliente, potenciaCcKwp: o.kwp, potenciaCaKw: potenciaCa }),
    dados: { projeto, pv_total: o.pv_total, config_empresa: emp, campanha },
  }
}

/**
 * Registra o PDF oficial já enviado pro storage (o navegador desenha e sobe,
 * como em /projetos/[id]/orcamento): histórico do projeto, seções e arquivos
 * do contato. Recalcula no servidor — os valores não vêm da tela.
 */
export async function registrarPdfPropostaRapidaAction(conversa_id: string, projeto_id: string, url_pdf: string, e: EntradaPropostaRapida): Promise<
  { sucesso: true } | { erro: string }
> {
  const a = await acesso(conversa_id)
  if ('erro' in a) return { erro: a.erro as string }
  const { projetosDoContato } = await import('@/lib/propostas/projetos-contato')
  if (!(await projetosDoContato(a.admin, a.contato)).some((p) => p.id === projeto_id)) return { erro: 'Projeto não é deste contato' }
  if (!url_pdf.includes(`/propostas-pdf/${projeto_id}/`)) return { erro: 'PDF inválido' }
  const r = await calcular(a, e)
  if ('erro' in r) return r
  const o = r.orc
  if (r.empresa.id) await a.admin.from('projetos').update({ empresa_id: r.empresa.id }).eq('id', projeto_id)
  await salvarSecoesNoProjeto(a.admin, projeto_id, o.secoes || [], a.user.id)
  // Kalebe 2026-10-16: guarda o que foi montado pra reabrir/editar e fechar a venda
  await salvarEntradaFv(a.admin, projeto_id, e, o)
  // Kalebe 2026-10-17: beneficiárias no projeto (mesmo formato da fatura do projeto)
  if (Array.isArray(e.beneficiarias)) await salvarBeneficiariasNoProjeto(a.admin, projeto_id, e.beneficiarias)
  // Valor da proposta no projeto (dashboard: "em negociação", funil)
  const { registrarPropostaNoProjeto } = await import('@/lib/propostas/registrar-no-projeto')
  await registrarPropostaNoProjeto(a.admin, projeto_id, { valor: o.pv_total, url_pdf })
  await a.admin.from('projeto_propostas_historico').insert({
    projeto_id, url_pdf, pv_total: o.pv_total, pv_bruto: o.pv_total, potencia_cc_kwp: o.kwp,
    potencia_ca_kw: Math.round(o.inversor.potencia_kw * o.inversor.qtd * 100) / 100, modo_composicao: 'orcamento_spinzap',
    memoria_calculo: { ...o.interno, complementos: o.complementos || null, extras: o.extras, secoes: o.secoes || [] }, gerado_por: a.user.id,
  })
  await a.admin.from('spinzap_arquivos').insert({
    contato_id: a.contato.id, categoria: 'orcamento', url: url_pdf, nome: 'Proposta fotovoltaica', mime: 'application/pdf',
    origem: 'gerado', projeto_id, criado_por: a.user.id,
  })
  revalidatePath('/spinzap')
  return { sucesso: true }
}

/** Envia no WhatsApp o PDF já gerado (mesmo envio de proposta do Spinzap: CRM, follow-up, modelo fora da janela). */
export async function enviarPdfPropostaRapidaAction(conversa_id: string, projeto_id: string, url_pdf: string, legenda: string, nome_arquivo?: string, pos_venda?: boolean): Promise<
  { sucesso: true } | { erro: string }
> {
  const a = await acesso(conversa_id)
  if ('erro' in a) return { erro: a.erro as string }
  const { projetosDoContato } = await import('@/lib/propostas/projetos-contato')
  const doContato = await projetosDoContato(a.admin, a.contato)
  if (!doContato.some((p) => p.id === projeto_id)) return { erro: 'Projeto não é deste contato' }
  if (!/\/propostas-pdf\//.test(url_pdf)) return { erro: 'PDF inválido' }
  const r = await enviarPropostaPeloCanalAction({
    projeto_id, url_pdf, nome_arquivo: nome_arquivo && /^[\w .-]+\.pdf$/i.test(nome_arquivo) ? nome_arquivo : 'Orcamento-Spin-Solar.pdf',
    legenda: String(legenda || '').trim().slice(0, 900) || 'Segue o seu orçamento de energia solar ☀️',
    pos_venda: !!pos_venda,
  })
  if ('erro' in r) return { erro: r.erro }
  return { sucesso: true }
}

const ROTULO_CATEGORIA: Record<string, string> = {
  bateria: 'Baterias', cabo_ca: 'Cabos CA', cabo_cc: 'Cabos CC', conector: 'Conectores', disjuntor: 'Disjuntores',
  dps: 'Proteção (DPS)', estrutura: 'Estruturas', monitoramento: 'Monitoramento e controle', outro: 'Outros',
  quadro: 'Quadros', smart_meter: 'Medidores', string_box: 'String box e junção', otimizador: 'Otimizadores',
}

/**
 * Opções do gerador solar (Kalebe 2026-10-13): placas, inversores por tipo de
 * sistema (string, micro, híbrido) e itens extras agrupados por categoria do
 * catálogo. Sem preço na tela — o preço sai só no total (dupla visão).
 */
export async function opcoesKitPropostaAction(empresa_id?: string | null): Promise<{
  placas: Array<{ id: string; rotulo: string; potencia_wp: number }>
  /** potência/entradas pra prévia do kit na tela; `peso` = custo relativo (desempate de micro, sem expor preço) */
  inversores: Record<TipoSistemaFv, Array<{ id: string; rotulo: string; fases: string | null; potencia_kw: number; entradas: number | null; peso: number }>>
  extras: Array<{ categoria: string; rotulo: string; itens: Array<{ id: string; rotulo: string; destino: 'kit' | 'lista_ca' }> }>
} | { erro: string }> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { erro: 'Não autenticado' }
  const admin = createAdminClient()
  // Kalebe 2026-10-19: catálogo do fornecedor da empresa escolhida
  const { empresaPorId, filtroCatalogoDaEmpresa } = await import('@/lib/empresas/empresas')
  const catalogo = await carregarCatalogoProposta(admin, filtroCatalogoDaEmpresa(await empresaPorId(admin, empresa_id || null)))
  const kw = (n: number | null) => (n ? `${String(n).replace('.', ',')} kW` : '')
  // Potência em ordem crescente (a ordem carrega sentido)
  const placas = catalogo.filter((p) => p.categoria === 'placa' && p.potencia_wp && p.disponivel)
    .sort((a, b) => a.potencia_wp! - b.potencia_wp! || a.modelo.localeCompare(b.modelo, 'pt-BR'))
    .map((p) => ({ id: p.id, potencia_wp: p.potencia_wp!, rotulo: `${p.potencia_wp} Wp · ${p.descricao.replace(/^\d+\s*Wp\s*-\s*/i, '') || p.modelo}` }))
  const inversores = Object.fromEntries(TIPOS_SISTEMA_FV.map((t) => {
    const lista = catalogo.filter((p) => p.categoria === 'inversor' && p.subcategoria === t.subcategoria && p.potencia_kw && p.disponivel)
    const menor = Math.min(...lista.map((p) => p.preco_venda).filter((v) => v > 0), Infinity)
    return [t.valor, lista
      .sort((a, b) => a.potencia_kw! - b.potencia_kw! || a.modelo.localeCompare(b.modelo, 'pt-BR'))
      .map((p) => ({
        id: p.id, fases: p.fases, potencia_kw: p.potencia_kw!, entradas: p.entradas,
        peso: Number.isFinite(menor) && p.preco_venda > 0 ? Math.round((p.preco_venda / menor) * 1000) / 1000 : 1,
        rotulo: `${p.modelo} · ${kw(p.potencia_kw)}${p.fases ? ` · ${p.fases === 'tri' ? 'trifásico' : p.fases === 'bi' ? 'bifásico' : 'monofásico'}` : ''}${t.valor === 'micro' && p.entradas ? ` · ${p.entradas} placas` : ''}`,
      }))]
  })) as Record<TipoSistemaFv, Array<{ id: string; rotulo: string; fases: string | null; potencia_kw: number; entradas: number | null; peso: number }>>
  // Extras: tudo com preço, menos placa, inversor (exceto otimizador) e frete (o motor calcula)
  const grupos = new Map<string, Array<{ id: string; rotulo: string; destino: 'kit' | 'lista_ca' }>>()
  for (const p of catalogo) {
    if (p.categoria === 'placa' || p.categoria === 'frete') continue
    if (p.categoria === 'inversor' && p.subcategoria !== 'otimizador') continue
    const chave = p.categoria === 'inversor' ? 'otimizador' : p.categoria
    if (!grupos.has(chave)) grupos.set(chave, [])
    // Sem estoque continua escolhível (como no kit manual), mas avisado
    grupos.get(chave)!.push({ id: p.id, rotulo: `${p.descricao || p.modelo}${p.disponivel ? '' : ' · sem estoque'}`, destino: destinoDoExtra(p) })
  }
  const extras = Array.from(grupos.entries())
    .map(([categoria, itens]) => ({
      categoria,
      rotulo: ROTULO_CATEGORIA[categoria] || categoria.replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase()),
      itens: itens.sort((a, b) => a.rotulo.localeCompare(b.rotulo, 'pt-BR')),
    }))
    .sort((a, b) => a.rotulo.localeCompare(b.rotulo, 'pt-BR'))
  return { placas, inversores, extras }
}

// ─────────────────────── Unidades beneficiárias (Kalebe 2026-10-17) ───────────────────────

const CORES_UC = ['#587FFF', '#5FCF80', '#F17A5C', '#B78BFF', '#4EC5C9', '#F5A623', '#EC4899', '#14B8A6']

/** Grava em projetos.beneficiarias no formato da tela de fatura do projeto (o dimensionamento de lá lê daqui). */
async function salvarBeneficiariasNoProjeto(admin: ReturnType<typeof createAdminClient>, projetoId: string, lista: BeneficiariaProposta[]) {
  const validas = lista.filter((b) => Number(b.consumo_kwh) > 0)
  const ids = validas.map((b) => b.mensagem_id).filter(Boolean) as string[]
  const { data: msgs } = ids.length ? await admin.from('wa_mensagens').select('id, dados').in('id', ids) : { data: [] as any[] }
  const analiseDe = (id?: string | null) => (msgs || []).find((m: any) => m.id === id)?.dados?.fatura_lida?.analise || null
  const beneficiarias = validas.map((b, i) => {
    const lida = analiseDe(b.mensagem_id)
    const consumo = Math.round(Number(b.consumo_kwh))
    return {
      ordem: i + 1, uc: b.uc || '', titular: b.titular || '',
      // Consumo informado na tela manda (pode ter sido ajustado à mão)
      analise: { ...(lida || {}), uc: b.uc || lida?.uc || null, razao_social: b.titular || lida?.razao_social || null, consumo_medio_kwh: consumo, consumo_medio_12m_kwh: consumo },
      cor_grafico: CORES_UC[(i + 1) % CORES_UC.length],
      arquivo_url: b.arquivo_url || undefined, arquivo_nome: b.arquivo_nome || undefined, arquivo_tipo: b.arquivo_tipo || undefined,
      status: 'ok',
    }
  })
  await admin.from('projetos').update({
    beneficiarias, ucs_beneficiarias: beneficiarias.map((b) => b.uc).filter(Boolean),
  }).eq('id', projetoId)
}

/** Arquivos (PDF/foto) da conversa pra escolher a fatura de uma beneficiária. */
export async function arquivosFaturaConversaAction(conversa_id: string): Promise<
  { arquivos: Array<{ mensagem_id: string; nome: string; mime: string | null; criada_em: string; direcao: string; lida_uc: string | null; lida_consumo: number | null; principal: boolean }> } | { erro: string }
> {
  const a = await acesso(conversa_id)
  if ('erro' in a) return { erro: a.erro as string }
  const { data } = await a.admin.from('wa_mensagens').select('id, texto, midia_mime, criada_em, direcao, dados')
    .eq('conversa_id', conversa_id).not('midia_url', 'is', null).order('criada_em', { ascending: false }).limit(40)
  const arquivos = ((data || []) as any[])
    .filter((m) => /pdf|image\//i.test(String(m.midia_mime || '')))
    .map((m) => ({
      mensagem_id: m.id, nome: m.texto || (/pdf/i.test(m.midia_mime || '') ? 'PDF' : 'Foto'), mime: m.midia_mime || null,
      criada_em: m.criada_em, direcao: m.direcao,
      lida_uc: m.dados?.fatura_lida?.resumo?.uc || null, lida_consumo: m.dados?.fatura_lida?.resumo?.consumo_kwh ?? null,
      // Lida pelo "Ler fatura" da UC principal: não entra de novo como beneficiária
      principal: m.dados?.fatura_lida?.status === 'ok' && !m.dados?.fatura_lida?.beneficiaria,
    }))
  return { arquivos }
}

/**
 * Lê a fatura de uma UC beneficiária (Kalebe 2026-10-17). Diferente do "Ler
 * fatura" da UC principal: não mexe no contexto da conversa nem no cadastro
 * do cliente — só devolve UC, titular e consumo e guarda o arquivo no perfil.
 */
export async function lerFaturaBeneficiariaAction(conversa_id: string, mensagem_id: string): Promise<
  (Required<Pick<BeneficiariaProposta, 'uc' | 'titular' | 'consumo_kwh'>> & { arquivo_url: string; arquivo_nome: string; arquivo_tipo: string | null; mensagem_id: string; meses: number }) | { erro: string }
> {
  const a = await acesso(conversa_id)
  if ('erro' in a) return { erro: a.erro as string }
  const { data: m } = await a.admin.from('wa_mensagens').select('id, conversa_id, texto, midia_url, midia_mime, dados').eq('id', mensagem_id).maybeSingle()
  const msg = m as any
  if (!msg || msg.conversa_id !== conversa_id) return { erro: 'Arquivo não é desta conversa' }
  if (!msg.midia_url) return { erro: 'Mensagem sem arquivo' }
  const dados = (msg.dados || {}) as Record<string, any>
  // A fatura da UC principal já está no consumo: somar de novo dobraria o sistema
  if (dados.fatura_lida?.status === 'ok' && !dados.fatura_lida.beneficiaria) {
    return { erro: 'Essa é a fatura da UC principal — o consumo dela já está no campo "Consumo médio"' }
  }
  let resumo = dados.fatura_lida?.status === 'ok' ? dados.fatura_lida.resumo : null
  let analise = dados.fatura_lida?.analise || null
  if (!resumo) {
    const { analisarFaturaPorUrl } = await import('@/lib/fatura/analisar')
    const r = await analisarFaturaPorUrl(msg.midia_url, msg.midia_mime)
    if ('erro' in r) return { erro: r.erro }
    const f = r.dados
    const consumo = Number(f.consumo_medio_12m_kwh) || Number(f.consumo_mes_kwh) || 0
    if (!consumo && !f.uc) return { erro: 'O arquivo não parece uma fatura de energia' }
    resumo = { consumo_kwh: Math.round(consumo), meses: Number(f.meses_com_dados) || 1, uc: f.uc || null, razao_social: f.razao_social || null }
    analise = f
    await a.admin.from('wa_mensagens').update({ dados: { ...dados, fatura_lida: { status: 'ok', resumo, analise, beneficiaria: true, em: new Date().toISOString() } } }).eq('id', msg.id)
  }
  const { anexarArquivoPerfil } = await import('@/lib/spinzap/perfil-servidor')
  await anexarArquivoPerfil(a.admin, {
    contato_id: a.contato.id, categoria: 'fatura', url: msg.midia_url, nome: `Fatura UC ${resumo.uc || ''} (beneficiária)`.replace('UC  ', ''),
    mime: msg.midia_mime, origem: 'cliente', wa_mensagem_id: msg.id, projeto_id: a.contato.projeto_id,
  })
  return {
    uc: String(resumo.uc || ''), titular: String(resumo.razao_social || ''), consumo_kwh: Number(resumo.consumo_kwh) || 0, meses: Number(resumo.meses) || 1,
    arquivo_url: msg.midia_url, arquivo_nome: msg.texto || 'Fatura', arquivo_tipo: msg.midia_mime || null, mensagem_id: msg.id,
  }
}
