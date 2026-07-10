import type { SupabaseClient } from '@supabase/supabase-js'

type ResultadoTool = { sucesso: boolean; dados?: any; erro?: string }

export async function executarTool(
  supabase: SupabaseClient,
  userId: string,
  toolName: string,
  input: any,
): Promise<ResultadoTool> {
  try {
    switch (toolName) {
      case 'criar_evento': {
        const { data, error } = await supabase
          .from('agenda_eventos')
          .insert({
            usuario_id: userId,
            titulo: input.titulo,
            data_hora_inicio: input.data_hora_inicio,
            data_hora_fim: input.data_hora_fim || null,
            descricao: input.descricao || null,
            local: input.local || null,
            url_reuniao: input.url_reuniao || null,
            tipo: input.tipo || 'geral',
            cliente_nome: input.cliente_nome || null,
            criado_por_bianca: true,
          })
          .select('id, titulo, data_hora_inicio, local')
          .single()
        if (error) return { sucesso: false, erro: error.message }
        return { sucesso: true, dados: data }
      }

      case 'criar_tarefa': {
        const { data, error } = await supabase
          .from('agenda_tarefas')
          .insert({
            usuario_id: userId,
            titulo: input.titulo,
            descricao: input.descricao || null,
            data_prazo: input.data_prazo || null,
            prioridade: input.prioridade || 'media',
            criada_por_bianca: true,
          })
          .select('id, titulo, data_prazo, prioridade')
          .single()
        if (error) return { sucesso: false, erro: error.message }
        return { sucesso: true, dados: data }
      }

      case 'listar_eventos': {
        const periodo = input.periodo || 'hoje'
        const agora = new Date()
        let dataInicio: Date, dataFim: Date

        switch (periodo) {
          case 'hoje':
            dataInicio = new Date(agora.getFullYear(), agora.getMonth(), agora.getDate())
            dataFim = new Date(agora.getFullYear(), agora.getMonth(), agora.getDate() + 1)
            break
          case 'amanha':
            dataInicio = new Date(agora.getFullYear(), agora.getMonth(), agora.getDate() + 1)
            dataFim = new Date(agora.getFullYear(), agora.getMonth(), agora.getDate() + 2)
            break
          case 'semana': {
            const diaSemana = agora.getDay()
            dataInicio = new Date(agora.getFullYear(), agora.getMonth(), agora.getDate() - diaSemana)
            dataFim = new Date(agora.getFullYear(), agora.getMonth(), agora.getDate() - diaSemana + 7)
            break
          }
          case 'proximos_7_dias':
            dataInicio = new Date(agora.getFullYear(), agora.getMonth(), agora.getDate())
            dataFim = new Date(agora.getFullYear(), agora.getMonth(), agora.getDate() + 8)
            break
          case 'mes':
          default:
            dataInicio = new Date(agora.getFullYear(), agora.getMonth(), 1)
            dataFim = new Date(agora.getFullYear(), agora.getMonth() + 1, 1)
        }

        const { data, error } = await supabase
          .from('agenda_eventos')
          .select('id, titulo, data_hora_inicio, data_hora_fim, local, tipo, cliente_nome')
          .eq('usuario_id', userId)
          .gte('data_hora_inicio', dataInicio.toISOString())
          .lt('data_hora_inicio', dataFim.toISOString())
          .order('data_hora_inicio', { ascending: true })
        if (error) return { sucesso: false, erro: error.message }
        return { sucesso: true, dados: data }
      }

      case 'listar_tarefas': {
        const status = input.status || 'pendente'
        let query = supabase
          .from('agenda_tarefas')
          .select('id, titulo, data_prazo, prioridade, status')
          .eq('usuario_id', userId)
          .order('data_prazo', { ascending: true, nullsFirst: false })
        if (status !== 'todas') query = query.eq('status', status)
        const { data, error } = await query.limit(20)
        if (error) return { sucesso: false, erro: error.message }
        return { sucesso: true, dados: data }
      }

      case 'marcar_tarefa_concluida': {
        const { data, error } = await supabase
          .from('agenda_tarefas')
          .update({ status: 'concluida', concluida_em: new Date().toISOString() })
          .eq('id', input.id)
          .eq('usuario_id', userId)
          .select('id, titulo')
          .single()
        if (error) return { sucesso: false, erro: error.message }
        return { sucesso: true, dados: data }
      }

      case 'deletar_evento': {
        const { error } = await supabase
          .from('agenda_eventos')
          .delete()
          .eq('id', input.id)
          .eq('usuario_id', userId)
        if (error) return { sucesso: false, erro: error.message }
        return { sucesso: true, dados: { deletado: true } }
      }

      default:
        return { sucesso: false, erro: `Tool desconhecida: ${toolName}` }
    }
  } catch (e: any) {
    return { sucesso: false, erro: e?.message || 'Erro inesperado' }
  }
}
