import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { StatusTarefaBtn, StatusEventoBtn } from '@/components/AgendaControles'
import { NovaComunicacaoForm, ComentarioForm, EnviarViaBiancaBtn } from '@/components/AgendaDetalheClient'

export const dynamic = 'force-dynamic'
export const revalidate = 0

/**
 * Página de detalhes de uma tarefa OU evento da agenda.
 * URL: /agenda/tarefa/[id] ou /agenda/evento/[id]
 * Mostra:
 *   - Info do item + status
 *   - Histórico (mudanças de status, comentários)
 *   - Comunicações Bianca (mensagens WhatsApp/email)
 *   - Form pra nova comunicação (com botão wa.me pra abrir WhatsApp)
 *   - Form pra comentário livre
 */
export default async function AgendaDetalhePage({
  params,
}: {
  params: { tipo: string; id: string }
}) {
  if (params.tipo !== 'tarefa' && params.tipo !== 'evento') notFound()
  const tipo = params.tipo as 'tarefa' | 'evento'

  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // Busca o item
  const table = tipo === 'tarefa' ? 'agenda_tarefas' : 'agenda_eventos'
  const { data: item } = await supabase
    .from(table)
    .select('*, projeto:projetos(id, codigo, cliente_razao_social)')
    .eq('id', params.id)
    .eq('usuario_id', user.id)
    .single()

  if (!item) notFound()

  // Histórico
  const { data: historico } = await supabase
    .from('agenda_historico')
    .select('*')
    .eq(tipo === 'tarefa' ? 'tarefa_id' : 'evento_id', params.id)
    .order('criado_em', { ascending: false })

  // Comunicações
  const { data: comunicacoes } = await supabase
    .from('bianca_comunicacoes')
    .select('*')
    .eq(tipo === 'tarefa' ? 'tarefa_id' : 'evento_id', params.id)
    .order('criado_em', { ascending: false })

  return (
    <main className="min-h-screen p-4 md:p-8">
      <div className="max-w-4xl mx-auto space-y-6">
        <header>
          <Link href="/agenda" className="text-xs text-white/40 hover:text-white/70">
            ← Voltar à agenda
          </Link>
          <div className="mt-2 flex items-start justify-between gap-4">
            <div>
              <p className="text-[10px] uppercase tracking-wider text-white/40">
                {tipo === 'tarefa' ? 'Tarefa' : 'Evento'}
                {item.criada_por_bianca || item.criado_por_bianca ? (
                  <span className="ml-2 text-sol">🤖 criada pela Bianca</span>
                ) : null}
              </p>
              <h1 className="text-2xl md:text-3xl font-black text-white">{item.titulo}</h1>
              {item.descricao && (
                <p className="text-sm text-white/60 mt-1">{item.descricao}</p>
              )}
            </div>
            {tipo === 'tarefa' ? (
              <StatusTarefaBtn tarefaId={item.id} statusAtual={item.status} />
            ) : (
              <StatusEventoBtn eventoId={item.id} statusAtual={item.status || 'agendado'} />
            )}
          </div>
        </header>

        {/* Info do item */}
        <section className="bg-white/[0.03] border border-white/10 rounded-xl p-5 grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
          {tipo === 'tarefa' && (
            <>
              <Campo label="Prioridade" valor={item.prioridade} />
              <Campo label="Prazo" valor={item.data_prazo ? new Date(item.data_prazo + 'T12:00:00-03:00').toLocaleDateString('pt-BR') : '—'} />
              <Campo label="Concluída em" valor={item.concluida_em ? new Date(item.concluida_em).toLocaleString('pt-BR') : '—'} />
            </>
          )}
          {tipo === 'evento' && (
            <>
              <Campo label="Início" valor={new Date(item.data_hora_inicio).toLocaleString('pt-BR')} />
              <Campo label="Fim" valor={item.data_hora_fim ? new Date(item.data_hora_fim).toLocaleString('pt-BR') : '—'} />
              <Campo label="Local" valor={item.local || '—'} />
              <Campo label="Tipo" valor={item.tipo} />
            </>
          )}
          {item.projeto && (
            <Campo label="Projeto" valor={
              <Link href={`/projetos/${item.projeto.id}`} className="text-sol hover:underline">
                {item.projeto.codigo} · {item.projeto.cliente_razao_social}
              </Link>
            } />
          )}
        </section>

        {/* Comunicações */}
        <section className="bg-white/[0.03] border border-white/10 rounded-xl p-5">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-xs uppercase tracking-wider font-bold text-verde">
              💬 Comunicações ({comunicacoes?.length || 0})
            </h2>
          </div>

          <NovaComunicacaoForm
            tarefaId={tipo === 'tarefa' ? params.id : null}
            eventoId={tipo === 'evento' ? params.id : null}
            projetoId={item.projeto?.id ?? null}
            destinatarioSugerido={item.projeto?.cliente_razao_social ?? item.cliente_nome ?? ''}
          />

          {(!comunicacoes || comunicacoes.length === 0) ? (
            <p className="text-xs text-white/40 mt-3">Nenhuma comunicação registrada ainda.</p>
          ) : (
            <div className="mt-4 space-y-2">
              {comunicacoes.map((c: any) => (
                <ComunicacaoCard key={c.id} c={c} />
              ))}
            </div>
          )}
        </section>

        {/* Histórico + comentário */}
        <section className="bg-white/[0.03] border border-white/10 rounded-xl p-5">
          <h2 className="text-xs uppercase tracking-wider font-bold text-sol mb-3">
            📜 Histórico ({historico?.length || 0})
          </h2>

          <ComentarioForm
            tarefaId={tipo === 'tarefa' ? params.id : null}
            eventoId={tipo === 'evento' ? params.id : null}
          />

          {(!historico || historico.length === 0) ? (
            <p className="text-xs text-white/40 mt-3">Sem registros de alterações.</p>
          ) : (
            <div className="mt-4 space-y-2">
              {historico.map((h: any) => (
                <HistoricoLinha key={h.id} h={h} />
              ))}
            </div>
          )}
        </section>
      </div>
    </main>
  )
}

function Campo({ label, valor }: { label: string; valor: any }) {
  return (
    <div>
      <p className="text-[10px] uppercase text-white/40">{label}</p>
      <p className="text-white capitalize">{valor}</p>
    </div>
  )
}

function ComunicacaoCard({ c }: { c: any }) {
  const canalEmoji: Record<string, string> = {
    whatsapp: '📱', email: '📧', sms: '📩', ligacao_lembrete: '📞',
  }
  const statusCor: Record<string, string> = {
    sugerida: 'bg-sol/10 border-sol/30 text-sol',
    enviada_manualmente: 'bg-verde/10 border-verde/30 text-verde',
    enviada_bianca: 'bg-verde/10 border-verde/30 text-verde',
    lida: 'bg-weg-azul/10 border-weg-azul/30 text-weg-azul',
    respondida: 'bg-weg-azul/10 border-weg-azul/30 text-weg-azul',
    falhou: 'bg-coral/10 border-coral/30 text-coral',
  }
  return (
    <div className="bg-noite/40 border border-white/10 rounded-lg p-3">
      <div className="flex items-center gap-2 mb-2 flex-wrap">
        <span className="text-lg">{canalEmoji[c.canal] || '💬'}</span>
        <span className="text-sm font-bold text-white">{c.destinatario_nome || 'Destinatário'}</span>
        {c.destinatario_telefone && (
          <span className="text-[10px] text-white/50">📞 {c.destinatario_telefone}</span>
        )}
        <span className={`text-[9px] uppercase font-bold px-2 py-0.5 rounded-full border ${statusCor[c.status] || 'bg-white/5 border-white/10 text-white/50'}`}>
          {c.status}
        </span>
        <span className="text-[9px] text-white/40 ml-auto">
          {new Date(c.criado_em).toLocaleString('pt-BR')}
        </span>
      </div>
      {c.assunto && (
        <p className="text-xs font-bold text-white/80 mb-1">{c.assunto}</p>
      )}
      <p className="text-xs text-white/70 whitespace-pre-wrap">{c.mensagem}</p>
      {c.status === 'sugerida' && c.canal === 'whatsapp' && (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          {c.link_wa && (
            <a
              href={c.link_wa}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 px-3 py-1 bg-verde/20 border border-verde/40 text-verde text-xs font-bold rounded hover:bg-verde/30"
            >
              📱 Abrir manual
            </a>
          )}
          <EnviarViaBiancaBtn comunicacaoId={c.id} />
        </div>
      )}
      {c.meta_message_id && (
        <p className="text-[9px] text-white/40 mt-2 font-mono">
          Meta ID: {c.meta_message_id.slice(0, 30)}
          {c.entregue_em && ` · entregue ${new Date(c.entregue_em).toLocaleString('pt-BR')}`}
          {c.lida_em && ` · lida ${new Date(c.lida_em).toLocaleString('pt-BR')}`}
        </p>
      )}
      {c.respondida_em && c.resposta_texto && (
        <div className="mt-2 p-2 bg-verde/5 border border-verde/20 rounded">
          <p className="text-[9px] uppercase text-verde/70">Resposta cliente · {new Date(c.respondida_em).toLocaleString('pt-BR')}</p>
          <p className="text-xs text-white mt-1">{c.resposta_texto}</p>
        </div>
      )}
    </div>
  )
}

function HistoricoLinha({ h }: { h: any }) {
  const emoji = h.origem === 'bianca' ? '🤖' : h.origem === 'sistema' ? '⚙️' : '👤'
  return (
    <div className="flex items-start gap-3 bg-noite/40 border border-white/10 rounded p-2 text-xs">
      <span className="text-base">{emoji}</span>
      <div className="flex-1 min-w-0">
        <p className="text-white/80">
          <strong className="capitalize">{h.acao.replace(/_/g, ' ')}</strong>
          {h.status_anterior && h.status_novo && (
            <span className="text-white/50"> · {h.status_anterior} → <strong className="text-sol">{h.status_novo}</strong></span>
          )}
        </p>
        {h.observacao && (
          <p className="text-white/60 italic mt-0.5">"{h.observacao}"</p>
        )}
      </div>
      <span className="text-[9px] text-white/40 flex-shrink-0">
        {new Date(h.criado_em).toLocaleString('pt-BR')}
      </span>
    </div>
  )
}
