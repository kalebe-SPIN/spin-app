'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'

export type KitSelecionado = {
  placa: { id: string; codigo_weg: string; modelo: string; potencia_wp: number; preco_venda: number }
  qtd_placas: number
  potencia_cc_kwp: number
  inversor: { id: string; codigo_weg: string; modelo: string; potencia_kw: number; preco_venda: number }
  qtd_inversores: number
  potencia_ca_kw: number
  fci_pct: number
  observacoes?: string | null
}

export async function salvarKitAction(projetoId: string, kit: KitSelecionado, tipoProjeto?: string) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { sucesso: false, erro: 'Não autenticado' }

  const patch: any = {
    kit_selecionado: kit,
    status: 'kit_selecionado',
  }
  if (tipoProjeto) patch.tipo_projeto = tipoProjeto

  const { error } = await supabase
    .from('projetos')
    .update(patch)
    .eq('id', projetoId)

  if (error) return { sucesso: false, erro: error.message }

  revalidatePath(`/projetos/${projetoId}`)
  redirect(`/projetos/${projetoId}`)
}
