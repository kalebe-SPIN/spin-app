'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { dispararGatilho } from '@/lib/bianca/gatilhos'
import { createAdminClient } from '@/lib/supabase/admin'
import { checklistPadrao } from '@/lib/campo/checklists'
import { linhaEndereco } from '@/lib/campo/comum'

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
    .select('id, codigo, status, cliente_id, consultor_id, cliente_razao_social, cliente_telefone, endereco_instalacao, cliente_endereco')
    .eq('id', projetoId)
    .single()

  if (!projeto) return { erro: 'Projeto não encontrado' }

  const statusAnterior = projeto.status

  // Update projeto — trigger trg_projetos_status_touch (migration 085/088)
  // seta status_atualizado_em e insere em projeto_status_historico
  // automaticamente. NÃO duplicar o INSERT aqui.
  const { error: erroUpd } = await supabase
    .from('projetos')
    .update({
      status: novoStatus,
      updated_at: new Date().toISOString(),
    })
    .eq('id', projetoId)

  if (erroUpd) return { erro: erroUpd.message }

  // Se veio observação, anexa no registro que o trigger acabou de criar
  if (observacoes?.trim()) {
    const { data: ultimo } = await supabase
      .from('projeto_status_historico')
      .select('id')
      .eq('projeto_id', projetoId)
      .eq('status_novo', novoStatus)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (ultimo?.id) {
      await supabase
        .from('projeto_status_historico')
        .update({ observacoes: observacoes.trim() })
        .eq('id', ultimo.id)
    }
  }

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

    // Kalebe 2026-10-06: refechamento (projeto que voltou de etapa e fechou de
    // novo) não repete a tarefa de contrato nem a mensagem pro cliente
    const jaDisparou = async (chave: string) => {
      const { data } = await createAdminClient().from('bianca_eventos_disparados')
        .select('id').eq('gatilho_chave', chave).eq('projeto_id', projeto.id).limit(1)
      return (data || []).length > 0
    }

    // 1. Tarefa de contrato (pro consultor) — via gatilho reativo Bianca
    if (!(await jaDisparou('proposta_aceita_tarefa_contrato'))) await dispararGatilho('proposta_aceita_tarefa_contrato', {
      projeto_id: projeto.id,
      usuario_id: projeto.consultor_id || userId,
      entidade_tipo: 'projeto',
      entidade_id: projeto.id,
      variaveis: {
        cliente_nome: cliente,
        codigo_projeto: projeto.codigo || projeto.id,
      },
    }).catch((e) => console.error('[gatilho tarefa_contrato]', e))

    // 1.1 Mensagem WhatsApp pro cliente (SUGERIDA — consultor confirma antes)
    if (!(await jaDisparou('proposta_aceita'))) await dispararGatilho('proposta_aceita', {
      projeto_id: projeto.id,
      usuario_id: projeto.consultor_id || userId,
      entidade_tipo: 'projeto',
      entidade_id: projeto.id,
      variaveis: {
        cliente_nome: cliente,
        codigo_projeto: projeto.codigo || projeto.id,
        cliente_telefone: projeto.cliente_telefone || '',
        rt_nome: 'nossa equipe',
      },
    }).catch((e) => console.error('[gatilho proposta_aceita]', e))

    // 1.2 Cria execução pra cada item da proposta (pipeline de obra).
    // Kalebe 2026-10-05: cada execução é uma demanda do painel do campo
    // (/campo) — já nasce com cliente, contato, endereço e checklist, sem
    // dono (o profissional de campo pega e agenda). Venda de equipamento não
    // tem serviço em campo. Service role: o consultor não grava execuções
    // pelo RLS (o projeto acima já foi lido com a permissão dele).
    try {
      const admin = createAdminClient()
      const { data: itensProjeto } = await supabase
        .from('projeto_itens')
        .select('id, tipo, titulo, valor_estimado')
        .eq('projeto_id', projeto.id)
        .neq('status', 'removido')

      const end = projeto.endereco_instalacao && Object.keys(projeto.endereco_instalacao).length
        ? projeto.endereco_instalacao : projeto.cliente_endereco || null
      for (const item of itensProjeto || []) {
        if (item.tipo === 'venda_equipamentos') continue
        const { data: jaTem } = await admin
          .from('execucoes_servicos')
          .select('id')
          .eq('item_id', item.id)
          .maybeSingle()

        if (!jaTem) {
          const base = {
            projeto_id: projeto.id,
            item_id: item.id,
            tipo_servico: item.tipo,
            titulo: `${item.titulo || item.tipo} — ${cliente}`,
            valor_contratado: item.valor_estimado,
            status: 'aguardando_pre_requisitos',
            responsavel_tecnico: null,
            endereco_execucao: linhaEndereco(end) || null,
            criada_por: userId,
          }
          const { error } = await admin.from('execucoes_servicos').insert({
            ...base,
            origem: 'projeto',
            cliente_nome: projeto.cliente_razao_social || null,
            contato_telefone: projeto.cliente_telefone || null,
            endereco: end,
            cidade: end?.cidade || null,
            bairro: end?.bairro || null,
            checklist: checklistPadrao(item.tipo),
          })
          // Migration 137 ainda não rodada → grava só o básico
          if (error && /column/.test(error.message)) await admin.from('execucoes_servicos').insert(base)
        }
      }
    } catch (execErr) {
      console.error('[auto-criacao execucao]', execErr)
    }

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
        // enum user_role não tem 'eletrotecnico' — o valor inválido zerava a busca
        .eq('role', 'admin')
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
