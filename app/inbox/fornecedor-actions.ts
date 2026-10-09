'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { gravarMensagem } from '@/lib/whatsapp/conversas'
import { TIPOS_FORNECEDOR, rotuloTiposFornecedor } from '@/lib/spinzap/comum'
import { revalidatePath } from 'next/cache'

/**
 * Kalebe 2026-10-09 (Spinzap): "o lead pode ser também cadastrado como
 * fornecedor de equipamento, de produtos e de serviço". Grava no cadastro de
 * fornecedores do Financeiro e liga o contato do WhatsApp a ele. O tipo do
 * contato (lead/cliente) não muda — pode ser as duas coisas.
 */

const FALTA_MIG = 'Falta rodar a migration 146 (fornecedores no Spinzap) no Supabase.'

async function usuarioComAcesso(conversa_id: string) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { erro: 'Não autenticado' as const }
  // RLS: só mexe na conversa que enxerga (admin, responsável, dono, quem transferiu)
  const { data: conv } = await supabase.from('wa_conversas').select('id').eq('id', conversa_id).maybeSingle()
  if (!conv) return { erro: 'Você não tem acesso a esta conversa' as const }
  const { data: perfil } = await supabase.from('profiles').select('nome_completo').eq('id', user.id).maybeSingle()
  return { user, nome: (perfil?.nome_completo as string | null) || null }
}

/** Fornecedores já cadastrados (pra ligar o contato a um existente), A→Z. */
export async function listarFornecedoresAction(): Promise<
  { fornecedores: Array<{ id: string; nome: string; cnpj: string | null; tipos: string[] }> } | { erro: string }
> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { erro: 'Não autenticado' }
  let r: { data: any[] | null; error: any } = await supabase.from('fornecedores')
    .select('id, razao_social, nome_fantasia, cnpj, tipos').eq('ativo', true) as any
  if (r.error) r = await supabase.from('fornecedores').select('id, razao_social, nome_fantasia, cnpj').eq('ativo', true) as any
  if (r.error) return { erro: r.error.message }
  return {
    fornecedores: (r.data || [])
      .map((f: any) => ({
        id: f.id as string,
        nome: f.nome_fantasia ? `${f.nome_fantasia} (${f.razao_social})` : (f.razao_social as string),
        cnpj: (f.cnpj as string | null) || null,
        tipos: (f.tipos as string[] | undefined) || [],
      }))
      .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR')),
  }
}

export async function cadastrarFornecedorDaConversaAction(entrada: {
  conversa_id: string
  /** Liga a um fornecedor que já existe (senão cria um novo). */
  fornecedor_id?: string | null
  /** Edição do fornecedor do contato: os tipos marcados substituem os antigos (senão somam). */
  substituir_tipos?: boolean
  razao_social?: string
  nome_fantasia?: string | null
  cnpj?: string | null
  tipos: string[]
  cidade?: string | null
  uf?: string | null
  observacoes?: string | null
}): Promise<{ sucesso: true; fornecedor_id: string; nome: string } | { erro: string }> {
  const acesso = await usuarioComAcesso(entrada.conversa_id)
  if ('erro' in acesso) return { erro: acesso.erro as string }
  const tipos = TIPOS_FORNECEDOR.map((t) => t.chave).filter((t) => entrada.tipos.includes(t))
  if (!tipos.length) return { erro: 'Marque o que ele fornece: equipamento, produtos e/ou serviço' }

  const admin = createAdminClient()
  const { data: conv } = await admin.from('wa_conversas')
    .select('id, responsavel_id, contato:contato_id(id, telefone, nome_exibicao, cliente_id, projeto_id)')
    .eq('id', entrada.conversa_id).maybeSingle()
  const contato = (conv as any)?.contato as { id: string; telefone: string; nome_exibicao: string | null; cliente_id: string | null; projeto_id: string | null } | null
  if (!conv || !contato) return { erro: 'Conversa sem contato' }

  let fornecedorId = entrada.fornecedor_id || null
  let nome = ''
  if (fornecedorId) {
    // Já existe: soma os tipos marcados aos que ele já tinha (ou troca, na edição)
    const { data: f, error } = await admin.from('fornecedores').select('id, razao_social, nome_fantasia, tipos, categoria, contato_telefone').eq('id', fornecedorId).maybeSingle()
    if (error) return { erro: /tipos/.test(error.message) ? FALTA_MIG : error.message }
    if (!f) return { erro: 'Fornecedor não encontrado' }
    const todos = entrada.substituir_tipos ? tipos : Array.from(new Set([...((f.tipos as string[]) || []), ...tipos]))
    const { error: eUp } = await admin.from('fornecedores').update({
      tipos: todos,
      ...(f.categoria ? {} : { categoria: rotuloTiposFornecedor(todos) }),
      contato_telefone: f.contato_telefone || contato.telefone,
      updated_at: new Date().toISOString(),
    }).eq('id', f.id)
    if (eUp) return { erro: eUp.message }
    nome = (f.nome_fantasia as string) || (f.razao_social as string)
  } else {
    const razao = (entrada.razao_social || contato.nome_exibicao || '').trim()
    if (razao.length < 2) return { erro: 'Informe o nome ou a razão social do fornecedor' }
    const cnpj = (entrada.cnpj || '').replace(/\D/g, '') || null
    if (cnpj && cnpj.length !== 14 && cnpj.length !== 11) return { erro: 'CNPJ/CPF incompleto' }
    const cidade = entrada.cidade?.trim() || null
    const uf = entrada.uf?.trim().toUpperCase().slice(0, 2) || null
    const { data: novo, error } = await admin.from('fornecedores').insert({
      razao_social: razao,
      nome_fantasia: entrada.nome_fantasia?.trim() || null,
      cnpj,
      // Categoria (texto livre do Financeiro) já sai preenchida com o que fornece
      categoria: rotuloTiposFornecedor(tipos),
      contato_nome: contato.nome_exibicao || null,
      contato_telefone: contato.telefone,
      endereco: cidade || uf ? { cidade, uf } : null,
      observacoes: entrada.observacoes?.trim() || null,
      tipos,
      criado_por: acesso.user.id,
    }).select('id').single()
    if (error || !novo) return { erro: error && /tipos|criado_por/.test(error.message) ? FALTA_MIG : (error?.message || 'Falha ao cadastrar') }
    fornecedorId = novo.id as string
    nome = (entrada.nome_fantasia?.trim() || razao)
  }

  const { error: eCt } = await admin.from('wa_contatos').update({ fornecedor_id: fornecedorId }).eq('id', contato.id)
  if (eCt) return { erro: /fornecedor_id/.test(eCt.message) ? FALTA_MIG : eCt.message }

  // Só fornecedor (sem cliente/projeto) não é lead: a Laís sai e a conversa
  // fica com quem está atendendo (ou quem cadastrou)
  if (!contato.cliente_id && !contato.projeto_id) {
    const resp = (conv as any).responsavel_id || acesso.user.id
    await admin.from('wa_conversas').update({ responsavel_id: resp, status: 'em_atendimento', agente_ativo: null }).eq('id', conv.id)
    await admin.from('wa_conversas').update({ dono_id: resp }).eq('id', conv.id).is('dono_id', null)
  }

  const quem = (acesso.nome || 'Equipe').split(' ')[0]
  await gravarMensagem(admin, {
    conversa_id: conv.id, direcao: 'outbound', tipo: 'system',
    texto: `🏭 ${quem} ${entrada.substituir_tipos ? 'atualizou o fornecedor' : 'cadastrou o contato como fornecedor'} (${rotuloTiposFornecedor(tipos).toLowerCase()}): ${nome}`,
    remetente_id: acesso.user.id, origem_agente_nome: 'Spinzap', status_entrega: 'enviada',
  })
  revalidatePath('/spinzap')
  revalidatePath('/financeiro/fluxo-caixa')
  return { sucesso: true, fornecedor_id: fornecedorId, nome }
}

/** Desfaz o vínculo (cadastro errado). O fornecedor continua no Financeiro. */
export async function desvincularFornecedorDaConversaAction(conversa_id: string): Promise<{ sucesso: true } | { erro: string }> {
  const acesso = await usuarioComAcesso(conversa_id)
  if ('erro' in acesso) return { erro: acesso.erro as string }
  const admin = createAdminClient()
  const { data: conv } = await admin.from('wa_conversas').select('contato_id').eq('id', conversa_id).maybeSingle()
  if (!conv?.contato_id) return { erro: 'Conversa sem contato' }
  const { error } = await admin.from('wa_contatos').update({ fornecedor_id: null }).eq('id', conv.contato_id)
  if (error) return { erro: /fornecedor_id/.test(error.message) ? FALTA_MIG : error.message }
  const quem = (acesso.nome || 'Equipe').split(' ')[0]
  await gravarMensagem(admin, {
    conversa_id, direcao: 'outbound', tipo: 'system',
    texto: `🏭 ${quem} tirou a marcação de fornecedor deste contato`,
    remetente_id: acesso.user.id, origem_agente_nome: 'Spinzap', status_entrega: 'enviada',
  })
  revalidatePath('/spinzap')
  return { sucesso: true }
}
