'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'
import {
  calcularNoServidor, visaoDoUsuario, dadosBaseRecarga, cadastrarEquipamentoRecarga, gerarPropostaRecarga,
  type DadosRecarga, type EquipamentoCatalogoRecarga, type NovoEquipamentoRecarga,
} from '@/lib/estacao-ve/proposta-recarga-servidor'
import type { EntradaRecarga, PropostaRecarga } from '@/lib/estacao-ve/proposta-recarga'
import { gerarPdfMemorialIN23 } from '@/lib/estacao-ve/pdf-memorial-in23'
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

/**
 * Kalebe 2026-10-17: memorial técnico da IN 23 do CBMSC (sem preços), a partir
 * da proposta salva — dimensionamento, enquadramento, requisitos a conferir na
 * obra e os campos do relatório do e-SCI (Anexo A ou B).
 */
export async function gerarMemorialIN23Action(projeto_id: string): Promise<{ url_pdf: string } | { erro: string }> {
  const a = await acesso(projeto_id)
  if ('erro' in a) return { erro: a.erro as string }
  const { data: pj } = await a.admin.from('projetos')
    .select('codigo, cliente_id, cliente_razao_social, endereco_instalacao, cliente_endereco, ve_recarga_selecionada').eq('id', projeto_id).maybeSingle()
  const projeto = pj as any
  const sel = projeto?.ve_recarga_selecionada
  if (!projeto || !(sel?.versao === 2 && sel.entrada)) return { erro: 'Gere a proposta da estação primeiro — o memorial usa a proposta salva' }
  const entrada = sel.entrada as EntradaRecarga
  if (!entrada.respostas?.in23?.tipo_local) return { erro: 'Responda o bloco "Segurança contra incêndio (IN 23)" e gere a proposta de novo' }
  const { proposta } = await calcularNoServidor(a.admin, entrada, true)

  let nome = projeto.cliente_razao_social || null
  if (!nome && projeto.cliente_id) {
    const { data: c } = await a.admin.from('clientes').select('razao_social').eq('id', projeto.cliente_id).maybeSingle()
    nome = (c as any)?.razao_social || null
  }
  const end = projeto.endereco_instalacao && Object.keys(projeto.endereco_instalacao).length ? projeto.endereco_instalacao : projeto.cliente_endereco || null
  const { data: empresa } = await a.admin.from('configuracoes_empresa').select('*').limit(1).maybeSingle()
  const emp = (empresa as any) || {}
  const pdf = gerarPdfMemorialIN23({
    codigo_projeto: projeto.codigo || null,
    cliente_nome: nome || 'Cliente',
    endereco: end ? { ...end, logradouro: end.logradouro || end.rua || null, cidade: end.cidade || end.municipio || null } : null,
    rt: { nome: emp.rt_nome, titulo: emp.rt_titulo, registro: emp.rt_crea, telefone: emp.rt_telefone, email: emp.rt_email },
    empresa: { razao_social: emp.razao_social, telefone: emp.telefone, email: emp.email },
    proposta,
    respostas: entrada.respostas,
  })
  const caminho = `${projeto_id}/memorial-in23-${Date.now()}.pdf`
  const up = await a.admin.storage.from('propostas-pdf').upload(caminho, Buffer.from(pdf), { contentType: 'application/pdf', upsert: false })
  if (up.error) return { erro: `Falha ao guardar o PDF: ${up.error.message}` }
  return { url_pdf: a.admin.storage.from('propostas-pdf').getPublicUrl(caminho).data.publicUrl }
}
