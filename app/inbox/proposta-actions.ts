'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'
import {
  montarOrcamentoLead, carregarCatalogoProposta, destinoDoExtra, TIPOS_SISTEMA_FV,
  type EntradaOrcamentoLead, type OrcamentoLead, type OpcoesKit, type TipoSistemaFv,
} from '@/lib/spinzap/orcamento-lead'
import { auditarOrcamentoLead, type Auditoria } from '@/lib/spinzap/auditor-orcamento'
import { carregarPerfil, gerarPdfDoOrcamento } from '@/lib/spinzap/orcamento-lais'
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
  cidade: string | null
  fatura: { consumo_kwh: number | null; tarifa_kwh: number | null; subsidio: string | null } | null
  tarifa_base: { tarifa_kwh: number; amostras: number } | null
  projeto_id: string | null
  eh_admin: boolean
} | { erro: string }> {
  const a = await acesso(conversa_id)
  if ('erro' in a) return { erro: a.erro as string }
  const perfil = await carregarPerfil(a.admin, a.contato.id)
  const fatura = await faturaConhecida(a.admin, a.conv, a.contato)
  const base = await tarifaDeReferencia(a.admin)
  const { projetosDoContato } = await import('@/lib/propostas/projetos-contato')
  const projetoFv = (await projetosDoContato(a.admin, a.contato)).find((p) => p.aberto && p.categoria === 'fotovoltaico')
  return {
    tipo_rede: perfil.infra_eletrica.tipo_rede || fatura?.tipo_ligacao || null,
    cidade: perfil.contato.endereco?.cidade || a.conv.cidade || null,
    fatura: fatura ? { consumo_kwh: fatura.consumo_kwh, tarifa_kwh: fatura.tarifa_kwh, subsidio: fatura.subsidio } : null,
    tarifa_base: base ? { tarifa_kwh: base.tarifa_conta_kwh || base.tarifa_kwh, amostras: base.amostras } : null,
    projeto_id: projetoFv?.id || null,
    eh_admin: a.ehAdmin,
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
  const cidade = e.cidade?.trim() || null
  if (cidade) perfil.contato = { ...perfil.contato, endereco: { ...(perfil.contato.endereco || {}), cidade } }
  const orc = await montarOrcamentoLead(a.admin, { entrada, tipo_rede_perfil: e.tipo_rede, cidade, opcoes: e.opcoes })
  if ('erro' in orc) return orc
  return { orc, auditoria: auditarOrcamentoLead(orc, perfil), perfil, cidade }
}

const semInterno = (o: OrcamentoLead, admin: boolean) => (admin ? o : { ...o, interno: { margem_pct: 0, desconto_max_negociacao: 0 } })

export async function calcularPropostaRapidaAction(conversa_id: string, e: EntradaPropostaRapida): Promise<
  { orcamento: OrcamentoLead; auditoria: Auditoria; mostra_interno: boolean } | { erro: string }
> {
  const a = await acesso(conversa_id)
  if ('erro' in a) return { erro: a.erro as string }
  const r = await calcular(a, e)
  if ('erro' in r) return r
  return { orcamento: semInterno(r.orc, a.ehAdmin), auditoria: r.auditoria, mostra_interno: a.ehAdmin }
}

/** Gera o PDF (recalcula no servidor — o preço não vem da tela) e guarda no projeto do contato. */
export async function gerarPdfPropostaRapidaAction(conversa_id: string, e: EntradaPropostaRapida): Promise<
  { url_pdf: string; projeto_id: string } | { erro: string }
> {
  const a = await acesso(conversa_id)
  if ('erro' in a) return { erro: a.erro as string }
  const r = await calcular(a, e)
  if ('erro' in r) return r
  // Projeto da categoria fotovoltaica do contato (cria um novo se não houver aberto)
  const etiqueta = String(a.conv.produto || '')
  const tipoItem = r.orc.tipo_sistema === 'hibrido' ? 'fv_hibrido' : etiqueta.startsWith('fv_') ? etiqueta : 'fv_ongrid'
  const proj = await garantirProjetoDaCategoria(a.admin, {
    contato: a.contato, categoria: 'fotovoltaico', tipo: tipoItem, usuario_id: a.user.id, papel: a.ehAdmin ? 'admin' : null,
    nome_cliente: r.perfil.contato.primeiro_nome || a.contato.nome_exibicao || null,
  })
  if ('erro' in proj) return proj
  const projetoId = proj.projeto_id
  // Quem montou vira o consultor do projeto, se ainda não tiver
  await a.admin.from('projetos').update({ consultor_id: a.user.id }).eq('id', projetoId).is('consultor_id', null)
  const fatura = await faturaConhecida(a.admin, a.conv, a.contato)
  const pdf = await gerarPdfDoOrcamento(a.admin, {
    orc: r.orc, perfil: r.perfil, contato: a.contato, fatura: fatura ? { razao_social: fatura.razao_social, cpf_cnpj: fatura.cpf_cnpj } : null,
    projetoId, cidade: r.cidade, uf: r.perfil.contato.endereco?.uf || a.conv.uf || null, prefixo: 'orcamento-spinzap',
  })
  if ('erro' in pdf) return pdf
  await a.admin.from('projeto_propostas_historico').insert({
    projeto_id: projetoId, url_pdf: pdf.url, pv_total: r.orc.pv_total, potencia_cc_kwp: r.orc.kwp,
    potencia_ca_kw: r.orc.inversor.potencia_kw, modo_composicao: 'orcamento_spinzap', memoria_calculo: r.orc.interno,
  })
  await a.admin.from('spinzap_arquivos').insert({
    contato_id: a.contato.id, categoria: 'orcamento', url: pdf.url, nome: 'Orçamento (Spinzap)', mime: 'application/pdf',
    origem: 'gerado', projeto_id: projetoId, criado_por: a.user.id,
  })
  revalidatePath('/spinzap')
  return { url_pdf: pdf.url, projeto_id: projetoId }
}

/** Envia no WhatsApp o PDF já gerado (mesmo envio de proposta do Spinzap: CRM, follow-up, modelo fora da janela). */
export async function enviarPdfPropostaRapidaAction(conversa_id: string, projeto_id: string, url_pdf: string, legenda: string): Promise<
  { sucesso: true } | { erro: string }
> {
  const a = await acesso(conversa_id)
  if ('erro' in a) return { erro: a.erro as string }
  const { projetosDoContato } = await import('@/lib/propostas/projetos-contato')
  const doContato = await projetosDoContato(a.admin, a.contato)
  if (!doContato.some((p) => p.id === projeto_id)) return { erro: 'Projeto não é deste contato' }
  if (!/\/propostas-pdf\//.test(url_pdf)) return { erro: 'PDF inválido' }
  const r = await enviarPropostaPeloCanalAction({
    projeto_id, url_pdf, nome_arquivo: 'Orcamento-Spin-Solar.pdf',
    legenda: String(legenda || '').trim().slice(0, 900) || 'Segue o seu orçamento de energia solar ☀️',
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
export async function opcoesKitPropostaAction(): Promise<{
  placas: Array<{ id: string; rotulo: string }>
  inversores: Record<TipoSistemaFv, Array<{ id: string; rotulo: string; fases: string | null }>>
  extras: Array<{ categoria: string; rotulo: string; itens: Array<{ id: string; rotulo: string; destino: 'kit' | 'lista_ca' }> }>
} | { erro: string }> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { erro: 'Não autenticado' }
  const catalogo = await carregarCatalogoProposta(createAdminClient())
  const kw = (n: number | null) => (n ? `${String(n).replace('.', ',')} kW` : '')
  // Potência em ordem crescente (a ordem carrega sentido)
  const placas = catalogo.filter((p) => p.categoria === 'placa' && p.potencia_wp && p.disponivel)
    .sort((a, b) => a.potencia_wp! - b.potencia_wp! || a.modelo.localeCompare(b.modelo, 'pt-BR'))
    .map((p) => ({ id: p.id, rotulo: `${p.potencia_wp} Wp · ${p.descricao.replace(/^\d+\s*Wp\s*-\s*/i, '') || p.modelo}` }))
  const inversores = Object.fromEntries(TIPOS_SISTEMA_FV.map((t) => [t.valor,
    catalogo.filter((p) => p.categoria === 'inversor' && p.subcategoria === t.subcategoria && p.potencia_kw && p.disponivel)
      .sort((a, b) => a.potencia_kw! - b.potencia_kw! || a.modelo.localeCompare(b.modelo, 'pt-BR'))
      .map((p) => ({
        id: p.id, fases: p.fases,
        rotulo: `${p.modelo} · ${kw(p.potencia_kw)}${p.fases ? ` · ${p.fases === 'tri' ? 'trifásico' : p.fases === 'bi' ? 'bifásico' : 'monofásico'}` : ''}${t.valor === 'micro' && p.entradas ? ` · ${p.entradas} placas` : ''}`,
      })),
  ])) as Record<TipoSistemaFv, Array<{ id: string; rotulo: string; fases: string | null }>>
  // Extras: tudo com preço, menos placa, inversor (exceto otimizador) e frete (o motor calcula)
  const grupos = new Map<string, Array<{ id: string; rotulo: string; destino: 'kit' | 'lista_ca' }>>()
  for (const p of catalogo) {
    if (p.categoria === 'placa' || p.categoria === 'frete') continue
    if (p.categoria === 'inversor' && p.subcategoria !== 'otimizador') continue
    const chave = p.categoria === 'inversor' ? 'otimizador' : p.categoria
    if (!grupos.has(chave)) grupos.set(chave, [])
    grupos.get(chave)!.push({ id: p.id, rotulo: p.descricao || p.modelo, destino: destinoDoExtra(p) })
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