import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { BiancaChat } from '@/components/BiancaChat'
import { BomDiaBotao } from '@/components/BomDiaBotao'
import { CalendarioSemanal } from '@/components/agenda/CalendarioSemanal'
import { OcupacaoBadges, calcularHorasOcupadas } from '@/components/agenda/OcupacaoBadges'
import { SeletorPar, type Par } from '@/components/agenda/SeletorPar'
import { ChatParEmpresa } from '@/components/agenda/ChatParEmpresa'
import type { EventoResumo } from '@/components/agenda/EventoPopover'

export const dynamic = 'force-dynamic'
export const revalidate = 0

export default async function AgendaPage({
  searchParams,
}: {
  searchParams?: { agenda?: string }
}) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: meuPerfil } = await supabase
    .from('profiles')
    .select('id, nome_completo, role, zona, limite_horas_agenda')
    .eq('id', user.id)
    .single()

  const meuNome = meuPerfil?.nome_completo || 'Usuário'
  const limite = Number(meuPerfil?.limite_horas_agenda ?? 6)
  const minhaZona = meuPerfil?.zona || null
  const meuRole = meuPerfil?.role || 'colaborador'

  // Pares vinculados: mesma zona, role complementar (vendedor ↔ campo)
  const roleComplementar =
    meuRole === 'representante' ? 'profissional_campo'
    : meuRole === 'profissional_campo' ? 'representante'
    : null

  let pares: Par[] = []
  if (minhaZona && roleComplementar) {
    const { data: paresRaw } = await supabase
      .from('profiles')
      .select('id, nome_completo, role')
      .eq('zona', minhaZona)
      .eq('role', roleComplementar)
      .eq('ativo', true)
    pares = (paresRaw || []).map((p) => ({ id: p.id, nome: p.nome_completo || '(sem nome)', role: p.role }))
  }

  // Agenda que estou visualizando: minha ou de um par
  const donoIdSolicitado = searchParams?.agenda
  const paresById = new Map(pares.map((p) => [p.id, p]))
  const parEscolhido = donoIdSolicitado ? paresById.get(donoIdSolicitado) : null
  const donoAtualId = parEscolhido?.id || user.id
  const donoAtualNome = parEscolhido?.nome || meuNome

  // Range: semana atual + próxima semana (2 semanas visíveis)
  const inicioSemana = new Date()
  inicioSemana.setHours(0, 0, 0, 0)
  inicioSemana.setDate(inicioSemana.getDate() - inicioSemana.getDay())
  const fimJanela = new Date(inicioSemana)
  fimJanela.setDate(fimJanela.getDate() + 14)

  const { data: eventosRaw } = await supabase
    .from('agenda_eventos')
    .select('id, titulo, data_hora_inicio, data_hora_fim, tipo, status, local, cor, usuario_id')
    .eq('usuario_id', donoAtualId)
    .gte('data_hora_inicio', inicioSemana.toISOString())
    .lt('data_hora_inicio', fimJanela.toISOString())
    .order('data_hora_inicio', { ascending: true })

  const eventos: EventoResumo[] = (eventosRaw || []).map((e) => ({
    id: e.id,
    titulo: e.titulo,
    data_hora_inicio: e.data_hora_inicio,
    data_hora_fim: e.data_hora_fim,
    tipo: e.tipo,
    status: e.status || 'agendado',
    local: e.local,
    cor: e.cor,
    usuario_id: e.usuario_id,
    dono_nome: donoAtualNome,
  }))

  // Ocupação — dia (hoje) e média do mês (últimos 30 dias)
  const inicioHoje = new Date(); inicioHoje.setHours(0, 0, 0, 0)
  const fimHoje = new Date(inicioHoje); fimHoje.setDate(fimHoje.getDate() + 1)
  const iniMes = new Date(); iniMes.setDate(iniMes.getDate() - 30); iniMes.setHours(0, 0, 0, 0)

  const { data: evsMes } = await supabase
    .from('agenda_eventos')
    .select('data_hora_inicio, data_hora_fim')
    .eq('usuario_id', donoAtualId)
    .gte('data_hora_inicio', iniMes.toISOString())
    .lt('data_hora_inicio', fimHoje.toISOString())

  const horasHoje = calcularHorasOcupadas(
    (evsMes || []).filter((e) => new Date(e.data_hora_inicio) >= inicioHoje),
    inicioHoje, fimHoje,
  )
  const horasMesTotal = calcularHorasOcupadas(evsMes || [], iniMes, fimHoje)
  const mediaHorasMes = horasMesTotal / 30

  // Bianca — histórico do chat (do usuário logado, não do par)
  const { data: conversasRaw } = await supabase
    .from('bianca_conversas')
    .select('papel, conteudo, created_at')
    .eq('usuario_id', user.id)
    .eq('canal', 'chat')
    .eq('arquivada', false)
    .order('created_at', { ascending: false })
    .limit(20)

  const historicoChat = (conversasRaw || []).slice().reverse().map((c) => ({
    papel: c.papel as 'usuario' | 'bianca',
    conteudo: c.conteudo,
    timestamp: c.created_at,
  }))

  const primeiroNome = meuNome.split(' ')[0]
  const vendoDoOutro = donoAtualId !== user.id

  return (
    <main className="min-h-screen p-4 md:p-6">
      <div className="max-w-[1400px] mx-auto">
        {/* Header */}
        <header className="mb-4 flex flex-col md:flex-row md:items-center md:justify-between gap-3">
          <div className="flex items-center gap-4 flex-wrap">
            <div>
              <h1 className="text-xl md:text-2xl font-black text-white">
                Agenda com <span className="text-sol">Bianca</span>
              </h1>
              <p className="text-white/50 text-xs">{primeiroNome} · secretária IA</p>
            </div>
            <OcupacaoBadges horasHoje={horasHoje} mediaHorasMes={mediaHorasMes} limite={limite} />
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            <SeletorPar
              meuId={user.id}
              meuNome={meuNome}
              pares={pares}
              donoAtualId={donoAtualId}
            />
            <BomDiaBotao />
            <Link href="/dashboard" className="text-xs text-white/40 hover:text-white/70">← Dashboard</Link>
          </div>
        </header>

        {vendoDoOutro && (
          <div className="mb-3 px-4 py-2 bg-weg-azul/10 border border-weg-azul/30 rounded-lg text-sm text-weg-azul">
            👥 Você está vendo a agenda de <strong>{donoAtualNome}</strong>. Eventos e tarefas que criar aqui vão pra agenda dele — a Bianca avisa automaticamente.
          </div>
        )}

        {/* Grid: calendário à esquerda, painel de conversas à direita */}
        <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_380px] gap-4">
          <div className="min-w-0">
            <CalendarioSemanal
              eventos={eventos}
              usuarioLogadoId={user.id}
              donoAtualId={donoAtualId}
              donoAtualNome={donoAtualNome}
            />
          </div>

          <aside className="flex flex-col gap-4 min-w-0">
            {/* Bianca em cima */}
            <div className="min-h-[420px]">
              <BiancaChat historicoInicial={historicoChat} />
            </div>

            {/* Chat par-a-par embaixo (só se tem par) */}
            {pares.length > 0 && (
              <ChatParEmpresa
                meuId={user.id}
                peerId={pares[0].id}
                peerNome={pares[0].nome}
              />
            )}
            {pares.length === 0 && (meuRole === 'representante' || meuRole === 'profissional_campo') && (
              <div className="p-4 bg-white/[0.03] border border-white/10 rounded-xl text-xs text-white/50 leading-relaxed">
                <p className="font-bold text-white/70 mb-1">Sem par vinculado ainda</p>
                Peça pro admin cadastrar sua <strong>zona</strong> em /admin/usuarios. O chat par-a-par aparece quando houver{' '}
                {meuRole === 'representante' ? 'um profissional de campo' : 'um vendedor de serviços'} na mesma zona.
              </div>
            )}
          </aside>
        </div>
      </div>
    </main>
  )
}
