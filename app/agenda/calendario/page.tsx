import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { CalendarioMensal } from '@/components/CalendarioMensal'

export const dynamic = 'force-dynamic'
export const revalidate = 0

export default async function CalendarioPage(props: {
  searchParams: { ano?: string; mes?: string }
}) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const hoje = new Date()
  const ano = parseInt(props.searchParams.ano || String(hoje.getFullYear()), 10)
  const mes = parseInt(props.searchParams.mes || String(hoje.getMonth() + 1), 10)

  const inicioMes = new Date(ano, mes - 1, 1)
  const fimMes = new Date(ano, mes, 1)
  // Pega também eventos que começaram no mês anterior e da semana seguinte
  const inicioGrid = new Date(inicioMes)
  inicioGrid.setDate(inicioGrid.getDate() - inicioGrid.getDay()) // volta ao domingo
  const fimGrid = new Date(fimMes)
  fimGrid.setDate(fimGrid.getDate() + (6 - fimGrid.getDay()) + 7)

  const { data: eventos } = await supabase
    .from('agenda_eventos')
    .select('id, titulo, data_hora_inicio, data_hora_fim, local, tipo, cor, criado_por_bianca')
    .eq('usuario_id', user.id)
    .gte('data_hora_inicio', inicioGrid.toISOString())
    .lt('data_hora_inicio', fimGrid.toISOString())
    .order('data_hora_inicio', { ascending: true })

  return (
    <main className="min-h-screen p-4 md:p-8">
      <div className="max-w-6xl mx-auto">
        <header className="mb-6 flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl md:text-3xl font-black text-white">
              Calendário <span className="text-sol">Bianca</span>
            </h1>
            <p className="text-white/60 mt-1 text-xs">
              Visão mensal completa da sua agenda
            </p>
          </div>
          <div className="flex gap-2">
            <Link
              href="/agenda"
              className="text-xs px-3 py-1.5 bg-white/5 border border-white/10 rounded-lg text-white/70 hover:bg-white/10"
            >
              💬 Voltar ao chat
            </Link>
            <Link
              href="/dashboard"
              className="text-xs text-white/40 hover:text-white/60 mt-2"
            >
              ← Dashboard
            </Link>
          </div>
        </header>

        <CalendarioMensal
          ano={ano}
          mes={mes}
          eventos={(eventos || []) as any}
        />
      </div>
    </main>
  )
}
