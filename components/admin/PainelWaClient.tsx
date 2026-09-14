'use client'

import { useEffect, useState, useTransition } from 'react'
import Link from 'next/link'
import { createBrowserClient } from '@supabase/ssr'
import {
  buscarPainelWaAction,
  cancelarBroadcastAction,
  atualizarTelefoneUsuarioAction,
  type PainelWa,
} from '@/app/admin/whatsapp/actions'

export function PainelWaClient({ dadosIniciais }: { dadosIniciais: PainelWa }) {
  const [dados, setDados] = useState<PainelWa>(dadosIniciais)
  const [refetching, startRefetch] = useTransition()
  const [ultima, setUltima] = useState(new Date())

  useEffect(() => {
    const supabase = createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    )

    let timer: any = null
    const refetch = () => {
      if (timer) clearTimeout(timer)
      timer = setTimeout(() => {
        startRefetch(async () => {
          const r = await buscarPainelWaAction()
          if (!('erro' in r)) {
            setDados(r)
            setUltima(new Date())
          }
        })
      }, 500)
    }

    const canal = supabase
      .channel('painel-wa')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'wa_conversas' }, refetch)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'wa_mensagens' }, refetch)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'lead_broadcasts' }, refetch)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'lead_aceites' }, refetch)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'wa_agentes' }, refetch)
      .subscribe()

    // Também refresh a cada 30s pra atualizar prazos/timers
    const iv = setInterval(refetch, 30000)

    return () => { supabase.removeChannel(canal); if (timer) clearTimeout(timer); clearInterval(iv) }
  }, [])

  const c = dados.contadores

  return (
    <div className="space-y-6">
      {/* Status realtime */}
      <p className="text-xs text-white/40">
        Atualiza automático · última: {ultima.toLocaleTimeString('pt-BR')}
        {refetching && ' · atualizando...'}
      </p>

      {/* 5 contadores */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <CardContador label="Conversas ativas" valor={c.conversas_ativas} cor="text-weg-azul" hint="não encerradas" />
        <CardContador label="Broadcasts abertos" valor={c.broadcasts_abertos} cor="text-sol" hint="lead em atribuição" />
        <CardContador label="Leads na fila" valor={c.leads_na_fila} cor="text-verde" hint="pendentes + no volante" />
        <CardContador label="Agentes IA" valor={`${c.agentes_ativos}/${c.agentes_total}`} cor="text-coral" hint="ativos" />
        <CardContador
          label="Reps com telefone"
          valor={`${c.usuarios_com_telefone}/${c.usuarios_com_telefone + c.usuarios_sem_telefone}`}
          cor={c.usuarios_sem_telefone === 0 ? 'text-verde' : 'text-coral'}
          hint={c.usuarios_sem_telefone > 0 ? `⚠ ${c.usuarios_sem_telefone} sem telefone` : 'todos cadastrados'}
        />
      </div>

      {/* Broadcasts */}
      <section className="bg-white/[0.03] border border-white/10 rounded-xl p-5">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-bold uppercase tracking-wider text-white">🎯 Broadcasts recentes</h2>
          <p className="text-[10px] text-white/40">últimos 50</p>
        </div>
        {dados.broadcasts.length === 0 ? (
          <p className="text-sm text-white/40 italic py-6 text-center">Nenhum broadcast ainda.</p>
        ) : (
          <div className="space-y-2">
            {dados.broadcasts.map((bc) => <LinhaBroadcast key={bc.id} bc={bc} />)}
          </div>
        )}
      </section>

      {/* Agentes IA */}
      <section className="bg-white/[0.03] border border-white/10 rounded-xl p-5">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-bold uppercase tracking-wider text-white">🤖 Agentes IA</h2>
          <Link href="/admin/agentes" className="text-[10px] text-sol hover:text-sol/80 uppercase tracking-wider font-bold">
            Gerenciar →
          </Link>
        </div>
        {dados.agentes.length === 0 ? (
          <p className="text-sm text-white/40 italic py-6 text-center">Nenhum agente cadastrado.</p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {dados.agentes.map((a) => <CardAgente key={a.id} a={a} />)}
          </div>
        )}
      </section>

      {/* Cadastro de telefones dos usuários — Kalebe 2026-09-14 */}
      <section className="bg-white/[0.03] border border-white/10 rounded-xl p-5">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-bold uppercase tracking-wider text-white">📞 Telefones dos usuários</h2>
          <p className="text-[10px] text-white/40">
            Sem telefone cadastrado o usuário não recebe broadcast de novo lead.
          </p>
        </div>
        {dados.usuarios.length === 0 ? (
          <p className="text-sm text-white/40 italic py-6 text-center">Nenhum usuário ativo.</p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            {dados.usuarios.map((u) => <LinhaUsuario key={u.id} u={u} />)}
          </div>
        )}
      </section>

      {/* Conversas recentes */}
      <section className="bg-white/[0.03] border border-white/10 rounded-xl p-5">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-bold uppercase tracking-wider text-white">💬 Conversas recentes</h2>
          <Link href="/inbox" className="text-[10px] text-sol hover:text-sol/80 uppercase tracking-wider font-bold">
            Abrir inbox →
          </Link>
        </div>
        {dados.conversas_recentes.length === 0 ? (
          <p className="text-sm text-white/40 italic py-6 text-center">Nenhuma conversa.</p>
        ) : (
          <div className="space-y-1.5">
            {dados.conversas_recentes.slice(0, 20).map((c) => <LinhaConversa key={c.id} c={c} />)}
          </div>
        )}
      </section>
    </div>
  )
}

function CardContador({ label, valor, cor, hint }: {
  label: string; valor: number | string; cor: string; hint?: string
}) {
  return (
    <div className="p-4 bg-white/[0.03] border border-white/10 rounded-xl">
      <p className="text-[10px] uppercase tracking-widest text-white/50 font-bold mb-2">{label}</p>
      <p className={`text-3xl font-black leading-none ${cor}`}>{valor}</p>
      {hint && <p className="text-[10px] text-white/40 mt-1">{hint}</p>}
    </div>
  )
}

function LinhaBroadcast({ bc }: { bc: any }) {
  const [expandido, setExpandido] = useState(false)
  const [isPending, startTransition] = useTransition()

  const statusInfo = {
    'aguardando_aceites': { cor: 'bg-sol/20 text-sol', label: 'AGUARDANDO ACEITES' },
    'atribuido': { cor: 'bg-verde/20 text-verde', label: 'ATRIBUÍDO' },
    'contatado': { cor: 'bg-verde/30 text-verde', label: 'CONTATADO' },
    'expirado': { cor: 'bg-coral/20 text-coral', label: 'EXPIRADO' },
    'cancelado': { cor: 'bg-white/10 text-white/50', label: 'CANCELADO' },
  }[bc.status as string] || { cor: 'bg-white/10 text-white/50', label: bc.status }

  const noVolante = (bc.fila || []).find((a: any) => a.status === 'no_volante')
  const prazoRestante = noVolante?.prazo_expira_em
    ? Math.max(0, Math.floor((new Date(noVolante.prazo_expira_em).getTime() - Date.now()) / 1000))
    : null

  function cancelar() {
    if (!confirm('Cancelar esse broadcast?')) return
    startTransition(async () => {
      await cancelarBroadcastAction(bc.id)
    })
  }

  return (
    <div className="p-3 bg-white/[0.02] border border-white/10 rounded-lg">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0 cursor-pointer" onClick={() => setExpandido(!expandido)}>
          <div className="flex items-center gap-2 mb-1">
            <span className={`text-[9px] uppercase tracking-wider font-bold px-1.5 py-0.5 rounded ${statusInfo.cor}`}>
              {statusInfo.label}
            </span>
            <span className="text-[10px] text-white/40">
              {new Date(bc.criado_em).toLocaleString('pt-BR', {
                day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
              })}
            </span>
            {prazoRestante !== null && (
              <span className={`text-[10px] font-mono font-bold ${
                prazoRestante > 120 ? 'text-verde' : prazoRestante > 30 ? 'text-sol' : 'text-coral'
              }`}>
                ⏱ {Math.floor(prazoRestante / 60)}:{String(prazoRestante % 60).padStart(2, '0')}
              </span>
            )}
          </div>
          <p className="text-sm font-bold text-white truncate">{bc.resumo}</p>
          <p className="text-[10px] text-white/50 mt-0.5">
            📤 {bc.qtd_representantes_notificados} reps notificados · 🎟 {(bc.fila || []).length} aceites
            {bc.projeto_id && <span> · <Link href={`/projetos/${bc.projeto_id}`} className="text-sol hover:underline">Ver projeto</Link></span>}
          </p>
        </div>
        <div className="flex flex-col gap-1 items-end shrink-0">
          {['aguardando_aceites', 'atribuido'].includes(bc.status) && (
            <button
              onClick={cancelar}
              disabled={isPending}
              className="text-[10px] text-coral hover:text-coral/80 font-semibold uppercase tracking-wider"
            >
              Cancelar
            </button>
          )}
        </div>
      </div>

      {expandido && bc.fila?.length > 0 && (
        <div className="mt-3 pt-3 border-t border-white/10 space-y-1">
          <p className="text-[9px] uppercase tracking-wider text-white/50 font-bold mb-1">Fila de aceites</p>
          {bc.fila.map((a: any) => <LinhaFila key={a.id} a={a} />)}
        </div>
      )}
    </div>
  )
}

function LinhaFila({ a }: { a: any }) {
  const statusInfo = {
    'pendente': { cor: 'text-white/60', icon: '⏳' },
    'no_volante': { cor: 'text-sol', icon: '🎯' },
    'contatou': { cor: 'text-verde', icon: '✅' },
    'perdeu_prazo': { cor: 'text-coral', icon: '❌' },
    'desistiu': { cor: 'text-white/40', icon: '➖' },
  }[a.status as string] || { cor: 'text-white/40', icon: '❓' }

  return (
    <div className="flex items-center gap-2 text-[11px]">
      <span className="text-white/40 font-mono w-6">#{a.posicao}</span>
      <span>{statusInfo.icon}</span>
      <span className={`flex-1 truncate font-semibold ${statusInfo.cor}`}>
        {a.representante?.nome_completo || 'Sem nome'}
      </span>
      <span className="text-[10px] text-white/40 font-mono">
        {new Date(a.aceito_em).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
      </span>
    </div>
  )
}

function CardAgente({ a }: { a: any }) {
  const inativo = !a.ativo
  return (
    <div className={`p-3 bg-white/[0.02] border rounded-lg ${inativo ? 'border-white/5 opacity-50' : 'border-white/10'}`}>
      <div className="flex items-start gap-3">
        {a.foto_url ? (
          <img src={a.foto_url} alt="" className="w-10 h-10 rounded-full shrink-0" />
        ) : (
          <div className="w-10 h-10 rounded-full bg-weg-azul/20 flex items-center justify-center text-lg shrink-0">🤖</div>
        )}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <p className="text-sm font-bold text-white truncate">{a.nome}</p>
            {!a.ativo && (
              <span className="text-[9px] uppercase tracking-wider text-coral font-bold">inativo</span>
            )}
          </div>
          <p className="text-[10px] text-white/50 truncate font-mono">{a.chave}</p>
          {a.descricao_interna && (
            <p className="text-[11px] text-white/60 mt-1 line-clamp-2">{a.descricao_interna}</p>
          )}
          <p className="text-[10px] text-white/40 mt-1">
            Ativa em: {a.condicao_ativacao?.replace(/_/g, ' ') || '—'} · Ao concluir: {a.acao_ao_concluir?.replace(/_/g, ' ') || '—'}
          </p>
        </div>
      </div>
    </div>
  )
}

function LinhaUsuario({ u }: { u: any }) {
  const [valor, setValor] = useState(u.telefone || '')
  const [salvando, startSalvar] = useTransition()
  const [erro, setErro] = useState<string | null>(null)
  const [ok, setOk] = useState(false)

  const original = String(u.telefone || '')
  const dirty = valor !== original

  function salvar() {
    setErro(null); setOk(false)
    startSalvar(async () => {
      const r = await atualizarTelefoneUsuarioAction(u.id, valor)
      if ('erro' in r) { setErro(r.erro); return }
      setValor(r.telefone)
      setOk(true)
      setTimeout(() => setOk(false), 1500)
    })
  }

  const primeiroNome = (u.nome_completo || '').split(' ')[0]

  return (
    <div className="p-2.5 bg-white/[0.02] border border-white/10 rounded-lg">
      <div className="flex items-center gap-2 mb-1">
        <span className="text-sm font-bold text-white truncate flex-1" title={u.nome_completo}>
          {u.nome_completo || 'Sem nome'}
        </span>
        <span className={`text-[9px] uppercase tracking-wider font-bold px-1.5 py-0.5 rounded ${
          u.role === 'admin' ? 'bg-sol/20 text-sol'
          : u.role === 'representante' ? 'bg-verde/20 text-verde'
          : 'bg-weg-azul/20 text-weg-azul'
        }`}>{u.role}</span>
      </div>
      <div className="flex items-center gap-2">
        <input
          value={valor}
          onChange={(e) => setValor(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && dirty) salvar() }}
          placeholder="55DDD9NNNNNNNN"
          className={`flex-1 px-2 py-1 bg-noite/40 border rounded text-xs text-white font-mono ${
            !u.telefone ? 'border-coral/30' : 'border-white/10'
          }`}
        />
        {dirty && (
          <button
            onClick={salvar}
            disabled={salvando}
            className="px-2 py-1 rounded bg-sol/20 border border-sol/40 text-sol text-[10px] font-bold uppercase disabled:opacity-40"
          >
            {salvando ? '...' : 'Salvar'}
          </button>
        )}
        {ok && <span className="text-verde text-xs">✓</span>}
      </div>
      {erro && <p className="text-[10px] text-coral mt-1">{erro}</p>}
    </div>
  )
}

function LinhaConversa({ c }: { c: any }) {
  const nome = c.contato?.nome_exibicao || c.contato?.telefone || 'Sem nome'
  const status = c.status?.replace(/_/g, ' ') || ''
  const hora = c.ultima_mensagem_em
    ? new Date(c.ultima_mensagem_em).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
    : ''
  const statusCor = c.status === 'aguardando_representante' ? 'text-sol'
    : c.status === 'em_atendimento' ? 'text-verde'
    : c.status === 'em_qualificacao' ? 'text-weg-azul'
    : c.status === 'encerrada' ? 'text-white/40'
    : 'text-white/60'

  return (
    <Link
      href={`/inbox?c=${c.id}`}
      className="flex items-center gap-3 px-2 py-1.5 rounded hover:bg-white/[0.03] transition"
    >
      <span className="text-xs text-white/40 font-mono w-16 shrink-0">
        {c.contato?.tipo === 'representante' ? '👤 rep' : c.contato?.tipo === 'lead' ? '🌱 lead' : c.contato?.tipo || ''}
      </span>
      <span className="text-sm font-semibold text-white truncate flex-1">{nome}</span>
      <span className={`text-[10px] uppercase tracking-wider font-bold ${statusCor}`}>{status}</span>
      {c.agente_ativo && (
        <span className="text-[10px] text-weg-azul font-mono">🤖 {c.agente_ativo}</span>
      )}
      {c.responsavel?.nome_completo && (
        <span className="text-[10px] text-verde truncate max-w-[100px]">👤 {c.responsavel.nome_completo.split(' ')[0]}</span>
      )}
      <span className="text-[10px] text-white/40 font-mono w-12 text-right shrink-0">{hora}</span>
    </Link>
  )
}
