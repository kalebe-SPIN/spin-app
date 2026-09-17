import { createClient } from '@/lib/supabase/server'
import { RelacionamentoTabs, type DadosRelacionamento } from './RelacionamentoTabs'

/**
 * Kalebe 2026-09-17: card único de relacionamento com o cliente.
 * Substitui ConversaClienteCard + AgendaDoProjeto por 1 wrapper com abas:
 *   - 💬 Conversa (canal WhatsApp Spin)
 *   - 📅 Agenda (eventos + tarefas via Bianca)
 *   - 📨 Comunicações (bianca_comunicacoes — histórico Bianca)
 *   - 📚 Criativos (materiais enviados por WhatsApp)
 * Cada aba tem um "abrir tudo" que leva pra tela dedicada.
 */

type Props = {
  projetoId: string
  clienteId: string | null
  clienteTelefone: string | null
}

export async function RelacionamentoCard({ projetoId, clienteId, clienteTelefone }: Props) {
  const supabase = createClient()

  // Busca tudo em paralelo — cada consulta é rápida e falha isoladamente.
  const [
    { data: eventos },
    { data: tarefas },
    { data: comunicacoes },
    { data: mensagensWa },
    { data: criativos },
  ] = await Promise.all([
    supabase
      .from('agenda_eventos')
      .select('id, titulo, data_hora_inicio, local, tipo, criado_por_bianca')
      .eq('projeto_id', projetoId)
      .order('data_hora_inicio', { ascending: true })
      .limit(10),
    supabase
      .from('agenda_tarefas')
      .select('id, titulo, data_prazo, prioridade, status, criada_por_bianca')
      .eq('projeto_id', projetoId)
      .order('data_prazo', { ascending: true, nullsFirst: false })
      .limit(10),
    supabase
      .from('bianca_comunicacoes')
      .select('id, canal, tipo, status, criado_em, resposta_texto, respondida_em, destinatario_nome')
      .eq('projeto_id', projetoId)
      .order('criado_em', { ascending: false })
      .limit(10),
    // Últimas mensagens WhatsApp do canal Spin — puxa pela conversa ligada a
    // esse cliente. Ligação por telefone (contato) ou cliente_id direto.
    clienteTelefone
      ? supabase
          .from('wa_mensagens')
          .select('id, direcao, tipo, texto, criada_em, status_entrega, conversa_id')
          .in('conversa_id', (
            await supabase
              .from('wa_conversas')
              .select('id, contato:contato_id(telefone, cliente_id)')
              .limit(50)
          ).data
            ?.filter((c: any) =>
              c.contato?.cliente_id === clienteId
              || String(c.contato?.telefone || '').replace(/\D/g, '').endsWith(String(clienteTelefone).replace(/\D/g, '').slice(-10)),
            )
            .map((c: any) => c.id) || ['00000000-0000-0000-0000-000000000000'])
          .order('criada_em', { ascending: false })
          .limit(15)
      : { data: [] as any[] },
    // Criativos: busca em bianca_comunicacoes com tipo 'criativo' ou similar.
    // (Se não existir tabela dedicada, deixa vazio.)
    supabase
      .from('bianca_comunicacoes')
      .select('id, criado_em, resposta_texto, status')
      .eq('projeto_id', projetoId)
      .eq('tipo', 'criativo_biblioteca')
      .order('criado_em', { ascending: false })
      .limit(10),
  ])

  const dados: DadosRelacionamento = {
    eventos: (eventos || []) as any[],
    tarefas: (tarefas || []) as any[],
    comunicacoes: (comunicacoes || []) as any[],
    mensagensWa: (mensagensWa || []) as any[],
    criativos: (criativos || []) as any[],
    temTelefone: !!clienteTelefone,
  }

  return <RelacionamentoTabs projetoId={projetoId} dados={dados} />
}
