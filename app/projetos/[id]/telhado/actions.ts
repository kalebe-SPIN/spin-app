'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'

export type SecaoTelhadoInput = {
  identificador: string
  tipo_cobertura: string
  idade_anos: number | null
  area_m2: number
  orientacao: string
  inclinacao_graus: number | null
  tem_sombreamento: boolean
  sombreamento_descricao: string | null
  sombreamento_severidade: string | null
  material_estrutura: string | null
  altura_telhado_m: number | null
  observacoes: string | null
  url_satelite?: string | null
}

/** Adiciona uma seção de telhado ao projeto */
export async function adicionarSecaoAction(projetoId: string, secao: SecaoTelhadoInput) {
  const supabase = createClient()

  // Pega o próximo número de ordem
  const { data: existentes } = await supabase
    .from('projetos_telhado_secoes')
    .select('ordem')
    .eq('projeto_id', projetoId)
    .order('ordem', { ascending: false })
    .limit(1)

  const proximaOrdem = (existentes?.[0]?.ordem ?? 0) + 1

  const { error } = await supabase
    .from('projetos_telhado_secoes')
    .insert({
      projeto_id: projetoId,
      ordem: proximaOrdem,
      ...secao,
    })

  if (error) return { sucesso: false, erro: error.message }

  revalidatePath(`/projetos/${projetoId}/telhado`)
  return { sucesso: true }
}

/** Remove uma seção */
export async function removerSecaoAction(projetoId: string, secaoId: string) {
  const supabase = createClient()

  const { error } = await supabase
    .from('projetos_telhado_secoes')
    .delete()
    .eq('id', secaoId)

  if (error) return { sucesso: false, erro: error.message }

  revalidatePath(`/projetos/${projetoId}/telhado`)
  return { sucesso: true }
}

/** Marca o passo de telhado como concluído e avança o status do projeto */
export async function concluirTelhadoAction(projetoId: string) {
  const supabase = createClient()

  // Verifica que tem pelo menos 1 seção
  const { count } = await supabase
    .from('projetos_telhado_secoes')
    .select('*', { count: 'exact', head: true })
    .eq('projeto_id', projetoId)

  if (!count || count === 0) {
    return { sucesso: false, erro: 'Adicione pelo menos uma seção de telhado.' }
  }

  // Atualiza status do projeto
  const { error } = await supabase
    .from('projetos')
    .update({ status: 'telhado_preenchido' })
    .eq('id', projetoId)

  if (error) return { sucesso: false, erro: error.message }

  revalidatePath(`/projetos/${projetoId}`)
  redirect(`/projetos/${projetoId}`)
}
