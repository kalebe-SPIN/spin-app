import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { cotarItensOnline } from '@/lib/davi/cotar-online'
import type { ItemKit } from '@/lib/kit-auto/montar-kit'

export const runtime = 'nodejs'
export const maxDuration = 300 // 5 min pra cotar até 30 itens

export async function POST(request: NextRequest) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) return NextResponse.json({ error: 'ANTHROPIC_API_KEY não configurada' }, { status: 500 })

  try {
    const { itens } = await request.json() as { itens: ItemKit[] }
    if (!Array.isArray(itens)) return NextResponse.json({ error: 'itens obrigatório (array)' }, { status: 400 })

    const inicio = Date.now()
    const { itens: cotados, erros } = await cotarItensOnline(supabase, itens, apiKey, user.id)
    const ms = Date.now() - inicio

    const semPrecoAntes = itens.filter((i) => !i.preco_unitario || i.origem_preco === 'sem_preco').length
    const novosPrecos = cotados.filter(
      (novo) => {
        const original = itens.find(
          (o) => o.categoria === novo.categoria && o.descricao === novo.descricao,
        )
        return original && (!original.preco_unitario || original.origem_preco === 'sem_preco') && novo.preco_unitario
      },
    ).length

    return NextResponse.json({
      itens: cotados,
      resumo: {
        tempo_ms: ms,
        total: itens.length,
        sem_preco_antes: semPrecoAntes,
        cotacoes_encontradas: novosPrecos,
        sem_preco_apos: cotados.filter((i) => !i.preco_unitario).length,
        erros_amostra: erros.slice(0, 3), // primeiros 3 erros pra debug
      },
    })
  } catch (e: any) {
    console.error('[Davi cotar-lista] Erro:', e)
    return NextResponse.json({ error: e?.message || 'Erro na cotação' }, { status: 500 })
  }
}
