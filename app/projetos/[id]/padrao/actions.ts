'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'

export type PadraoInput = {
  tipo_ligacao: 'monofasico' | 'bifasico' | 'trifasico' | ''
  tensao_fornecimento: '127_380'  // padrão CELESC fixo
  amperagem_disjuntor_geral_a: number | null
  medidor_bidirecional: boolean
  tem_cabine_primaria: boolean
  qgbt_tem_espaco_disjuntor_solar: boolean
  qtd_hastes_aterramento: number | null
  hastes_interligadas: boolean
  tem_spda: boolean
  distancia_string_qgbt_m: number | null
  altura_padrao_entrada_m: number | null
  observacoes: string
}

/** Salva dados do padrão e avança status do projeto */
export async function salvarPadraoAction(
  projetoId: string,
  padrao: PadraoInput,
) {
  const supabase = createClient()

  if (!padrao.tipo_ligacao) {
    return { sucesso: false, erro: 'Tipo de ligação obrigatório' }
  }
  if (!padrao.amperagem_disjuntor_geral_a) {
    return { sucesso: false, erro: 'Amperagem do disjuntor geral obrigatória' }
  }

  const { error } = await supabase
    .from('projetos')
    .update({
      padrao_entrada: padrao,
      status: 'dimensionado', // padrão preenchido → próximo passo é dimensionar
    })
    .eq('id', projetoId)

  if (error) return { sucesso: false, erro: error.message }

  revalidatePath(`/projetos/${projetoId}`)
  redirect(`/projetos/${projetoId}`)
}
