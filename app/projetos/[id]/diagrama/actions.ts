'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

export async function usuarioPodeGerarDiagramas() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return false

  const { data: perfil } = await supabase
    .from('profiles')
    .select('role, pode_gerar_diagramas')
    .eq('id', user.id)
    .single()

  return perfil?.role === 'admin' || perfil?.pode_gerar_diagramas === true
}

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

  // Carrega projeto
  const { data: projeto, error: projErr } = await supabase
    .from('projetos')
    .select('*')
    .eq('id', projetoId)
    .single()

  if (projErr || !projeto) return { sucesso: false, erro: 'Projeto não encontrado' }

  // Modo prévia: admin pode gerar antes do cliente aceitar (marca versão como rascunho)
  // Modo oficial (padrão): só gera se status = aceito
  if (!opcoes.modoPrevia && projeto.status !== 'aceito') {
    return {
      sucesso: false,
      erro: 'Diagrama oficial só pode ser gerado após o cliente aceitar a proposta (status = aceito). Use "Gerar prévia" pra visualizar antes.',
    }
  }

  // Carrega config empresa (snapshot pra rastreabilidade)
  const { data: config } = await supabase
    .from('configuracoes_empresa')
    .select('*')
    .eq('singleton', true)
    .single()

  if (!config || !config.rt_nome || !config.rt_crea) {
    return {
      sucesso: false,
      erro: 'Configuração da empresa incompleta. Preencha nome e CREA do responsável técnico em /admin/empresa antes de gerar diagramas.',
    }
  }

  // Calcula próxima versão
  const { data: ultimas } = await supabase
    .from('projetos_diagramas')
    .select('versao')
    .eq('projeto_id', projetoId)
    .eq('tipo_desenho', tipoDesenho)
    .order('versao', { ascending: false })
    .limit(1)

  const proximaVersao = (ultimas?.[0]?.versao || 0) + 1

  // Cria registro em status 'gerando'
  const { data: novoDiagrama, error: insErr } = await supabase
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

  if (insErr || !novoDiagrama) return { sucesso: false, erro: insErr?.message || 'Erro ao criar registro' }

  // Aciona API interna que orquestra as skills
  try {
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
    fetch(`${baseUrl}/api/gerar-diagrama`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        diagrama_id: novoDiagrama.id,
        projeto_id: projetoId,
        tipo_desenho: tipoDesenho,
      }),
    }).catch(err => console.error('[gerarDiagrama] Erro ao acionar API:', err))
    // Fire-and-forget — a API atualiza o status quando termina
  } catch (e) {
    console.error('[gerarDiagrama] erro:', e)
  }

  revalidatePath(`/projetos/${projetoId}/diagrama`)
  return { sucesso: true, diagrama_id: novoDiagrama.id }
}
