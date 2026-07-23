'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'

export async function usuarioPodeGerarDiagramas() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return false

  const { data: perfil } = await supabase
    .from('profiles')
    .select('role, pode_gerar_diagramas')
    .eq('id', user.id)
    .maybeSingle()

  return perfil?.role === 'admin' || perfil?.pode_gerar_diagramas === true
}

// Status pos-venda: podem gerar diagrama (contrato fechado)
const STATUS_PODE_GERAR = [
  'proposta_enviada', 'negociando', 'em_fechamento',  // permite prévia técnica
  'aceito', 'vendido',                                // vendido = pode oficial
  'em_homologacao', 'em_execucao', 'instalado',       // pós-venda
  'ativo_pos_venda',
]

export async function gerarDiagramaAction(
  projetoId: string,
  tipoDesenho: 'unifilar_ongrid' | 'unifilar_hibrido' | 'padrao_entrada',
  opcoes: { modoPrevia?: boolean } = {},
) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { sucesso: false, erro: 'Não autenticado' }

  const pode = await usuarioPodeGerarDiagramas()
  if (!pode) return { sucesso: false, erro: 'Sem permissão para gerar diagramas' }

  // Carrega projeto — usa admin pra bypass RLS caso status impeça leitura
  const supabaseAdmin = createAdminClient()
  const { data: projeto, error: projErr } = await supabaseAdmin
    .from('projetos')
    .select('*')
    .eq('id', projetoId)
    .maybeSingle()

  if (projErr || !projeto) return { sucesso: false, erro: 'Projeto não encontrado' }

  // Status: permite qualquer status "avançado" (proposta em diante)
  // Rascunho / fatura_analisada / telhado / dimensionado / kit não bloqueia SE for admin,
  // mas por padrão pedimos que esteja em pipeline comercial ou depois
  if (!STATUS_PODE_GERAR.includes(projeto.status)) {
    return {
      sucesso: false,
      erro: `Projeto ainda não está pronto pra gerar diagrama (status atual: ${projeto.status}). Envie a proposta ao cliente antes.`,
    }
  }

  // Carrega config empresa (snapshot pra rastreabilidade)
  const { data: config } = await supabaseAdmin
    .from('configuracoes_empresa')
    .select('*')
    .eq('singleton', true)
    .maybeSingle()

  if (!config || !config.rt_nome || !config.rt_crea) {
    return {
      sucesso: false,
      erro: 'Configuração da empresa incompleta. Preencha nome e CREA do responsável técnico em /admin/empresa antes de gerar diagramas.',
    }
  }

  // Calcula próxima versão
  const { data: ultimas } = await supabaseAdmin
    .from('projetos_diagramas')
    .select('versao')
    .eq('projeto_id', projetoId)
    .eq('tipo_desenho', tipoDesenho)
    .order('versao', { ascending: false })
    .limit(1)

  const proximaVersao = (ultimas?.[0]?.versao || 0) + 1

  // Cria registro em status 'gerando'
  const { data: novoDiagrama, error: insErr } = await supabaseAdmin
    .from('projetos_diagramas')
    .insert({
      projeto_id: projetoId,
      versao: proximaVersao,
      tipo_desenho: tipoDesenho,
      status: 'gerando',
      gerado_por: user.id,
      snapshot_empresa: config,
      eh_previa: opcoes.modoPrevia || false,
    })
    .select()
    .single()

  if (insErr || !novoDiagrama) {
    console.error('[gerarDiagrama] insert erro:', insErr)
    return { sucesso: false, erro: insErr?.message || 'Erro ao criar registro do diagrama' }
  }

  // Aciona API interna — detecta URL do ambiente (Vercel usa VERCEL_URL, dev usa localhost)
  const baseUrl =
    process.env.NEXT_PUBLIC_APP_URL ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000')

  try {
    // Fire-and-forget mas com await pra garantir que fetch inicie antes da action retornar
    // (Vercel pode matar processos após return — melhor await pelo menos o inicio da requisicao)
    const promessa = fetch(`${baseUrl}/api/gerar-diagrama`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        diagrama_id: novoDiagrama.id,
        projeto_id: projetoId,
        tipo_desenho: tipoDesenho,
      }),
    })
    // Espera 100ms pra garantir que a request foi iniciada
    await Promise.race([promessa, new Promise(r => setTimeout(r, 100))])
  } catch (e) {
    console.error('[gerarDiagrama] fetch API interna erro:', e)
    // Marca como erro no banco
    await supabaseAdmin
      .from('projetos_diagramas')
      .update({ status: 'erro', erro_mensagem: `Falha ao acionar geracao: ${(e as any)?.message || 'desconhecido'}` })
      .eq('id', novoDiagrama.id)
    return { sucesso: false, erro: 'Falha ao iniciar geração. Ver logs.' }
  }

  revalidatePath(`/projetos/${projetoId}/diagrama`)
  return { sucesso: true, diagrama_id: novoDiagrama.id }
}

/**
 * Regenera diagrama baseado em versao existente.
 * Se instrucaoAjuste for passada, envia como feedback pro Claude refinar.
 * Se nao, apenas tenta gerar de novo (util pra erros transientes).
 */
export async function regenerarDiagramaAction(
  diagramaAnteriorId: string,
  instrucaoAjuste?: string,
) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { sucesso: false, erro: 'Nao autenticado' }

  const pode = await usuarioPodeGerarDiagramas()
  if (!pode) return { sucesso: false, erro: 'Sem permissao pra gerar diagramas' }

  const supabaseAdmin = createAdminClient()

  // Busca diagrama anterior pra pegar projeto_id + tipo_desenho
  const { data: anterior } = await supabaseAdmin
    .from('projetos_diagramas')
    .select('projeto_id, tipo_desenho')
    .eq('id', diagramaAnteriorId)
    .maybeSingle()

  if (!anterior) return { sucesso: false, erro: 'Diagrama anterior nao encontrado' }

  // Reusa gerarDiagramaAction pra criar novo registro
  const result = await gerarDiagramaAction(
    anterior.projeto_id,
    anterior.tipo_desenho as any,
    { modoPrevia: false },
  )

  if (!result.sucesso) return result

  // Se tem instrucao de ajuste, salva no novo registro pra API considerar
  if (instrucaoAjuste && result.diagrama_id) {
    await supabaseAdmin
      .from('projetos_diagramas')
      .update({
        instrucao_ajuste: instrucaoAjuste,
        baseado_em_id: diagramaAnteriorId,
      })
      .eq('id', result.diagrama_id)
  }

  return result
}

/**
 * Exclui um diagrama do banco + storage.
 * Soft delete? Nao — a tabela projetos_diagramas guarda historico, entao
 * remover fisicamente uma versao ruim/errada eh o comportamento esperado.
 */
export async function excluirDiagramaAction(diagramaId: string) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { sucesso: false, erro: 'Nao autenticado' }

  const pode = await usuarioPodeGerarDiagramas()
  if (!pode) return { sucesso: false, erro: 'Sem permissao' }

  const supabaseAdmin = createAdminClient()

  // Busca dados pra saber que arquivos deletar no storage
  const { data: diag } = await supabaseAdmin
    .from('projetos_diagramas')
    .select('projeto_id, url_svg, url_pdf, url_dxf')
    .eq('id', diagramaId)
    .maybeSingle()

  if (!diag) return { sucesso: false, erro: 'Diagrama nao encontrado' }

  // Tenta remover arquivos do storage (nao bloqueia se falhar)
  const arquivos: string[] = []
  for (const url of [diag.url_svg, diag.url_pdf, diag.url_dxf]) {
    if (url && typeof url === 'string') {
      // extrai path relativo depois de /projetos-diagramas/
      const match = url.match(/projetos-diagramas\/(.+)$/)
      if (match) arquivos.push(match[1])
    }
  }
  if (arquivos.length > 0) {
    await supabaseAdmin.storage.from('projetos-diagramas').remove(arquivos).catch(() => null)
  }

  // Remove registro do banco
  const { error: delErr } = await supabaseAdmin
    .from('projetos_diagramas')
    .delete()
    .eq('id', diagramaId)

  if (delErr) return { sucesso: false, erro: delErr.message }

  revalidatePath(`/projetos/${diag.projeto_id}/diagrama`)
  return { sucesso: true }
}
