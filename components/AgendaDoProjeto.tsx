import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'

export async function AgendaDoProjeto({ projetoId }: { projetoId: string }) {
  const supabase = createClient()

  const [{ data: eventos }, { data: tarefas }] = await Promise.all([
    supabase
      .from('agenda_eventos')
      .select('id, titulo, data_hora_inicio, local, tipo, criado_por_bianca, contexto_conversa')
      .eq('projeto_id', projetoId)
      .order('data_hora_inicio', { ascending: true })
      .limit(20),
    supabase
      .from('agenda_tarefas')
      .select('id, titulo, data_prazo, prioridade, status, criada_por_bianca, contexto_conversa')
      .eq('projeto_id', projetoId)
      .order('data_prazo', { ascending: true, nullsFirst: false })
      .limit(20),
  ])

  const temItens = (eventos?.length || 0) + (tarefas?.length || 0) > 0

  return (
    <section className="mt-6 bg-white/[0.03] border border-white/10 rounded-xl p-4">
      <header className="flex items-center justify-between mb-3">
        <h3 className="text-xs uppercase tracking-wider font-bold text-sol">
          📅 Agenda vinculada
        </h3>
        <Link
          href="/agenda"
          className="text-[10px] text-white/40 hover:text-sol"
        >
          Falar com Bianca →
        </Link>
      </header>

      {!temItens ? (
        <p className="text-xs text-white/40">
          Nenhum evento ou tarefa vinculado. Vá em <Link href="/agenda" className="text-sol">/agenda</Link> e peça pra Bianca criar algo mencionando esse cliente.
        </p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Eventos */}
          <div>
            <h4 className="text-[10px] uppercase font-bold text-white/50 mb-2">
              Eventos ({eventos?.length || 0})
            </h4>
            {!eventos || eventos.length === 0 ? (
              <p className="text-xs text-white/30">Nenhum evento.</p>
            ) : (
              <div className="space-y-1.5">
                {eventos.map((e: any) => (
                  <div key={e.id} className="bg-noite/40 border border-white/5 rounded p-2">
                    <p className="text-xs font-bold text-white flex items-center gap-1">
                      {e.titulo}
                      {e.criado_por_bianca && <span className="text-[8px] text-sol">🤖</span>}
                    </p>
                    <p className="text-[10px] text-white/50">
                      {new Date(e.data_hora_inicio).toLocaleString('pt-BR', {
                        timeZone: 'America/Sao_Paulo',
                        day: '2-digit',
                        month: '2-digit',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                      {e.local && ` · ${e.local}`}
                    </p>
                    {e.tipo && (
                      <p className="text-[9px] uppercase text-white/40 mt-0.5">{e.tipo}</p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Tarefas */}
          <div>
            <h4 className="text-[10px] uppercase font-bold text-white/50 mb-2">
              Tarefas ({tarefas?.length || 0})
            </h4>
            {!tarefas || tarefas.length === 0 ? (
              <p className="text-xs text-white/30">Nenhuma tarefa.</p>
            ) : (
              <div className="space-y-1.5">
                {tarefas.map((t: any) => (
                  <div key={t.id} className="bg-noite/40 border border-white/5 rounded p-2">
                    <p className={`text-xs flex items-center gap-1 ${
                      t.status === 'concluida' ? 'line-through text-white/40' : 'text-white font-bold'
                    }`}>
                      {t.status === 'concluida' && '✓ '}{t.titulo}
                      {t.criada_por_bianca && <span className="text-[8px] text-verde">🤖</span>}
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
                        <span>
                          até {new Date(t.data_prazo + 'T12:00:00-03:00').toLocaleDateString('pt-BR', {
                            timeZone: 'America/Sao_Paulo',
                          })}
                        </span>
                      )}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </section>
  )
}
