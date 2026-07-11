import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import {
  FASES_ORDEM, FASE_DE_STATUS, INFO_STATUS, INFO_FASE,
  type StatusProjeto, type FasePipeline,
} from '@/lib/projeto-pipeline'

export const dynamic = 'force-dynamic'
export const revalidate = 0

export default async function PipelinePage() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: perfil } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  if (perfil?.role !== 'admin') {
    return (
      <main className="min-h-screen p-8 md:p-12">
        <div className="max-w-3xl mx-auto bg-coral/10 border border-coral/30 rounded-xl p-6">
          <h1 className="text-xl font-bold text-coral">Área restrita</h1>
        </div>
      </main>
    )
  }

  const { data: projetos } = await supabase
    .from('projetos')
    .select('id, codigo, status, cliente_razao_social, tipo_projeto, updated_at, status_atualizado_em')
    .order('status_atualizado_em', { ascending: false, nullsFirst: false })
    .limit(500)

  // Agrupa por fase
  const porFase: Record<FasePipeline, any[]> = {
    projeto: [], negocio: [], venda: [], execucao: [], pos_venda: [], perdido: [],
  }

  for (const p of projetos || []) {
    const fase = FASE_DE_STATUS[p.status as StatusProjeto] || 'projeto'
    porFase[fase].push(p)
  }

  // Fase perdido só mostra se tiver itens
  const fasesVisiveis = FASES_ORDEM.filter((f) => f !== 'perdido' || porFase[f].length > 0)

  return (
    <main className="min-h-screen p-4 md:p-6">
      <div className="max-w-[1600px] mx-auto">
        <header className="mb-6 flex items-start justify-between gap-3">
          <div>
            <Link href="/crm" className="text-xs text-white/40 hover:text-white/60 mb-2 inline-block">
              ← CRM
            </Link>
            <h1 className="text-2xl md:text-3xl font-black text-white">
              🎯 Pipeline Comercial
            </h1>
            <p className="text-white/60 mt-1 text-xs">
              Todos os projetos por fase — {projetos?.length || 0} no total
            </p>
          </div>
          <Link
            href="/projetos/novo"
            className="px-4 py-2 bg-sol text-noite font-bold rounded-lg text-sm hover:bg-sol/90"
          >
            + Novo
          </Link>
        </header>

        {/* Kanban horizontal — scroll infinito lateral */}
        <div className="overflow-x-auto pb-4">
          <div className="flex gap-3 min-w-min">
            {fasesVisiveis.map((fase) => {
              const info = INFO_FASE[fase]
              const items = porFase[fase]
              return (
                <div
                  key={fase}
                  className={`flex-shrink-0 w-72 rounded-xl border ${info.bgClass} ${info.borderClass}`}
                >
                  {/* Header da coluna */}
                  <div className="p-3 border-b border-white/10">
                    <div className="flex items-center justify-between">
                      <h2 className={`text-sm font-black`}>{info.label}</h2>
                      <span className={`text-xs font-bold px-2 py-0.5 rounded-full bg-white/10 text-white`}>
                        {items.length}
                      </span>
                    </div>
                    <p className="text-[10px] text-white/50 mt-0.5">{info.descricao}</p>
                  </div>

                  {/* Cards */}
                  <div className="p-2 space-y-2 max-h-[70vh] overflow-y-auto">
                    {items.length === 0 && (
                      <p className="text-[10px] text-white/30 text-center py-6 italic">
                        Nada nessa fase.
                      </p>
                    )}
                    {items.map((p) => {
                      const statusInfo = INFO_STATUS[p.status as StatusProjeto] || INFO_STATUS.rascunho
                      const dias = p.status_atualizado_em
                        ? Math.floor((Date.now() - new Date(p.status_atualizado_em).getTime()) / 86400000)
                        : null
                      return (
                        <Link
                          key={p.id}
                          href={`/projetos/${p.id}`}
                          className="block p-3 bg-noite/60 border border-white/10 rounded-lg hover:border-sol/40 hover:bg-noite/80 transition"
                        >
                          <div className="flex items-start justify-between gap-2 mb-1">
                            <p className="text-xs font-bold text-white truncate flex-1">
                              {p.cliente_razao_social}
                            </p>
                            <span className="text-sm">{statusInfo.emoji}</span>
                          </div>
                          <div className="flex items-center gap-1.5 text-[9px]">
                            <span className="text-white/40">{p.codigo}</span>
                            {p.tipo_projeto && (
                              <>
                                <span className="text-white/20">·</span>
                                <span className="text-white/40 truncate">{p.tipo_projeto}</span>
                              </>
                            )}
                          </div>
                          <div className="flex items-center justify-between mt-1.5">
                            <span className={`text-[9px] uppercase font-bold ${statusInfo.cor}`}>
                              {statusInfo.label}
                            </span>
                            {dias !== null && dias > 0 && (
                              <span className={`text-[9px] ${
                                dias > 7 ? 'text-coral' : dias > 3 ? 'text-sol' : 'text-white/40'
                              }`}>
                                {dias}d
                              </span>
                            )}
                          </div>
                        </Link>
                      )
                    })}
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        <div className="mt-4 text-[10px] text-white/40">
          💡 Clique num card pra abrir o projeto e mudar de etapa. Os dias mostram quanto tempo o projeto está nessa fase (vermelho &gt; 7 dias).
        </div>
      </div>
    </main>
  )
}
