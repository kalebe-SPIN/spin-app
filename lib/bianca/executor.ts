import type { SupabaseClient } from '@supabase/supabase-js'

type ResultadoTool = { sucesso: boolean; dados?: any; erro?: string; _hint?: string }

const TOOLS_ADMIN = new Set([
  'listar_projetos_ativos',
  'listar_projetos_parados',
  'listar_homologacoes_em_andamento',
  'listar_etapas_homologacao_atrasadas',
  'resumo_operacional_empresa',
])

export async function executarTool(
  supabase: SupabaseClient,
  userId: string,
  toolName: string,
  input: any,
  userRole: string = 'consultor',
): Promise<ResultadoTool> {
  if (TOOLS_ADMIN.has(toolName) && userRole !== 'admin') {
    return {
      sucesso: false,
      erro: 'Essa consulta é exclusiva de admin. Fale com o Kalebe se precisar dessa informação.',
    }
  }

  try {
    switch (toolName) {
      case 'listar_projetos_ativos': {
        const busca = input.busca?.trim()
        let query = supabase
          .from('projetos')
          .select('id, codigo, cliente_razao_social, tipo_projeto, status')
          .neq('status', 'cancelado')
          .order('created_at', { ascending: false })
          .limit(30)

        if (busca) {
          query = query.ilike('cliente_razao_social', `%${busca}%`)
        }

        const { data, error } = await query
        if (error) return { sucesso: false, erro: error.message }
        return {
          sucesso: true,
          dados: data,
          _hint: busca && data && data.length === 0
            ? `Nenhum projeto encontrado com "${busca}".`
            : undefined,
        }
      }

      case 'listar_projetos_parados': {
        const diasMinimos = input.dias_minimos || 7
        const dataCorte = new Date()
        dataCorte.setDate(dataCorte.getDate() - diasMinimos)

        const { data, error } = await supabase
          .from('projetos')
          .select('id, codigo, cliente_razao_social, status, tipo_projeto, updated_at, consultor_id')
          .neq('status', 'aceito')
          .neq('status', 'recusado')
          .neq('status', 'cancelado')
          .neq('status', 'expirado')
          .lt('updated_at', dataCorte.toISOString())
          .order('updated_at', { ascending: true })
          .limit(30)
        if (error) return { sucesso: false, erro: error.message }
        return {
          sucesso: true,
          dados: (data || []).map((p: any) => ({
            ...p,
            dias_parado: Math.floor(
              (Date.now() - new Date(p.updated_at).getTime()) / 86400000,
            ),
          })),
        }
      }

      case 'listar_homologacoes_em_andamento': {
        const { data: homologacoes, error } = await supabase
          .from('homologacoes')
          .select(`
            id, status_geral, etapa_atual, protocolo_celesc, data_solicitacao,
            updated_at,
            projeto:projeto_id (codigo, cliente_razao_social),
            etapas:homologacao_etapas (id, ordem, chave, nome_exibicao, status, iniciado_em, concluido_em)
          `)
          .neq('status_geral', 'aprovada')
          .neq('status_geral', 'cancelada')
          .neq('status_geral', 'rejeitada')
          .order('created_at', { ascending: false })
        if (error) return { sucesso: false, erro: error.message }

        const agora = Date.now()
        const dados = (homologacoes || []).map((h: any) => {
          const etapasOrdenadas = (h.etapas || []).sort((a: any, b: any) => a.ordem - b.ordem)
          const emAndamento = etapasOrdenadas.find((e: any) => e.status === 'em_andamento')
          const diasEtapaAtual = emAndamento?.iniciado_em
            ? Math.floor((agora - new Date(emAndamento.iniciado_em).getTime()) / 86400000)
            : null
          return {
            id: h.id,
            cliente: h.projeto?.cliente_razao_social,
            codigo_projeto: h.projeto?.codigo,
            status_geral: h.status_geral,
            etapa_atual: emAndamento?.nome_exibicao || `Etapa ${h.etapa_atual}/6`,
            dias_na_etapa_atual: diasEtapaAtual,
            protocolo: h.protocolo_celesc,
          }
        }).filter((h: any) => {
          if (!input.atrasadas_apenas) return true
          return h.dias_na_etapa_atual !== null && h.dias_na_etapa_atual >= 5
        })

        return { sucesso: true, dados }
      }

      case 'listar_etapas_homologacao_atrasadas': {
        const diasAlerta = input.dias_alerta || 5
        const dataCorte = new Date()
        dataCorte.setDate(dataCorte.getDate() - diasAlerta)

        const { data, error } = await supabase
          .from('homologacao_etapas')
          .select(`
            id, chave, nome_exibicao, status, iniciado_em,
            homologacao:homologacao_id (
              id,
              projeto:projeto_id (codigo, cliente_razao_social)
            )
          `)
          .eq('status', 'em_andamento')
          .lt('iniciado_em', dataCorte.toISOString())
          .order('iniciado_em', { ascending: true })
        if (error) return { sucesso: false, erro: error.message }

        const agora = Date.now()
        return {
          sucesso: true,
          dados: (data || []).map((e: any) => ({
            etapa: e.nome_exibicao,
            cliente: e.homologacao?.projeto?.cliente_razao_social,
            codigo_projeto: e.homologacao?.projeto?.codigo,
            dias_travada: Math.floor((agora - new Date(e.iniciado_em).getTime()) / 86400000),
          })),
        }
      }

      case 'resumo_operacional_empresa': {
        const [
          { data: projetos },
          { data: homologacoes },
          { data: tarefasUrgentes },
        ] = await Promise.all([
          supabase.from('projetos').select('status'),
          supabase.from('homologacoes').select('status_geral'),
          supabase
            .from('agenda_tarefas')
            .select('id, titulo, data_prazo, prioridade')
            .eq('status', 'pendente')
            .in('prioridade', ['alta', 'urgente'])
            .limit(20),
        ])

        const contarPorStatus = (arr: any[], campo: string) => {
          const c: Record<string, number> = {}
          for (const item of arr || []) {
            const s = item[campo] || 'desconhecido'
            c[s] = (c[s] || 0) + 1
          }
          return c
        }

        return {
          sucesso: true,
          dados: {
            total_projetos: projetos?.length || 0,
            projetos_por_status: contarPorStatus(projetos || [], 'status'),
            total_homologacoes: homologacoes?.length || 0,
            homologacoes_por_status: contarPorStatus(homologacoes || [], 'status_geral'),
            tarefas_urgentes_pendentes: tarefasUrgentes?.length || 0,
            tarefas_urgentes: (tarefasUrgentes || []).slice(0, 5),
          },
        }
      }

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
            projeto_id: input.projeto_id || null,
            criado_por_bianca: true,
          })
          .select('id, titulo, data_hora_inicio, local, projeto_id')
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
            projeto_id: input.projeto_id || null,
            criada_por_bianca: true,
          })
          .select('id, titulo, data_prazo, prioridade, projeto_id')
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

      case 'mudar_status_tarefa': {
        const { data: atual } = await supabase
          .from('agenda_tarefas')
          .select('id, status')
          .eq('id', input.id)
          .eq('usuario_id', userId)
          .single()
        if (!atual) return { sucesso: false, erro: 'Tarefa não encontrada' }

        const patch: any = { status: input.status }
        if (input.status === 'concluida') patch.concluida_em = new Date().toISOString()
        else patch.concluida_em = null

        const { error } = await supabase
          .from('agenda_tarefas')
          .update(patch)
          .eq('id', input.id)
          .eq('usuario_id', userId)
        if (error) return { sucesso: false, erro: error.message }

        await supabase.from('agenda_historico').insert({
          usuario_id: userId,
          tarefa_id: input.id,
          acao: input.status === 'concluida' ? 'concluida' : 'status_alterado',
          status_anterior: atual.status,
          status_novo: input.status,
          observacao: input.observacao,
          origem: 'bianca',
        })
        return { sucesso: true, dados: { id: input.id, status_novo: input.status } }
      }

      case 'mudar_status_evento': {
        const { data: atual } = await supabase
          .from('agenda_eventos')
          .select('id, status')
          .eq('id', input.id)
          .eq('usuario_id', userId)
          .single()
        if (!atual) return { sucesso: false, erro: 'Evento não encontrado' }

        const { error } = await supabase
          .from('agenda_eventos')
          .update({ status: input.status })
          .eq('id', input.id)
          .eq('usuario_id', userId)
        if (error) return { sucesso: false, erro: error.message }

        await supabase.from('agenda_historico').insert({
          usuario_id: userId,
          evento_id: input.id,
          acao: 'status_alterado',
          status_anterior: atual.status,
          status_novo: input.status,
          observacao: input.observacao,
          origem: 'bianca',
        })
        return { sucesso: true, dados: { id: input.id, status_novo: input.status } }
      }

      case 'enviar_whatsapp': {
        let tel = String(input.destinatario_telefone || '').replace(/\D/g, '')
        if (tel && !tel.startsWith('55') && tel.length === 11) tel = '55' + tel
        if (!tel) return { sucesso: false, erro: 'Telefone inválido' }

        const link_wa = `https://wa.me/${tel}?text=${encodeURIComponent(input.mensagem)}`
        const { data, error } = await supabase.from('bianca_comunicacoes').insert({
          usuario_id: userId,
          tarefa_id: input.tarefa_id || null,
          evento_id: input.evento_id || null,
          projeto_id: input.projeto_id || null,
          destinatario_nome: input.destinatario_nome,
          destinatario_telefone: tel,
          canal: 'whatsapp',
          mensagem: input.mensagem,
          link_wa,
          status: 'sugerida',
        }).select('id').single()
        if (error) return { sucesso: false, erro: error.message }
        return {
          sucesso: true,
          dados: { id: data.id, link_wa, telefone: tel },
          _hint: `Comunicação registrada. Kalebe pode abrir em: ${link_wa}`,
        }
      }

      case 'enviar_email': {
        const { data, error } = await supabase.from('bianca_comunicacoes').insert({
          usuario_id: userId,
          tarefa_id: input.tarefa_id || null,
          evento_id: input.evento_id || null,
          projeto_id: input.projeto_id || null,
          destinatario_nome: input.destinatario_nome,
          destinatario_email: input.destinatario_email,
          canal: 'email',
          assunto: input.assunto,
          mensagem: input.mensagem,
          status: 'sugerida',
        }).select('id').single()
        if (error) return { sucesso: false, erro: error.message }
        return { sucesso: true, dados: { id: data.id } }
      }

      default:
        return { sucesso: false, erro: `Tool desconhecida: ${toolName}` }
    }
  } catch (e: any) {
    return { sucesso: false, erro: e?.message || 'Erro inesperado' }
  }
}
