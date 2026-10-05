import type { SupabaseClient } from '@supabase/supabase-js'
import { avisarUsuario } from '@/lib/agentes/diretorio'
import { getTituloTipo } from '@/lib/execucoes'
import { rotuloOs } from './comum'

/**
 * Bianca no campo (Kalebe 2026-10-05) — roda no cron diário (~9h):
 *  1. Serviço agendado que passou da data sem ser executado volta pras
 *     demandas (em aberto, sem data e sem dono) e quem tinha agendado é avisado.
 *  2. Cada profissional recebe o resumo dos serviços de hoje (com a OS
 *     em execução que ficou sem concluir, se houver).
 */
const hojeBRT = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' })
const dataBR = (d: string) => d.slice(0, 10).split('-').reverse().join('/')

export async function reabrirServicosVencidos(admin: SupabaseClient) {
  const hoje = hojeBRT()
  const { data, error } = await admin.from('execucoes_servicos')
    .select('id, os_numero, tipo_servico, titulo, cliente_nome, data_agendada, responsavel_tecnico, agenda_evento_id, vezes_reaberta, projeto_id')
    .in('status', ['agendado', 'preparando_material'])
    .lt('data_agendada', hoje)
  if (error) return { tarefa: 'campo_reabrir', erro: error.message }

  let reabertos = 0
  for (const os of (data || []) as any[]) {
    const { error: e } = await admin.from('execucoes_servicos').update({
      status: 'agendando', data_agendada: null, hora_agendada: null, responsavel_tecnico: null,
      agenda_evento_id: null, vezes_reaberta: (os.vezes_reaberta || 0) + 1, updated_at: new Date().toISOString(),
    }).eq('id', os.id)
    if (e) continue
    reabertos++
    if (os.agenda_evento_id) await admin.from('agenda_eventos').update({ status: 'adiado' }).eq('id', os.agenda_evento_id)
    if (os.responsavel_tecnico) {
      await avisarUsuario({
        destinatario_id: os.responsavel_tecnico,
        agente: 'bianca',
        titulo: 'Serviço voltou pras demandas',
        mensagem: `${rotuloOs(os.os_numero)} · ${getTituloTipo(os.tipo_servico)} — ${os.cliente_nome || os.titulo} estava marcada pra ${dataBR(os.data_agendada)} e não foi concluída. Voltou pro quadro de demandas em aberto: reagende em /campo. Se o serviço foi feito, me avise pra registrar.`,
        projeto_id: os.projeto_id || null,
      }).catch(() => {})
    }
  }
  return { tarefa: 'campo_reabrir', encontrados: (data || []).length, reabertos }
}

export async function resumoDoDiaCampo(admin: SupabaseClient) {
  const hoje = hojeBRT()
  const { data, error } = await admin.from('execucoes_servicos')
    .select('id, os_numero, status, tipo_servico, titulo, cliente_nome, bairro, cidade, data_agendada, hora_agendada, responsavel_tecnico')
    .in('status', ['agendado', 'preparando_material', 'em_execucao'])
    .not('responsavel_tecnico', 'is', null)
    .lte('data_agendada', hoje)
  if (error) return { tarefa: 'campo_resumo', erro: error.message }

  const porPessoa = new Map<string, any[]>()
  for (const os of (data || []) as any[]) porPessoa.set(os.responsavel_tecnico, [...(porPessoa.get(os.responsavel_tecnico) || []), os])

  let enviados = 0
  for (const [pessoa, lista] of Array.from(porPessoa.entries())) {
    // Uma vez por dia (o cron pode ser chamado de novo na mão)
    const { count } = await admin.from('avisos_internos').select('id', { count: 'exact', head: true })
      .eq('destinatario_id', pessoa).eq('titulo', 'Seus serviços de hoje').gte('created_at', `${hoje}T00:00:00-03:00`)
    if (count) continue

    const deHoje = lista.filter((o) => o.data_agendada === hoje && o.status !== 'em_execucao')
      .sort((a, b) => String(a.hora_agendada || '').localeCompare(String(b.hora_agendada || '')))
    const abertas = lista.filter((o) => o.status === 'em_execucao')
    if (!deHoje.length && !abertas.length) continue

    const linha = (o: any) => `• ${o.hora_agendada ? String(o.hora_agendada).slice(0, 5) + ' ' : ''}${rotuloOs(o.os_numero)} ${getTituloTipo(o.tipo_servico)} — ${o.cliente_nome || o.titulo}${o.bairro || o.cidade ? ` (${[o.bairro, o.cidade].filter(Boolean).join(', ')})` : ''}`
    const partes = [
      deHoje.length ? `Bom dia! Hoje você tem ${deHoje.length} serviço(s):\n${deHoje.map(linha).join('\n')}` : 'Bom dia!',
      abertas.length ? `Em execução, falta concluir com a assinatura do cliente:\n${abertas.map(linha).join('\n')}` : null,
      'Abra cada OS em /campo pra seguir o checklist.',
    ].filter(Boolean)
    const r = await avisarUsuario({
      destinatario_id: pessoa,
      agente: 'bianca',
      titulo: 'Seus serviços de hoje',
      mensagem: partes.join('\n\n'),
    }).catch(() => ({ sucesso: false }))
    if (r.sucesso) enviados++
  }
  return { tarefa: 'campo_resumo', profissionais: porPessoa.size, enviados }
}
