import type { createAdminClient } from '@/lib/supabase/admin'
import { findOrCreateConversaAtiva, upsertContato } from './conversas'

type Admin = ReturnType<typeof createAdminClient>

/** Status do projeto em que o cliente já fechou (contato entra como cliente, não lead). */
const JA_CLIENTE = ['aceito', 'vendido', 'em_homologacao', 'em_execucao', 'instalado', 'ativo_pos_venda']

/** O mesmo celular com e sem o nono dígito (a Meta às vezes manda sem). */
function variantes(tel: string): string[] {
  const d = tel.replace(/\D/g, '')
  if (/^55\d{2}9\d{8}$/.test(d)) return [d, d.slice(0, 4) + d.slice(5)]
  if (/^55\d{2}[6-9]\d{7}$/.test(d)) return [d, `${d.slice(0, 4)}9${d.slice(4)}`]
  return [d]
}

/**
 * Kalebe 2026-10-28: "adicionei um contato novo em um card de projeto de um
 * cliente e ele não é encontrado no Spinzap" — o contato do projeto (decisor,
 * financeiro…) só ia pra projeto_contatos. Agora também vira contato do
 * Spinzap, ligado ao projeto, com a conversa aberta (responsável = consultor
 * do projeto, pra ele enxergar). Não renomeia nem tira de outro projeto um
 * contato que já existia. Chamar só depois de conferir o acesso ao projeto.
 */
export async function garantirContatoNoSpinzap(
  admin: Admin,
  a: { projeto_id: string; nome: string; telefone: string },
): Promise<{ conversa_id: string } | { erro: string }> {
  const { data: projeto } = await admin.from('projetos').select('id, status, consultor_id').eq('id', a.projeto_id).maybeSingle()
  if (!projeto) return { erro: 'Projeto não encontrado' }

  const { data: existentes } = await admin.from('wa_contatos').select('id, telefone').in('telefone', variantes(a.telefone))
  let contatoId = existentes?.[0]?.id as string | undefined
  if (!contatoId) {
    const novo = await upsertContato(admin, {
      telefone: a.telefone,
      nome_exibicao: a.nome.trim() || null,
      tipo_default: JA_CLIENTE.includes(String(projeto.status)) ? 'cliente' : 'lead',
    })
    if (!novo) return { erro: 'Não consegui criar o contato no Spinzap' }
    contatoId = novo.id
  }
  await admin.from('wa_contatos').update({ projeto_id: a.projeto_id }).eq('id', contatoId).is('projeto_id', null)

  const conversa = await findOrCreateConversaAtiva(admin, contatoId, { status_inicial: 'em_atendimento' })
  if (!conversa) return { erro: 'Não consegui abrir a conversa no Spinzap' }
  if (projeto.consultor_id) {
    await admin.from('wa_conversas').update({ responsavel_id: projeto.consultor_id }).eq('id', conversa.id).is('responsavel_id', null)
    await admin.from('wa_conversas').update({ dono_id: projeto.consultor_id }).eq('id', conversa.id).is('dono_id', null)
  }
  return { conversa_id: conversa.id }
}
