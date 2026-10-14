import type { createAdminClient } from '@/lib/supabase/admin'
import { CATEGORIA_DO_TIPO, INFO_CATEGORIA, categoriaDoProjeto, type CategoriaProposta } from './categorias'

/**
 * Projetos de um contato do WhatsApp, um por categoria de proposta (Kalebe
 * 2026-10-13): "quando se tratar de mais que um item será adicionado um novo
 * projeto para o contato". Ligação por projetos.wa_contato_id (mig 153), pelo
 * projeto principal do contato e pelo cliente.
 */

type Admin = ReturnType<typeof createAdminClient>
type Contato = { id: string; telefone: string; nome_exibicao: string | null; projeto_id: string | null; cliente_id: string | null }

export type ProjetoDoContato = { id: string; codigo: string | null; status: string; categoria: CategoriaProposta | null; tipos: string[]; aberto: boolean; criado_em: string }

/** Status em que a proposta já fechou ou morreu — pedido novo vira projeto novo. */
const FECHADOS = ['vendido', 'aceito', 'em_homologacao', 'em_execucao', 'instalado', 'ativo_pos_venda', 'recusado', 'cancelado', 'expirado']

export async function projetosDoContato(admin: Admin, contato: Contato): Promise<ProjetoDoContato[]> {
  const filtros = [`id.eq.${contato.projeto_id || '00000000-0000-0000-0000-000000000000'}`]
  if (contato.cliente_id) filtros.push(`cliente_id.eq.${contato.cliente_id}`)
  let r: { data: any[] | null; error: any } = await admin.from('projetos')
    .select('id, codigo, status, tipo_projeto, encerrado_tipo, excluida_em, created_at')
    .or([...filtros, `wa_contato_id.eq.${contato.id}`].join(','))
    .order('created_at', { ascending: false }).limit(30) as any
  if (r.error) {
    // mig 153 ainda não rodou: sem wa_contato_id
    r = await admin.from('projetos').select('id, codigo, status, tipo_projeto, encerrado_tipo, excluida_em, created_at')
      .or(filtros.join(',')).order('created_at', { ascending: false }).limit(30) as any
  }
  const projetos = ((r.data || []) as any[]).filter((p) => !p.excluida_em)
  if (!projetos.length) return []
  const { data: itens } = await admin.from('projeto_itens').select('projeto_id, tipo, ordem')
    .in('projeto_id', projetos.map((p) => p.id)).neq('status', 'removido').order('ordem')
  return projetos.map((p) => {
    const tipos = ((itens || []) as any[]).filter((i) => i.projeto_id === p.id).map((i) => String(i.tipo))
    return {
      id: p.id, codigo: p.codigo || null, status: String(p.status), tipos,
      categoria: categoriaDoProjeto(tipos, p.tipo_projeto),
      aberto: !FECHADOS.includes(String(p.status)) && !p.encerrado_tipo,
      criado_em: p.created_at,
    }
  })
}

/**
 * Projeto da categoria pra este contato: o aberto mais recente; senão cria um
 * novo (copiando os dados do cliente do projeto principal) com o item do tipo.
 */
export async function garantirProjetoDaCategoria(admin: Admin, a: {
  contato: Contato
  categoria: CategoriaProposta
  tipo?: string | null
  usuario_id: string
  papel: string | null
  nome_cliente?: string | null
}): Promise<{ projeto_id: string; tipo: string; criado: boolean } | { erro: string }> {
  const tipo = a.tipo && CATEGORIA_DO_TIPO[a.tipo] === a.categoria ? a.tipo : INFO_CATEGORIA[a.categoria].tipoPadrao
  const existentes = await projetosDoContato(admin, a.contato)
  const doTipo = existentes.find((p) => p.aberto && p.categoria === a.categoria)
  if (doTipo) {
    // Projeto antigo da Laís sem item: registra o item pra cair no fluxo certo
    if (!doTipo.tipos.length) {
      await admin.from('projeto_itens').insert({ projeto_id: doTipo.id, tipo, ordem: 0, status: 'pendente', dados: {} })
    }
    return { projeto_id: doTipo.id, tipo: doTipo.tipos.find((t) => CATEGORIA_DO_TIPO[t] === a.categoria) || tipo, criado: false }
  }

  // Dados do cliente: do projeto principal (se houver)
  let base: any = null
  if (a.contato.projeto_id) {
    const { data } = await admin.from('projetos')
      .select('cliente_id, cliente_razao_social, cliente_cpf_cnpj, cliente_email, cliente_telefone, cliente_endereco, endereco_instalacao, titular_cliente_id, titular_igual_cliente')
      .eq('id', a.contato.projeto_id).maybeSingle()
    base = data
  }
  const novo: Record<string, any> = {
    consultor_id: a.usuario_id,
    cliente_id: base?.cliente_id || a.contato.cliente_id || null,
    cliente_razao_social: base?.cliente_razao_social || a.nome_cliente || a.contato.nome_exibicao || 'Cliente',
    cliente_cpf_cnpj: base?.cliente_cpf_cnpj || null,
    cliente_email: base?.cliente_email || null,
    cliente_telefone: base?.cliente_telefone || a.contato.telefone,
    cliente_endereco: base?.cliente_endereco || null,
    endereco_instalacao: base?.endereco_instalacao || null,
    status: 'rascunho',
    origem_lead: 'lead_spin',
    criado_por_role: a.papel === 'admin' ? 'admin' : 'representante',
    observacoes_consultor: `Origem: Spinzap — ${INFO_CATEGORIA[a.categoria].rotulo} (projeto separado por categoria)`,
  }
  let ins = await admin.from('projetos').insert({ ...novo, wa_contato_id: a.contato.id }).select('id').single()
  if (ins.error && /wa_contato_id/.test(ins.error.message)) ins = await admin.from('projetos').insert(novo).select('id').single()
  if (ins.error || !ins.data) return { erro: `Erro ao criar o projeto: ${ins.error?.message || ''}` }
  const projetoId = ins.data.id as string
  await admin.from('projeto_itens').insert({ projeto_id: projetoId, tipo, ordem: 0, status: 'pendente', dados: {} })
  if (!a.contato.projeto_id) await admin.from('wa_contatos').update({ projeto_id: projetoId, tipo: 'lead' }).eq('id', a.contato.id)
  return { projeto_id: projetoId, tipo, criado: true }
}
