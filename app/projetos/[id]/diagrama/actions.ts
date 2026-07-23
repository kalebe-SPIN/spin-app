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
