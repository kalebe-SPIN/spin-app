import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { STATUS_INFO, getTituloTipo, type StatusExecucao } from '@/lib/execucoes'

export const dynamic = 'force-dynamic'
export const revalidate = 0

export default async function ExecucoesPage() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: execucoes } = await supabase
    .from('execucoes_servicos')
    .select(`
      id, tipo_servico, titulo, valor_contratado, status,
      data_agendada, hora_agendada, endereco_execucao,
      responsavel_tecnico, materiais_separados,
      created_at, updated_at,
      projeto:projeto_id(id, codigo, cliente_razao_social, cliente_telefone)
    `)
    .neq('status', 'cancelado')
    .order('data_agendada', { ascending: true, nullsFirst: false })
    .order('created_at', { ascending: false })

  // Agrupa por status pra visao Kanban
  const porStatus: Record<string, any[]> = {}
  for (const e of execucoes || []) {
    if (!porStatus[e.status]) porStatus[e.status] = []
    porStatus[e.status].push(e)
  }

  // Ordem visual (Kanban esquerda -> direita = tempo cronologico)
  const colunas: StatusExecucao[] = [
    'aguardando_pre_requisitos',
    'agendando',
    'agendado',
    'preparando_material',
    'em_execucao',
    'concluido',
    'entregue',
    'pos_venda',
  ]

  const total = execucoes?.length || 0
  const emAndamento = (porStatus['em_execucao']?.length || 0) + (porStatus['preparando_material']?.length || 0)
  const entregues = porStatus['entregue']?.length || 0

  return (
    <main className="min-h-screen p-8 md:p-12">
      <div className="max-w-7xl mx-auto">
        <header className="mb-8">
          <Link href="/dashboard" className="text-xs text-white/40 hover:text-white/60 mb-2 inline-block">
            ← Dashboard
          </Link>
          <div className="flex items-baseline justify-between gap-4 flex-wrap">
            <div>
              <h1 className="text-3xl md:text-4xl font-black text-white">
                🔨 Execuções de serviços
              </h1>
              <p className="text-white/60 mt-1 text-sm">
                Pipeline das obras e serviços contratados — do agendamento até a entrega.
              </p>
            </div>
            <div className="flex gap-6 text-right">
              <Kpi valor={total} label="Total ativas" />
              <Kpi valor={emAndamento} label="Em andamento" cor="text-coral" />
              <Kpi valor={entregues} label="Entregues" cor="text-verde" />
            </div>
          </div>
        </header>

        {total === 0 ? (
          <div className="p-12 bg-white/[0.02] border border-dashed border-white/10 rounded-xl text-center">
            <div className="text-5xl mb-3">📋</div>
            <p className="text-lg font-bold text-white mb-1">Nenhuma execução ainda</p>
            <p className="text-sm text-white/50">
              Quando um projeto for marcado como <strong>vendido</strong>, o sistema cria automaticamente
              uma execução pra cada item da proposta.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto -mx-4 px-4">
            <div className="grid grid-cols-[repeat(8,minmax(280px,1fr))] gap-3">
              {colunas.map((s) => (
                <Coluna key={s} status={s} execucoes={porStatus[s] || []} />
              ))}
            </div>
          </div>
        )}
      </div>
    </main>
  )
}

function Kpi({ valor, label, cor = 'text-white' }: { valor: number; label: string; cor?: string }) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-wider text-white/50">{label}</p>
      <p className={`text-2xl font-black ${cor}`}>{valor}</p>
    </div>
  )
}

function Coluna({ status, execucoes }: { status: StatusExecucao; execucoes: any[] }) {
  const info = STATUS_INFO[status]
  return (
    <div className={`rounded-xl border p-3 ${info.bg}`}>
      <div className="flex items-baseline justify-between mb-3 gap-2">
        <div className="flex items-center gap-1.5">
          <span className="text-base">{info.emoji}</span>
          <p className={`text-[10px] uppercase tracking-wider font-bold ${info.cor}`}>
            {info.label}
          </p>
        </div>
        <span className={`text-xs font-black ${info.cor}`}>{execucoes.length}</span>
      </div>
      <div className="space-y-2">
        {execucoes.map((e) => (
          <CardExecucao key={e.id} exec={e} />
        ))}
      </div>
      {execucoes.length === 0 && (
        <p className="text-[10px] text-white/30 italic text-center py-2">vazio</p>
      )}
    </div>
  )
}

function CardExecucao({ exec }: { exec: any }) {
  const projeto = Array.isArray(exec.projeto) ? exec.projeto[0] : exec.projeto
  const dataFmt = exec.data_agendada
    ? new Date(exec.data_agendada + 'T00:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })
    : null

  return (
    <Link
      href={`/execucoes/${exec.id}`}
      className="block bg-noite/60 border border-white/10 rounded-lg p-2.5 hover:border-white/25 transition"
    >
      <p className="text-[10px] font-mono text-white/40 mb-0.5">{projeto?.codigo}</p>
      <p className="text-xs font-bold text-white truncate">{projeto?.cliente_razao_social}</p>
      <p className="text-[11px] text-white/60 truncate">{getTituloTipo(exec.tipo_servico)}</p>
      <div className="flex items-center justify-between gap-2 mt-1.5 text-[10px]">
        {dataFmt && (
          <span className="text-sol font-bold">
            📅 {dataFmt}{exec.hora_agendada ? ` ${exec.hora_agendada.slice(0, 5)}` : ''}
          </span>
        )}
        {exec.valor_contratado && (
          <span className="text-verde font-mono">
            R$ {parseFloat(exec.valor_contratado).toLocaleString('pt-BR', { minimumFractionDigits: 0 })}
          </span>
        )}
      </div>
    </Link>
  )
}
