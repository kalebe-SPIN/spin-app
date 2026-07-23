'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'

/**
 * Salva as seções desenhadas no mapa como projetos_telhado_secoes.
 * Substitui as seções antigas do projeto — o mapa é a fonte da verdade.
 */
export async function salvarSecoesMapaAction(
  projetoId: string,
  secoes: Array<{
    identificador: string
    area_m2: number
    orientacao: string           // 'N', 'NE', 'E', 'SE', 'S', 'SO', 'O', 'NO'
    azimute_graus: number
    coordenadas: Array<{ lat: number; lng: number }>
    imagem_url?: string          // screenshot do mapa
  }>,
) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { erro: 'Nao autorizado' }

  // Remove seções antigas do mesmo projeto (o mapa e a fonte da verdade agora)
  await supabase
    .from('projetos_telhado_secoes')
    .delete()
    .eq('projeto_id', projetoId)

  // Insere as novas
  const rows = secoes.map((s, idx) => ({
    projeto_id: projetoId,
    ordem: idx + 1,
    identificador: s.identificador,
    tipo_cobertura: 'a definir',   // consultor edita depois no card individual
    area_m2: s.area_m2,
    orientacao: s.orientacao,
    inclinacao_graus: null,
    idade_anos: null,
    tem_sombreamento: false,
    sombreamento_descricao: null,
    sombreamento_severidade: null,
    material_estrutura: null,
    altura_telhado_m: null,
    observacoes: `Desenhada no mapa (Google Maps). Azimute: ${s.azimute_graus.toFixed(0)}°. Coords: ${s.coordenadas.length} pontos.`,
    url_satelite: s.imagem_url || null,
    coordenadas_geo: s.coordenadas,   // jsonb array
  }))

  const { error } = await supabase.from('projetos_telhado_secoes').insert(rows)
  if (error) return { erro: error.message }

  // Marca projeto como telhado preenchido
  await supabase
    .from('projetos')
    .update({ status: 'telhado_preenchido' })
    .eq('id', projetoId)

  revalidatePath(`/projetos/${projetoId}`)
  revalidatePath(`/projetos/${projetoId}/telhado`)
  return { sucesso: true, qtd_secoes: rows.length }
}
