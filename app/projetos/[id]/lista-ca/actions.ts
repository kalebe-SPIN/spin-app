'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import type { ItemKit } from '@/lib/kit-auto/montar-kit'
import { STATUS_FECHADOS } from '@/lib/financeiro/vendas-sistema'

export async function salvarListaCaAction(projetoId: string, itens: ItemKit[]) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { sucesso: false, erro: 'Não autenticado' }

  // Kalebe 2026-10-06: troca de projeto numa venda já fechada — refazer a
  // lista CA não derruba o projeto de "vendido"
  const { data: atual } = await supabase.from('projetos').select('status').eq('id', projetoId).maybeSingle()
  const jaVendido = STATUS_FECHADOS.includes(String(atual?.status || ''))

  const { error } = await supabase
    .from('projetos')
    .update({
      lista_ca_confirmada: itens,
      ...(jaVendido ? {} : { status: 'lista_ca_confirmada' }),
    })
    .eq('id', projetoId)

  if (error) return { sucesso: false, erro: error.message }

  revalidatePath(`/projetos/${projetoId}`)
  redirect(`/projetos/${projetoId}`)
}
