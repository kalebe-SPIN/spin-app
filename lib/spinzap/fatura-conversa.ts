import type { createAdminClient } from '@/lib/supabase/admin'
import { analisarFaturaPorUrl, MIMES_FATURA } from '@/lib/fatura/analisar'
import { registrarTarifaExtraida } from '@/lib/fatura/tarifa'
import { anexarArquivoPerfil, mesclarPerfil } from './perfil-servidor'

/**
 * Fatura que o cliente mandou na conversa (Kalebe 2026-10-14): "quando o
 * cliente enviar a fatura de energia em PDF, o sistema ler a fatura e
 * preencher os dados nos campos corretos". Mesma leitura da Laís (IA +
 * tarifa calculada), fora do roteiro dela:
 *   - contexto da conversa (fatura: consumo médio, tarifa, titular, CPF/CNPJ)
 *   - cadastro do cliente (tipo de rede, endereço) e arquivo "Fatura" no perfil
 *   - cidade da conversa, se ainda não tiver
 *   - base de tarifas (tarifas_extraidas)
 * A marca fica em wa_mensagens.dados.fatura_lida (não lê duas vezes).
 */

type Admin = ReturnType<typeof createAdminClient>

export type FaturaResumo = {
  consumo_kwh: number
  meses: number
  tarifa_kwh: number | null
  subsidio: string | null
  tipo_ligacao: 'monofasico' | 'bifasico' | 'trifasico' | null
  cidade: string | null
  uf: string | null
  razao_social: string | null
  cpf_cnpj: string | null
  uc: string | null
  mes_referencia: string | null
  valor_total: number | null
}

const LENDO_EXPIRA_MS = 5 * 60_000

export async function lerFaturaDaMensagem(admin: Admin, a: {
  mensagem_id: string
  origem: 'automatico' | 'usuario'
  usuario_id?: string | null
  /** Lê de novo mesmo que já tenha lido/descartado */
  forcar?: boolean
}): Promise<{ fatura: FaturaResumo } | { erro: string; nao_e_fatura?: boolean; ocupado?: boolean }> {
  const { data: m } = await admin.from('wa_mensagens')
    .select('id, conversa_id, direcao, texto, midia_url, midia_mime, dados').eq('id', a.mensagem_id).maybeSingle()
  const msg = m as any
  if (!msg?.midia_url) return { erro: 'Mensagem sem arquivo' }
  const mime = String(msg.midia_mime || '').split(';')[0].trim().toLowerCase()
  if (mime && !MIMES_FATURA.includes(mime)) return { erro: 'Formato não aceito pra fatura (use PDF ou foto)' }
  const dados = (msg.dados || {}) as Record<string, any>
  const marca = dados.fatura_lida as Record<string, any> | undefined
  if (marca && !a.forcar) {
    if (marca.status === 'ok' && marca.resumo) return { fatura: marca.resumo as FaturaResumo }
    if (marca.status === 'lendo' && Date.now() - new Date(marca.em).getTime() < LENDO_EXPIRA_MS) return { erro: 'A fatura já está sendo lida — aguarde alguns segundos', ocupado: true }
    if (marca.status === 'nao_e_fatura' && a.origem === 'automatico') return { erro: 'Não é fatura', nao_e_fatura: true }
  }
  const marcar = (fatura_lida: Record<string, any>) =>
    admin.from('wa_mensagens').update({ dados: { ...dados, fatura_lida: { ...fatura_lida, em: new Date().toISOString() } } }).eq('id', msg.id)
  await marcar({ status: 'lendo' })

  const r = await analisarFaturaPorUrl(msg.midia_url, msg.midia_mime)
  if ('erro' in r) { await marcar({ status: 'erro', erro: r.erro }); return { erro: r.erro } }
  const f = r.dados
  const consumo = Number(f.consumo_medio_12m_kwh) || Number(f.consumo_mes_kwh) || 0
  if (!consumo && !f.uc) {
    await marcar({ status: 'nao_e_fatura' })
    return { erro: 'O arquivo não parece uma fatura de energia', nao_e_fatura: true }
  }

  const { data: c } = await admin.from('wa_conversas')
    .select('id, cidade, uf, contexto_qualificacao, contato:contato_id(id, projeto_id)').eq('id', msg.conversa_id).maybeSingle()
  const conv = c as any
  const contato = conv?.contato as { id: string; projeto_id: string | null } | null
  const tc = f.tarifa_calculada
  await registrarTarifaExtraida(admin, {
    origem: a.origem === 'usuario' ? 'tela' : 'lais', usuario_id: a.usuario_id || null, conversa_id: msg.conversa_id,
    dados: f, tarifa: tc, lida: f.tarifa,
  })
  const tarifaCliente = tc.tarifa_conta_kwh || tc.tarifa_media_kwh || null

  // Contexto da conversa: o "Montar proposta" e a Laís leem daqui (mesmo formato da Laís)
  const ctx = { ...((conv?.contexto_qualificacao || {}) as Record<string, any>) }
  ctx.fatura = {
    razao_social: f.razao_social, cpf_cnpj: f.cpf_cnpj, uc: f.uc, consumo_medio_kwh: consumo, tipo_ligacao: f.tipo_ligacao,
    valor_total_reais: f.valor_total_reais, grupo: f.grupo, classe: f.classe, mes_referencia: f.mes_referencia,
    meses_com_dados: f.meses_com_dados,
    tarifa: { media_kwh: tc.tarifa_media_kwh, conta_kwh: tc.tarifa_conta_kwh, subsidio: tc.subsidio, por_posto: tc.por_posto },
    mensagem_id: msg.id, lida_em: new Date().toISOString(),
  }
  ctx.fatura_recebida = true
  const patchConv: Record<string, any> = { contexto_qualificacao: ctx }
  if (!conv?.cidade && f.endereco?.cidade) {
    patchConv.cidade = f.endereco.cidade.trim()
    if (f.endereco.uf) patchConv.uf = f.endereco.uf.trim().toUpperCase().slice(0, 2)
  }
  if (conv) await admin.from('wa_conversas').update(patchConv).eq('id', conv.id)

  // Cadastro do cliente: arquivo, tipo de rede e endereço
  if (contato?.id) {
    await anexarArquivoPerfil(admin, {
      contato_id: contato.id, categoria: 'fatura', url: msg.midia_url, nome: msg.texto || 'Fatura', mime: msg.midia_mime,
      origem: 'cliente', wa_mensagem_id: msg.id, projeto_id: contato.projeto_id,
    })
    if (f.tipo_ligacao) await mesclarPerfil(admin, contato.id, 'infra_eletrica', { tipo_rede: f.tipo_ligacao })
    await mesclarPerfil(admin, contato.id, 'contato', {
      endereco: { rua: f.endereco.logradouro, bairro: f.endereco.bairro, cidade: f.endereco.cidade, uf: f.endereco.uf, cep: f.endereco.cep },
    })
  }

  const resumo: FaturaResumo = {
    consumo_kwh: Math.round(consumo),
    meses: Number(f.meses_com_dados) || 1,
    tarifa_kwh: tarifaCliente,
    subsidio: tc.subsidio || null,
    tipo_ligacao: f.tipo_ligacao,
    cidade: f.endereco?.cidade || null,
    uf: f.endereco?.uf || null,
    razao_social: f.razao_social || null,
    cpf_cnpj: f.cpf_cnpj || null,
    uc: f.uc || null,
    mes_referencia: f.mes_referencia || null,
    valor_total: f.valor_total_reais ?? null,
  }
  await marcar({ status: 'ok', resumo })
  return { fatura: resumo }
}

/**
 * Leitura automática quando o cliente manda PDF (webhook, em segundo plano).
 * Fica de fora: conversa da equipe e conversa em que o roteiro da Laís está
 * ativo com o agente (ela mesma lê a fatura no roteiro).
 */
export async function lerFaturaRecebida(admin: Admin, mensagem_id: string): Promise<void> {
  try {
    const { data: m } = await admin.from('wa_mensagens')
      .select('id, direcao, midia_mime, conversa:conversa_id(agente_ativo, contato:contato_id(tipo))').eq('id', mensagem_id).maybeSingle()
    const msg = m as any
    if (!msg || msg.direcao !== 'inbound') return
    if (!/^application\/pdf/i.test(String(msg.midia_mime || ''))) return
    if (['colaborador', 'representante'].includes(msg.conversa?.contato?.tipo)) return
    if (msg.conversa?.agente_ativo === 'qualificacao') {
      const { data: cfg } = await admin.from('wa_config').select('lais_roteiro_ativo').limit(1).maybeSingle()
      if ((cfg as any)?.lais_roteiro_ativo) return
    }
    const r = await lerFaturaDaMensagem(admin, { mensagem_id, origem: 'automatico' })
    if ('erro' in r && !r.nao_e_fatura && !r.ocupado) console.error('[fatura-conversa] leitura automática', r.erro)
  } catch (e) {
    console.error('[fatura-conversa] leitura automática', e)
  }
}

/**
 * Rede de segurança no cron: PDF do cliente das últimas 6 h que o webhook não
 * leu (função cortada no meio fica "lendo" — depois de 5 min tenta de novo).
 */
export async function lerFaturasPendentes(admin: Admin, limite = 1): Promise<number> {
  const agora = Date.now()
  const { data } = await admin.from('wa_mensagens')
    .select('id, midia_mime, dados')
    .eq('direcao', 'inbound').eq('tipo', 'document').not('midia_url', 'is', null)
    .gte('criada_em', new Date(agora - 6 * 3_600_000).toISOString())
    .lte('criada_em', new Date(agora - 2 * 60_000).toISOString())
    .order('criada_em', { ascending: false }).limit(30)
  const pendentes = ((data || []) as any[]).filter((x) => {
    if (!/pdf/i.test(String(x.midia_mime || ''))) return false
    const marca = x.dados?.fatura_lida
    return !marca || (marca.status === 'lendo' && agora - new Date(marca.em).getTime() > LENDO_EXPIRA_MS)
  }).slice(0, limite)
  for (const p of pendentes) await lerFaturaRecebida(admin, p.id)
  return pendentes.length
}

/** Arquivos do cliente que podem ser fatura e ainda não foram lidos (pro botão "Ler fatura"). */
export async function faturasNaoLidas(admin: Admin, conversa_id: string): Promise<Array<{ mensagem_id: string; nome: string; mime: string | null; criada_em: string; status: string | null }>> {
  const desde = new Date(Date.now() - 60 * 86_400_000).toISOString()
  const { data } = await admin.from('wa_mensagens')
    .select('id, texto, midia_url, midia_mime, criada_em, dados')
    .eq('conversa_id', conversa_id).eq('direcao', 'inbound').not('midia_url', 'is', null)
    .gte('criada_em', desde).order('criada_em', { ascending: false }).limit(20)
  return ((data || []) as any[])
    .filter((x) => MIMES_FATURA.includes(String(x.midia_mime || '').split(';')[0].trim().toLowerCase()))
    .filter((x) => !['ok', 'nao_e_fatura'].includes(x.dados?.fatura_lida?.status))
    .slice(0, 5)
    .map((x) => ({
      mensagem_id: x.id as string,
      nome: x.texto || (/pdf/i.test(x.midia_mime || '') ? 'Fatura (PDF)' : 'Foto'),
      mime: x.midia_mime || null,
      criada_em: x.criada_em as string,
      status: x.dados?.fatura_lida?.status || null,
    }))
}
