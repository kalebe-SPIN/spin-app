'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'
import {
  calcularNoServidor, visaoDoUsuario, dadosBaseRecarga, cadastrarEquipamentoRecarga, gerarPropostaRecarga,
  type DadosRecarga, type EquipamentoCatalogoRecarga, type NovoEquipamentoRecarga,
} from '@/lib/estacao-ve/proposta-recarga-servidor'
import type { EntradaRecarga, PropostaRecarga } from '@/lib/estacao-ve/proposta-recarga'
import { enviarPropostaPeloCanalAction } from '@/app/inbox/actions'

/**
 * Proposta da estação de recarga pela tela do projeto (Kalebe 2026-10-14) —
 * mesma composição do Spinzap (equipamentos → projeto → execução), com o
 * acesso pelo projeto (RLS) em vez da conversa.
 */

async function acesso(projeto_id: string) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { erro: 'Não autenticado' as const }
  const { data: pj } = await supabase.from('projetos').select('id').eq('id', projeto_id).maybeSingle()
  if (!pj) return { erro: 'Você não tem acesso a este projeto' as const }
  const admin = createAdminClient()
  const { data: perfil } = await admin.from('profiles').select('role, nome_completo').eq('id', user.id).maybeSingle()
  return { user, admin, ehAdmin: perfil?.role === 'admin', nome: (perfil as any)?.nome_completo || 'usuário' }
}

export async function dadosProjetoRecargaAction(projeto_id: string): Promise<DadosRecarga | { erro: string }> {
  const a = await acesso(projeto_id)
  if ('erro' in a) return { erro: a.erro as string }
  return dadosBaseRecarga(a.admin, { projetoId: projeto_id, cidade: null, uf: null, ehAdmin: a.ehAdmin })
}

export async function calcularProjetoRecargaAction(projeto_id: string, entrada: EntradaRecarga): Promise<
  { proposta: PropostaRecarga; mostra_interno: boolean } | { erro: string }
> {
  const a = await acesso(projeto_id)
  if ('erro' in a) return { erro: a.erro as string }
  const { proposta } = await calcularNoServidor(a.admin, entrada, a.ehAdmin)
  return { proposta: visaoDoUsuario(proposta, a.ehAdmin), mostra_interno: a.ehAdmin }
}

export async function cadastrarEquipamentoProjetoRecargaAction(projeto_id: string, input: NovoEquipamentoRecarga): Promise<{ equipamento: EquipamentoCatalogoRecarga } | { erro: string }> {
  const a = await acesso(projeto_id)
  if ('erro' in a) return { erro: a.erro as string }
  return cadastrarEquipamentoRecarga(a.admin, input, a.nome)
}

export async function gerarPdfProjetoRecargaAction(projeto_id: string, entrada: EntradaRecarga): Promise<
  { url_pdf: string; projeto_id: string; proposta: PropostaRecarga } | { erro: string }
> {
  const a = await acesso(projeto_id)
  if ('erro' in a) return { erro: a.erro as string }
  const r = await gerarPropostaRecarga(a.admin, { projetoId: projeto_id, entrada, ehAdmin: a.ehAdmin, usuarioId: a.user.id })
  if ('erro' in r) return r
  revalidatePath(`/projetos/${projeto_id}`)
  return { url_pdf: r.url_pdf, projeto_id, proposta: visaoDoUsuario(r.proposta, a.ehAdmin) }
}

export async function enviarPdfProjetoRecargaAction(projeto_id: string, url_pdf: string, legenda: string): Promise<
  { sucesso: true } | { erro: string }
> {
  const a = await acesso(projeto_id)
  if ('erro' in a) return { erro: a.erro as string }
  if (!/\/propostas-pdf\//.test(url_pdf)) return { erro: 'PDF inválido' }
  const r = await enviarPropostaPeloCanalAction({
    projeto_id, url_pdf, nome_arquivo: 'Proposta-Estacao-de-Recarga.pdf',
    legenda: String(legenda || '').trim().slice(0, 900) || 'Segue a proposta da sua estação de recarga ⚡',
  })
  if ('erro' in r) return { erro: r.erro }
  return { sucesso: true }
}
