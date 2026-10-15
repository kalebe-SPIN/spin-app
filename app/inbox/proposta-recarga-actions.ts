'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'
import { garantirProjetoDaCategoria, projetosDoContato } from '@/lib/propostas/projetos-contato'
import { carregarPerfil } from '@/lib/spinzap/orcamento-lais'
import {
  calcularNoServidor, visaoDoUsuario, dadosBaseRecarga, cadastrarEquipamentoRecarga, gerarPropostaRecarga,
  type DadosRecarga, type EquipamentoCatalogoRecarga, type NovoEquipamentoRecarga,
} from '@/lib/estacao-ve/proposta-recarga-servidor'
import type { EntradaRecarga, PropostaRecarga } from '@/lib/estacao-ve/proposta-recarga'

/**
 * Proposta de estação de recarga montada dentro do Spinzap (Kalebe
 * 2026-10-14): mesmo ambiente da conversa — compõe, calcula, gera o PDF
 * (fica nos arquivos do contato e no projeto de recarga) e envia.
 * O envio usa enviarPdfPropostaRapidaAction (proposta-actions.ts).
 */

async function acesso(conversa_id: string) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { erro: 'Não autenticado' as const }
  const { data: conv } = await supabase.from('wa_conversas').select('id').eq('id', conversa_id).maybeSingle()
  if (!conv) return { erro: 'Você não tem acesso a esta conversa' as const }
  const admin = createAdminClient()
  const [{ data: c }, { data: perfilUser }] = await Promise.all([
    admin.from('wa_conversas').select('id, cidade, uf, contato:contato_id(id, telefone, nome_exibicao, projeto_id, cliente_id)').eq('id', conversa_id).maybeSingle(),
    admin.from('profiles').select('role, nome_completo').eq('id', user.id).maybeSingle(),
  ])
  const contato = (c as any)?.contato
  if (!contato) return { erro: 'Conversa sem contato' as const }
  return { user, admin, conv: c as any, contato, ehAdmin: perfilUser?.role === 'admin', nome: (perfilUser as any)?.nome_completo || 'usuário' }
}

export async function dadosPropostaRecargaAction(conversa_id: string): Promise<DadosRecarga | { erro: string }> {
  const a = await acesso(conversa_id)
  if ('erro' in a) return { erro: a.erro as string }
  const projeto = (await projetosDoContato(a.admin, a.contato)).find((p) => p.aberto && p.categoria === 'recarga')
  const perfil = await carregarPerfil(a.admin, a.contato.id)
  return dadosBaseRecarga(a.admin, {
    projetoId: projeto?.id || null,
    cidade: perfil.contato.endereco?.cidade || a.conv.cidade || null,
    uf: perfil.contato.endereco?.uf || a.conv.uf || null,
    ehAdmin: a.ehAdmin,
  })
}

export async function calcularPropostaRecargaAction(conversa_id: string, entrada: EntradaRecarga): Promise<
  { proposta: PropostaRecarga; mostra_interno: boolean } | { erro: string }
> {
  const a = await acesso(conversa_id)
  if ('erro' in a) return { erro: a.erro as string }
  const { proposta } = await calcularNoServidor(a.admin, entrada, a.ehAdmin)
  return { proposta: visaoDoUsuario(proposta, a.ehAdmin), mostra_interno: a.ehAdmin }
}

export async function cadastrarEquipamentoRecargaAction(conversa_id: string, input: NovoEquipamentoRecarga): Promise<{ equipamento: EquipamentoCatalogoRecarga } | { erro: string }> {
  const a = await acesso(conversa_id)
  if ('erro' in a) return { erro: a.erro as string }
  return cadastrarEquipamentoRecarga(a.admin, input, a.nome)
}

/** Recalcula no servidor, garante o projeto de recarga do contato, salva e gera o PDF. */
export async function gerarPdfPropostaRecargaAction(conversa_id: string, entrada: EntradaRecarga): Promise<
  { url_pdf: string; projeto_id: string; proposta: PropostaRecarga } | { erro: string }
> {
  const a = await acesso(conversa_id)
  if ('erro' in a) return { erro: a.erro as string }
  // Valida antes de criar projeto (não deixa projeto vazio pra trás)
  const { proposta: previa } = await calcularNoServidor(a.admin, entrada, a.ehAdmin)
  if (!previa.equipamentos.length) return { erro: 'Adicione pelo menos um equipamento' }
  const semCusto = previa.equipamentos.filter((e) => !(e.preco_unitario > 0))
  if (semCusto.length) return { erro: `Falta o custo de: ${semCusto.map((e) => e.modelo).join(', ')}` }

  const proj = await garantirProjetoDaCategoria(a.admin, {
    contato: a.contato, categoria: 'recarga', tipo: 've_recarga', usuario_id: a.user.id,
    papel: a.ehAdmin ? 'admin' : null, nome_cliente: a.contato.nome_exibicao || null,
  })
  if ('erro' in proj) return proj
  await a.admin.from('projetos').update({ consultor_id: a.user.id }).eq('id', proj.projeto_id).is('consultor_id', null)
  const r = await gerarPropostaRecarga(a.admin, {
    projetoId: proj.projeto_id, entrada, ehAdmin: a.ehAdmin, usuarioId: a.user.id, contatoId: a.contato.id,
  })
  if ('erro' in r) return r
  revalidatePath('/spinzap')
  revalidatePath(`/projetos/${proj.projeto_id}`)
  return { url_pdf: r.url_pdf, projeto_id: proj.projeto_id, proposta: visaoDoUsuario(r.proposta, a.ehAdmin) }
}
