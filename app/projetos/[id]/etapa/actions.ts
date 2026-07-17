'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'

export async function mudarEtapaProjetoAction(
  projetoId: string,
  novoStatus: string,
  observacoes?: string,
) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { erro: 'Não autorizado' }

  const { data: projeto } = await supabase
    .from('projetos')
    .select('id, status, cliente_id, consultor_id, cliente_razao_social')
    .eq('id', projetoId)
    .single()

  if (!projeto) return { erro: 'Projeto não encontrado' }

  const statusAnterior = projeto.status

  // Update projeto
  const { error: erroUpd } = await supabase
    .from('projetos')
    .update({
      status: novoStatus,
      status_atualizado_em: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', projetoId)

  if (erroUpd) return { erro: erroUpd.message }

  // Log no histórico
  await supabase.from('projeto_status_historico').insert({
    projeto_id: projetoId,
    status_anterior: statusAnterior,
    status_novo: novoStatus,
    usuario_id: user.id,
    observacoes: observacoes || null,
  })

  // AUTOMAÇÕES por transição
  await disparoAutomacoes(supabase, {
    projeto,
    statusAnterior,
    novoStatus,
    userId: user.id,
  })

  revalidatePath(`/projetos/${projetoId}`)
  revalidatePath('/projetos')
  revalidatePath('/crm/pipeline')
  if (projeto.cliente_id) revalidatePath(`/crm/clientes/${projeto.cliente_id}`)

  return { sucesso: true, statusAnterior, novoStatus }
}

async function disparoAutomacoes(
  supabase: any,
  ctx: { projeto: any; statusAnterior: string; novoStatus: string; userId: string },
) {
  const { projeto, novoStatus, userId } = ctx
  const cliente = projeto.cliente_razao_social || 'cliente'

  // Follow-up quando envia proposta
  if (novoStatus === 'proposta_enviada' || novoStatus === 'negociando') {
    const daqui3Dias = new Date()
    daqui3Dias.setDate(daqui3Dias.getDate() + 3)
    await supabase.from('agenda_tarefas').insert({
      usuario_id: projeto.consultor_id || userId,
      titulo: `Follow-up ${cliente}`,
      descricao: `Ligar/mandar mensagem pro ${cliente} sobre a proposta enviada.`,
      data_prazo: daqui3Dias.toISOString().slice(0, 10),
      prioridade: 'alta',
      projeto_id: projeto.id,
      criada_por_bianca: true,
    })
  }

  // Vendido → cria contrato + HOMOLOGAÇÃO REAL (não só tarefa)
  if (novoStatus === 'vendido' || novoStatus === 'aceito') {
    const amanha = new Date()
    amanha.setDate(amanha.getDate() + 1)

    // 1. Tarefa de contrato (pro consultor)
    await supabase.from('agenda_tarefas').insert({
      usuario_id: projeto.consultor_id || userId,
      titulo: `Contrato ${cliente}`,
      descricao: 'Emitir contrato de compra e venda + procuração. Coletar assinaturas.',
      data_prazo: amanha.toISOString().slice(0, 10),
      prioridade: 'urgente',
      projeto_id: projeto.id,
    })

    // 2. Cria a homologação REAL se ainda não existir
    const { data: existente } = await supabase
      .from('homologacoes')
      .select('id')
      .eq('projeto_id', projeto.id)
      .maybeSingle()

    if (!existente) {
      // Busca admins pra atribuir (o primeiro admin ou eletrotecnico)
      const { data: adminOuTecnico } = await supabase
        .from('profiles')
        .select('id')
        .in('role', ['admin', 'eletrotecnico'])
        .limit(1)
        .maybeSingle()

      const { data: novaHom } = await supabase
        .from('homologacoes')
        .insert({
          projeto_id: projeto.id,
          etapa_atual: 1,
          status_geral: 'iniciado',
          eletrotecnico_id: adminOuTecnico?.id || null,
          observacoes: `Criada automaticamente ao fechar venda com ${cliente}`,
        })
        .select('id')
        .single()

      if (novaHom) {
        // Cria as 6 etapas fixas
        const etapas = [
          { ordem: 1, chave: 'diagrama_unifilar',    nome: 'Diagrama Unifilar' },
          { ordem: 2, chave: 'layout_instalacao',    nome: 'Layout de Instalação' },
          { ordem: 3, chave: 'memorial_descritivo',  nome: 'Memorial Descritivo' },
          { ordem: 4, chave: 'lista_kit',            nome: 'Lista do Kit FV' },
          { ordem: 5, chave: 'lista_ca',             nome: 'Lista CA' },
          { ordem: 6, chave: 'aprovacao_celesc',     nome: 'Aprovação CELESC' },
        ]
        await supabase.from('homologacao_etapas').insert(
          etapas.map((e) => ({
            homologacao_id: novaHom.id,
            ordem: e.ordem,
            chave: e.chave,
            nome_exibicao: e.nome,
            status: 'pendente',
          })),
        )

        // IMPORTANTE: geração dos arquivos NÃO acontece aqui.
        // O consultor precisa enviar 4 documentos obrigatórios primeiro
        // (foto disjuntor, foto padrão, foto fachada, PDF fatura).
        // Após o 4º upload, uploadDocumentoHomologacaoAction dispara
        // gerarArquivosAutomaticos automaticamente.
        // Isso garante que os arquivos gerados usem dados reais do site.

        // 3. Notifica o admin/técnico com tarefa de alta prioridade
        if (adminOuTecnico?.id) {
          await supabase.from('agenda_tarefas').insert({
            usuario_id: adminOuTecnico.id,
            titulo: `🏗️ Homologação ${cliente} — aguardando documentos do consultor`,
            descricao:
              `Venda fechada. Consultor precisa enviar 4 documentos (foto disjuntor, ` +
              `padrão de entrada, fachada, PDF fatura). Após uploads, arquivos são gerados ` +
              `automaticamente. Projeto: ${projeto.id}`,
            data_prazo: amanha.toISOString().slice(0, 10),
            prioridade: 'alta',
            projeto_id: projeto.id,
            criada_por_bianca: true,
          })
        }

        // 4. Tarefa pro consultor: enviar os 4 documentos obrigatórios
        await supabase.from('agenda_tarefas').insert({
          usuario_id: projeto.consultor_id || userId,
          titulo: `📸 ${cliente} — enviar 4 documentos da homologação`,
          descricao:
            `Pra sistema gerar diagrama + memorial + listas, faça upload de:\n` +
            `1. Foto do disjuntor geral do padrão de entrada\n` +
            `2. Foto do padrão de entrada (completo)\n` +
            `3. Foto da fachada do imóvel\n` +
            `4. PDF da fatura da instalação (CELESC atual)\n\n` +
            `Sobe tudo em /homologacoes → aparece na seção Documentos obrigatórios.`,
          data_prazo: amanha.toISOString().slice(0, 10),
          prioridade: 'urgente',
          projeto_id: projeto.id,
          criada_por_bianca: true,
        })
      }
    }
  }
}
