import { createClient } from '@/lib/supabase/server'
import { RelacionamentoDuasColunas, type DadosRelacionamento } from './RelacionamentoDuasColunas'
import { abrirCanalDoProjetoAction } from '@/app/inbox/actions'

/**
 * Kalebe 2026-09-17: card único de relacionamento em 2 colunas.
 * Esquerda (💬 WhatsApp): últimas msgs + input de envio + botão vídeo/ligação.
 * Direita (📅 Agenda): eventos + tarefas com criação inline sem sair da tela.
 * Ao criar tarefa/evento, atualiza a agenda em paralelo — mesma action que
 * a rota /agenda usa. Multi-persona: se admin, dono default = usuário atual.
 */

type Props = {
  projetoId: string
  clienteId: string | null
  clienteTelefone: string | null
}

export async function RelacionamentoCard({ projetoId, clienteId, clienteTelefone }: Props) {
  const supabase = createClient()

  // Descobre conversa ligada ao cliente (ou cria se necessário).
  // Se cliente sem telefone, conversa_id vem null e coluna esquerda mostra CTA.
  let conversaId: string | null = null
  try {
    const r = await abrirCanalDoProjetoAction(projetoId)
    if ('conversa_id' in r) conversaId = r.conversa_id
  } catch { /* silencioso: se falhar, mostra fallback */ }

  const { data: { user } } = await supabase.auth.getUser()
  const usuarioId = user?.id || ''

  const [
    { data: eventos },
    { data: tarefas },
    mensagensRes,
  ] = await Promise.all([
    supabase
      .from('agenda_eventos')
      .select('id, titulo, data_hora_inicio, local, tipo, criado_por_bianca, status')
      .eq('projeto_id', projetoId)
      .order('data_hora_inicio', { ascending: true })
      .limit(20),
    supabase
      .from('agenda_tarefas')
      .select('id, titulo, data_prazo, prioridade, status, criada_por_bianca')
      .eq('projeto_id', projetoId)
      .order('data_prazo', { ascending: true, nullsFirst: false })
      .limit(20),
    conversaId
      ? supabase
          .from('wa_mensagens')
          .select('id, direcao, tipo, texto, criada_em, status_entrega, remetente:remetente_id(nome_completo), origem_agente_nome')
          .eq('conversa_id', conversaId)
          .order('criada_em', { ascending: false })
          .limit(15)
      : Promise.resolve({ data: [] as any[] }),
  ])

  const dados: DadosRelacionamento = {
    eventos: (eventos || []) as any[],
    tarefas: (tarefas || []) as any[],
    mensagens: ((mensagensRes as any).data || []).reverse(), // mais antiga em cima
    conversaId,
    temTelefone: !!clienteTelefone,
    telefoneCliente: clienteTelefone || '',
    projetoId,
    clienteId,
    usuarioId,
  }

  return <RelacionamentoDuasColunas dados={dados} />
}
