import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { BiancaChat } from '@/components/BiancaChat'

export const dynamic = 'force-dynamic'
export const revalidate = 0

export default async function AgendaPage() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: perfil } = await supabase
    .from('profiles')
    .select('nome_completo')
    .eq('id', user.id)
    .single()
  const primeiroNome = (perfil?.nome_completo || 'Kalebe').split(' ')[0]

  const { data: conversasRaw } = await supabase
    .from('bianca_conversas')
    .select('papel, conteudo, created_at')
    .eq('usuario_id', user.id)
    .eq('canal', 'chat')
    .order('created_at', { ascending: false })
    .limit(20)

  const historicoChat = (conversasRaw || [])
    .slice()
    .reverse()
    .map((c) => ({
      papel: c.papel as 'usuario' | 'bianca',
      conteudo: c.conteudo,
      timestamp: c.created_at,
    }))

  const inicioHoje = new Date()
  inicioHoje.setHours(0, 0, 0, 0)
  const fimHoje = new Date(inicioHoje)
  fimHoje.setDate(fimHoje.getDate() + 1)

  const { data: eventosHoje } = await supabase
    .from('agenda_eventos')
    .select('id, titulo, data_hora_inicio, local, tipo, criado_por_bianca')
    .eq('usuario_id', user.id)
    .gte('data_hora_inicio', inicioHoje.toISOString())
    .lt('data_hora_inicio', fimHoje.toISOString())
    .order('data_hora_inicio', { ascending: true })

  const { data: tarefasPendentes } = await supabase
    .from('agenda_tarefas')
    .select('id, titulo, data_prazo, prioridade, criada_por_bianca')
    .eq('usuario_id', user.id)
    .eq('status', 'pendente')
    .order('data_prazo', { ascending: true, nullsFirst: false })
    .limit(10)

  return (
    <main className="min-h-screen p-4 md:p-8">
      <div className="max-w-6xl mx-auto">
        <header className="mb-6 flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl md:text-3xl font-black text-white">
              Agenda com <span className="text-sol">Bianca</span>
            </h1>
            <p className="text-white/60 mt-1 text-xs">
              Olá {primeiroNome}, sua secretária executiva IA
            </p>
          </div>
          <Link href="/dashboard" className="text-xs text-white/40 hover:text-white/60 mt-2">
            ← Voltar
          </Link>
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="lg:col-span-2">
            <BiancaChat historicoInicial={historicoChat} />
          </div>

          <aside className="space-y-4">
            <div className="bg-white/[0.03] border border-white/10 rounded-xl p-4">
              <h3 className="text-xs uppercase tracking-wider font-bold text-sol mb-3">
                📅 Hoje ({eventosHoje?.length || 0})
              </h3>
              {!eventosHoje || eventosHoje.length === 0 ? (
                <p className="text-xs text-white/40">Nada agendado hoje.</p>
              ) : (
                <div className="space-y-2">
                  {eventosHoje.map((e: any) => (
                    <div key={e.id} className="bg-noite/40 border border-white/5 rounded p-2">
                      <p className="text-sm font-bold text-white flex items-center gap-1">
                        {e.titulo}
                        {e.criado_por_bianca && (
                          <span className="text-[9px] text-sol">🤖</span>
                        )}
                      </p>
                      <p className="text-[10px] text-white/50">
                        {new Date(e.data_hora_inicio).toLocaleTimeString('pt-BR', {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                        {e.local && ` · ${e.local}`}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="bg-white/[0.03] border border-white/10 rounded-xl p-4">
              <h3 className="text-xs uppercase tracking-wider font-bold text-verde mb-3">
                ✓ Tarefas ({tarefasPendentes?.length || 0})
              </h3>
              {!tarefasPendentes || tarefasPendentes.length === 0 ? (
                <p className="text-xs text-white/40">Nenhuma pendência.</p>
              ) : (
                <div className="space-y-2">
                  {tarefasPendentes.map((t: any) => (
                    <div key={t.id} className="bg-noite/40 border border-white/5 rounded p-2">
                      <p className="text-sm text-white flex items-center gap-1">
                        {t.titulo}
                        {t.criada_por_bianca && (
                          <span className="text-[9px] text-verde">🤖</span>
                        )}
                      </p>
                      <p className="text-[10px] text-white/50 flex gap-2">
                        {t.prioridade && (
                          <span className={`uppercase font-bold ${
                            t.prioridade === 'urgente' ? 'text-coral' :
                            t.prioridade === 'alta' ? 'text-sol' : 'text-white/50'
                          }`}>
                            {t.prioridade}
                          </span>
                        )}
                        {t.data_prazo && (
                          <span>até {new Date(t.data_prazo).toLocaleDateString('pt-BR')}</span>
                        )}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="bg-sol/5 border border-sol/20 rounded-xl p-3 text-xs text-white/70">
              <p className="font-bold text-sol mb-2">💡 Fala com a Bianca em português:</p>
              <ul className="space-y-1 text-white/60">
                <li>• "Marca reunião com Vanildo amanhã 14h"</li>
                <li>• "Cria tarefa: revisar proposta até sexta"</li>
                <li>• "O que tem pra hoje?"</li>
                <li>• "Lista minhas pendências"</li>
              </ul>
            </div>
          </aside>
        </div>
      </div>
    </main>
  )
}
