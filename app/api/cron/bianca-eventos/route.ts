import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { dispararGatilho } from '@/lib/bianca/gatilhos'
import { rotinaDiariaCampo } from '@/lib/campo/bianca'

/**
 * Cron diario da Bianca — dispara gatilhos TEMPORAIS.
 *
 * Executado por Vercel Cron (configurado em vercel.json) ~9h todo dia.
 * Tambem pode ser chamado manualmente com header Authorization: Bearer CRON_SECRET.
 *
 * Gatilhos ativados aqui:
 *   1. proposta_followup_3d — propostas enviadas ha 3+ dias sem 'aceito'/'recusado'
 *   2. modulo_pendente_7d — projeto_itens sem valor_estimado ha 7+ dias
 *   3. instalacao_amanha — homologacoes com data_instalacao = amanha
 *   4. campo — fecha as diárias, devolve pras demandas o que não foi
 *      executado, resumo do dia por profissional e pendências do admin
 *      (lib/campo/bianca)
 *
 * Cada gatilho e disparado UMA VEZ por entidade — checa se ja existe
 * bianca_eventos_disparados com esse gatilho+entidade no mesmo dia.
 */

const CRON_SECRET = process.env.CRON_SECRET || 'spin_bianca_cron_2026'

export const runtime = 'nodejs'
export const maxDuration = 60

export async function GET(req: NextRequest) {
  // Auth: Vercel Cron manda 'Authorization: Bearer <VERCEL_CRON_SECRET>'
  // Ou testamos manual com o nosso CRON_SECRET
  const auth = req.headers.get('authorization')
  const isVercelCron = req.headers.get('user-agent')?.includes('vercel-cron')
  if (!isVercelCron && auth !== `Bearer ${CRON_SECRET}`) {
    return NextResponse.json({ erro: 'Nao autorizado' }, { status: 401 })
  }

  const supabase = createAdminClient()
  const resultados: any[] = []

  try {
    resultados.push(await processarFollowUp3d(supabase))
    resultados.push(await processarModuloPendente7d(supabase))
    resultados.push(await processarInstalacaoAmanha(supabase))
    // Campo: fecha diárias, devolve o não executado, resumo do dia, pendências do admin
    resultados.push(...(await rotinaDiariaCampo(supabase)))

    return NextResponse.json({
      sucesso: true,
      executado_em: new Date().toISOString(),
      resultados,
    })
  } catch (e: any) {
    console.error('[cron/bianca-eventos]', e)
    return NextResponse.json({ erro: e?.message, resultados }, { status: 500 })
  }
}

// ============================================================================
// 1. proposta_followup_3d
// ============================================================================
async function processarFollowUp3d(supabase: any) {
  const tresDiasAtras = new Date()
  tresDiasAtras.setDate(tresDiasAtras.getDate() - 3)
  const cincoDiasAtras = new Date()
  cincoDiasAtras.setDate(cincoDiasAtras.getDate() - 5)

  // Propostas enviadas entre 3 e 5 dias atras (janela de 2 dias pra nao repetir)
  const { data: projetos } = await supabase
    .from('projetos')
    .select('id, codigo, cliente_razao_social, cliente_telefone, consultor_id, status, status_atualizado_em')
    .eq('status', 'proposta_enviada')
    .gte('status_atualizado_em', cincoDiasAtras.toISOString())
    .lte('status_atualizado_em', tresDiasAtras.toISOString())

  let disparados = 0
  let ja_disparados = 0

  for (const p of projetos || []) {
    // Checa se ja disparou pra esse projeto (evita spam)
    const { data: jaExiste } = await supabase
      .from('bianca_eventos_disparados')
      .select('id')
      .eq('gatilho_chave', 'proposta_followup_3d')
      .eq('projeto_id', p.id)
      .maybeSingle()

    if (jaExiste) {
      ja_disparados++
      continue
    }

    const res = await dispararGatilho('proposta_followup_3d', {
      projeto_id: p.id,
      usuario_id: p.consultor_id,
      entidade_tipo: 'projeto',
      entidade_id: p.id,
      variaveis: {
        cliente_nome: p.cliente_razao_social,
        codigo_projeto: p.codigo || p.id.slice(0, 8),
        cliente_telefone: p.cliente_telefone || '',
      },
    })
    if (res.sucesso) disparados++
  }

  return { gatilho: 'proposta_followup_3d', encontrados: (projetos || []).length, disparados, ja_disparados }
}

// ============================================================================
// 2. modulo_pendente_7d
// ============================================================================
async function processarModuloPendente7d(supabase: any) {
  const seteDiasAtras = new Date()
  seteDiasAtras.setDate(seteDiasAtras.getDate() - 7)

  // Items da proposta sem valor + criados ha 7+ dias
  const { data: itens } = await supabase
    .from('projeto_itens')
    .select(`
      id, tipo, projeto_id, created_at,
      projeto:projeto_id(id, codigo, cliente_razao_social, consultor_id)
    `)
    .is('valor_estimado', null)
    .neq('status', 'removido')
    .lte('created_at', seteDiasAtras.toISOString())

  let disparados = 0
  let ja_disparados = 0

  for (const it of itens || []) {
    // Uma sugestao por item — nao repete
    const { data: jaExiste } = await supabase
      .from('bianca_eventos_disparados')
      .select('id')
      .eq('gatilho_chave', 'modulo_pendente_7d')
      .eq('entidade_id', it.id)
      .maybeSingle()

    if (jaExiste) {
      ja_disparados++
      continue
    }

    const projeto = Array.isArray(it.projeto) ? it.projeto[0] : it.projeto

    const res = await dispararGatilho('modulo_pendente_7d', {
      projeto_id: it.projeto_id,
      usuario_id: projeto?.consultor_id,
      entidade_tipo: 'item_projeto',
      entidade_id: it.id,
      variaveis: {
        tipo_item: it.tipo,
        cliente_nome: projeto?.cliente_razao_social || '?',
        codigo_projeto: projeto?.codigo || it.projeto_id?.slice(0, 8) || '?',
      },
    })
    if (res.sucesso) disparados++
  }

  return { gatilho: 'modulo_pendente_7d', encontrados: (itens || []).length, disparados, ja_disparados }
}

// ============================================================================
// 3. instalacao_amanha
// ============================================================================
// Kalebe 2026-10-06: a data da instalação vive na agenda do campo
// (execucoes_servicos aprovada pelo admin). Antes lia homologacoes.data_instalacao,
// coluna que não existe — a consulta falhava e o aviso nunca saía.
const TIPOS_INSTALACAO = ['fv_ongrid', 'fv_hibrido', 'srv_instalacao_placas', 've_recarga', 'bess']

async function processarInstalacaoAmanha(supabase: any) {
  const amanha = new Date(Date.now() + 86400_000)
  const amanhaStr = amanha.toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' })  // YYYY-MM-DD

  const { data: execucoes, error } = await supabase
    .from('execucoes_servicos')
    .select(`
      id, projeto_id, tipo_servico, data_agendada, hora_agendada, cliente_nome, contato_telefone,
      endereco, endereco_execucao,
      projeto:projeto_id(id, codigo, cliente_razao_social, cliente_telefone, consultor_id)
    `)
    .eq('data_agendada', amanhaStr)
    .eq('aprovacao', 'aprovada')
    .in('status', ['agendado', 'preparando_material'])
    .in('tipo_servico', TIPOS_INSTALACAO)
    .not('projeto_id', 'is', null)
  if (error) return { gatilho: 'instalacao_amanha', erro: error.message }

  let disparados = 0
  let ja_disparados = 0

  for (const e of execucoes || []) {
    const { data: jaExiste } = await supabase
      .from('bianca_eventos_disparados')
      .select('id')
      .eq('gatilho_chave', 'instalacao_amanha')
      .eq('entidade_id', e.id)
      .maybeSingle()

    if (jaExiste) {
      ja_disparados++
      continue
    }

    const projeto = Array.isArray(e.projeto) ? e.projeto[0] : e.projeto
    const end = e.endereco || {}
    const enderecoStr = [end.logradouro || end.rua, end.numero, end.bairro, end.cidade].filter(Boolean).join(', ')
      || e.endereco_execucao || 'no local combinado'

    const res = await dispararGatilho('instalacao_amanha', {
      projeto_id: e.projeto_id,
      usuario_id: projeto?.consultor_id,
      entidade_tipo: 'execucao',
      entidade_id: e.id,
      variaveis: {
        cliente_nome: e.cliente_nome || projeto?.cliente_razao_social || '?',
        codigo_projeto: projeto?.codigo || '?',
        cliente_telefone: e.contato_telefone || projeto?.cliente_telefone || '',
        data_instalacao: String(e.data_agendada).split('-').reverse().join('/'),
        hora_instalacao: e.hora_agendada ? String(e.hora_agendada).slice(0, 5) : 'combinar',
        endereco: enderecoStr,
      },
    })
    if (res.sucesso) disparados++
  }

  return { gatilho: 'instalacao_amanha', encontrados: (execucoes || []).length, disparados, ja_disparados }
}
