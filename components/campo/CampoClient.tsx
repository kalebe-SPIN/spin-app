'use client'

import { useMemo, useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { getTituloTipo } from '@/lib/execucoes'
import {
  TIPOS_SERVICO_CAMPO, chaveRegiao, linhaEndereco, linkMapa, linkWhatsApp, rotuloOs,
  type Demanda, type EnderecoCampo,
} from '@/lib/campo/comum'
import { agendarDemandasAction, criarDemandaAction, desmarcarAction, liberarDemandaAction } from '@/app/campo/actions'

/**
 * Painel do campo (Kalebe 2026-10-05). Demandas agrupadas por região
 * (cidade · bairro) com filtro de tipo → marca vários da mesma região e
 * agenda no mesmo dia → saem do quadro e vão pra agenda. Cada um é uma OS.
 */

type Aba = 'demandas' | 'agenda' | 'feitos'
const hojeBR = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' })
const dataBR = (d: string | null) => (d ? d.slice(0, 10).split('-').reverse().join('/') : '—')
const inputCls = 'w-full bg-white/5 border border-white/10 focus:border-sol/50 rounded-lg px-3 py-2 text-white text-sm focus:outline-none'

export function CampoClient({ demandas, agenda, feitos, equipe, ehAdmin, usuarioId }: {
  demandas: Demanda[]; agenda: Demanda[]; feitos: Demanda[]
  equipe: Array<{ id: string; nome: string }>; ehAdmin: boolean; usuarioId: string
}) {
  const router = useRouter()
  const [aba, setAba] = useState<Aba>('demandas')
  const [cidade, setCidade] = useState('')
  const [bairro, setBairro] = useState('')
  const [tipo, setTipo] = useState('')
  const [busca, setBusca] = useState('')
  const [sel, setSel] = useState<Set<string>>(new Set())
  const [modal, setModal] = useState<null | 'agendar' | 'nova'>(null)
  const [msg, setMsg] = useState<{ ok: boolean; texto: string } | null>(null)
  const [pending, startTransition] = useTransition()
  const hoje = hojeBR()

  // Filtros (A→Z)
  const cidades = useMemo(() => Array.from(new Set(demandas.map((d) => d.cidade?.trim()).filter(Boolean) as string[]))
    .sort((a, b) => a.localeCompare(b, 'pt-BR')), [demandas])
  const bairros = useMemo(() => Array.from(new Set(demandas.filter((d) => !cidade || d.cidade?.trim() === cidade)
    .map((d) => d.bairro?.trim()).filter(Boolean) as string[])).sort((a, b) => a.localeCompare(b, 'pt-BR')), [demandas, cidade])
  const tiposPresentes = useMemo(() => Array.from(new Set(demandas.map((d) => d.tipo_servico)))
    .map((t) => ({ valor: t, rotulo: getTituloTipo(t) })).sort((a, b) => a.rotulo.localeCompare(b.rotulo, 'pt-BR')), [demandas])

  const filtradas = demandas.filter((d) => {
    if (cidade && d.cidade?.trim() !== cidade) return false
    if (bairro && d.bairro?.trim() !== bairro) return false
    if (tipo && d.tipo_servico !== tipo) return false
    const q = busca.trim().toLowerCase()
    if (q && !`${d.cliente_nome || ''} ${d.titulo} ${linhaEndereco(d.endereco)} ${d.projeto_codigo || ''}`.toLowerCase().includes(q)) return false
    return true
  })
  // Agrupa por região (ordem alfabética da região)
  const regioes = useMemo(() => {
    const m = new Map<string, Demanda[]>()
    for (const d of filtradas) m.set(chaveRegiao(d), [...(m.get(chaveRegiao(d)) || []), d])
    return Array.from(m.entries()).sort((a, b) => a[0].localeCompare(b[0], 'pt-BR'))
  }, [filtradas])

  function alternar(id: string) {
    setSel((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n })
  }
  function marcarRegiao(lista: Demanda[]) {
    const prontas = lista.filter((d) => d.status === 'agendando').map((d) => d.id)
    setSel((s) => {
      const todas = prontas.every((id) => s.has(id))
      const n = new Set(s)
      for (const id of prontas) { if (todas) n.delete(id); else n.add(id) }
      return n
    })
  }

  function liberar(d: Demanda) {
    startTransition(async () => {
      const r = await liberarDemandaAction(d.id)
      setMsg('erro' in r ? { ok: false, texto: r.erro } : { ok: true, texto: `${rotuloOs(d.os_numero)} liberada — já pode ser agendada` })
      router.refresh()
    })
  }

  function desmarcar(d: Demanda) {
    if (!confirm(`Tirar ${rotuloOs(d.os_numero)} da agenda e devolver pras demandas?`)) return
    startTransition(async () => {
      const r = await desmarcarAction(d.id)
      setMsg('erro' in r ? { ok: false, texto: r.erro } : { ok: true, texto: `${rotuloOs(d.os_numero)} voltou pras demandas` })
      router.refresh()
    })
  }

  // Agenda agrupada por dia (ordem cronológica)
  const porDia = useMemo(() => {
    const m = new Map<string, Demanda[]>()
    for (const d of agenda) m.set(d.data_agendada || 'sem-data', [...(m.get(d.data_agendada || 'sem-data') || []), d])
    return Array.from(m.entries()).sort((a, b) => a[0].localeCompare(b[0]))
      .map(([dia, l]) => [dia, l.sort((a, b) => (a.hora_agendada || '').localeCompare(b.hora_agendada || ''))] as const)
  }, [agenda])

  const tabCls = (a: Aba) => `px-3 py-2 text-sm whitespace-nowrap border-b-2 -mb-px ${aba === a ? 'border-sol text-white font-bold' : 'border-transparent text-white/55 hover:text-white'}`

  return (
    <div className="space-y-4 pb-24">
      {msg && (
        <div className={`p-3 rounded-lg border text-sm ${msg.ok ? 'bg-verde/10 border-verde/30 text-verde' : 'bg-coral/10 border-coral/30 text-coral'}`}>
          {msg.texto}<button onClick={() => setMsg(null)} className="float-right text-xs opacity-70">✕</button>
        </div>
      )}

      <div className="flex items-center justify-between gap-2 border-b border-white/10">
        <div className="flex gap-1 overflow-x-auto">
          <button className={tabCls('demandas')} onClick={() => setAba('demandas')}>📥 Demandas ({demandas.length})</button>
          <button className={tabCls('agenda')} onClick={() => setAba('agenda')}>📅 {ehAdmin ? 'Agenda da equipe' : 'Minha agenda'} ({agenda.length})</button>
          <button className={tabCls('feitos')} onClick={() => setAba('feitos')}>✅ Concluídos ({feitos.length})</button>
        </div>
        <button onClick={() => setModal('nova')} className="shrink-0 mb-1 px-3 py-2 bg-sol text-noite text-xs font-bold rounded-lg">+ Demanda</button>
      </div>

      {aba === 'demandas' && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            <select value={cidade} onChange={(e) => { setCidade(e.target.value); setBairro('') }} className={inputCls}>
              <option value="" className="bg-noite">Todas as cidades</option>
              {cidades.map((c) => <option key={c} value={c} className="bg-noite">{c}</option>)}
            </select>
            <select value={bairro} onChange={(e) => setBairro(e.target.value)} className={inputCls} disabled={!bairros.length}>
              <option value="" className="bg-noite">Todos os bairros</option>
              {bairros.map((b) => <option key={b} value={b} className="bg-noite">{b}</option>)}
            </select>
            <select value={tipo} onChange={(e) => setTipo(e.target.value)} className={inputCls}>
              <option value="" className="bg-noite">Todos os tipos</option>
              {tiposPresentes.map((t) => <option key={t.valor} value={t.valor} className="bg-noite">{t.rotulo}</option>)}
            </select>
            <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="🔍 Cliente, endereço, projeto" className={inputCls} />
          </div>

          {regioes.length === 0 && <p className="text-sm text-white/40 py-10 text-center">Nenhuma demanda {demandas.length ? 'nesse filtro' : 'em aberto'}. 🎉</p>}

          {regioes.map(([regiao, lista]) => {
            const prontas = lista.filter((d) => d.status === 'agendando')
            const todas = prontas.length > 0 && prontas.every((d) => sel.has(d.id))
            return (
              <section key={regiao} className="space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="text-sm font-bold text-white">📍 {regiao} <span className="text-white/40 font-normal">({lista.length})</span></h3>
                  {prontas.length > 1 && (
                    <button onClick={() => marcarRegiao(lista)} className="text-xs text-sol hover:underline">
                      {todas ? 'desmarcar a região' : `marcar os ${prontas.length} da região`}
                    </button>
                  )}
                </div>
                {lista.map((d) => {
                  const bloqueada = d.status !== 'agendando'
                  const marcado = sel.has(d.id)
                  return (
                    <div key={d.id} className={`rounded-xl border p-3 flex gap-3 ${marcado ? 'border-sol/60 bg-sol/5' : 'border-white/10 bg-white/[0.03]'}`}>
                      <input type="checkbox" checked={marcado} disabled={bloqueada} onChange={() => alternar(d.id)}
                        className="mt-1 w-5 h-5 shrink-0 accent-[#F5B400] disabled:opacity-30" aria-label="Selecionar pra agendar" />
                      <CartaoServico d={d} />
                      {bloqueada && ehAdmin && (
                        <button onClick={() => liberar(d)} disabled={pending}
                          className="self-start shrink-0 px-3 py-2 bg-white/5 border border-sol/40 text-sol text-xs font-bold rounded-lg">
                          Liberar
                        </button>
                      )}
                    </div>
                  )
                })}
              </section>
            )
          })}
        </>
      )}

      {aba === 'agenda' && (
        <div className="space-y-4">
          {porDia.length === 0 && <p className="text-sm text-white/40 py-10 text-center">Nada agendado. Marque demandas e escolha a data.</p>}
          {porDia.map(([dia, lista]) => (
            <section key={dia} className="space-y-2">
              <h3 className={`text-sm font-bold ${dia < hoje ? 'text-coral' : dia === hoje ? 'text-sol' : 'text-white'}`}>
                {dia === hoje ? '📌 Hoje' : `📅 ${dataBR(dia)}`}{dia < hoje ? ' · ⚠ passou da data' : ''} <span className="text-white/40 font-normal">({lista.length})</span>
              </h3>
              {lista.map((d) => (
                <div key={d.id} className="rounded-xl border border-white/10 bg-white/[0.03] p-3 flex flex-col sm:flex-row gap-3">
                  <div className="text-lg font-black text-sol w-14 shrink-0">{d.hora_agendada || '—'}</div>
                  <CartaoServico d={d} mostrarResponsavel={ehAdmin} />
                  <div className="flex sm:flex-col gap-2 shrink-0">
                    <Link href={`/campo/os/${d.id}`} className="px-3 py-2 bg-sol text-noite text-xs font-bold rounded-lg text-center">
                      {d.status === 'em_execucao' ? '▶ Continuar OS' : 'Abrir OS'}
                    </Link>
                    {d.status !== 'em_execucao' && (
                      <button onClick={() => desmarcar(d)} disabled={pending} className="px-3 py-2 bg-white/5 border border-white/15 text-white/70 text-xs rounded-lg">
                        Desmarcar
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </section>
          ))}
        </div>
      )}

      {aba === 'feitos' && (
        <div className="space-y-2">
          {feitos.length === 0 && <p className="text-sm text-white/40 py-10 text-center">Nenhum serviço concluído nos últimos 45 dias.</p>}
          {feitos.map((d) => (
            <Link key={d.id} href={`/campo/os/${d.id}`} className="block rounded-xl border border-white/10 bg-white/[0.03] p-3 hover:border-verde/40">
              <p className="text-sm text-white"><strong>{rotuloOs(d.os_numero)}</strong> · {d.titulo}</p>
              <p className="text-xs text-white/50">✅ {d.data_conclusao ? new Date(d.data_conclusao).toLocaleDateString('pt-BR') : ''} · {linhaEndereco(d.endereco)}{ehAdmin && d.responsavel_nome ? ` · ${d.responsavel_nome}` : ''}</p>
            </Link>
          ))}
        </div>
      )}

      {/* Barra de seleção */}
      {aba === 'demandas' && sel.size > 0 && (
        <div className="fixed bottom-0 inset-x-0 z-40 p-3 bg-noite/95 border-t border-sol/40 backdrop-blur">
          <div className="max-w-screen-xl mx-auto flex items-center justify-between gap-3">
            <span className="text-sm text-white"><strong>{sel.size}</strong> serviço(s) selecionado(s)</span>
            <span className="flex gap-2">
              <button onClick={() => setSel(new Set())} className="px-3 py-2 text-xs text-white/60">limpar</button>
              <button onClick={() => setModal('agendar')} className="px-4 py-2 bg-sol text-noite font-bold text-sm rounded-lg">📅 Agendar</button>
            </span>
          </div>
        </div>
      )}

      {modal === 'agendar' && (
        <ModalAgendar
          qtd={sel.size} equipe={equipe} ehAdmin={ehAdmin} usuarioId={usuarioId}
          onFechar={() => setModal(null)}
          onConfirmar={async (data, hora, responsavel) => {
            const r = await agendarDemandasAction({ ids: Array.from(sel), data, hora, responsavel_id: responsavel })
            if ('erro' in r) return r.erro
            setModal(null); setSel(new Set()); setAba('agenda')
            setMsg({ ok: true, texto: `${r.agendadas} serviço(s) agendado(s) pra ${dataBR(data)} — foram pra agenda.` })
            router.refresh()
            return null
          }}
        />
      )}
      {modal === 'nova' && (
        <ModalNovaDemanda
          onFechar={() => setModal(null)}
          onSalva={() => { setModal(null); setMsg({ ok: true, texto: 'Demanda cadastrada.' }); router.refresh() }}
        />
      )}
    </div>
  )
}

function CartaoServico({ d, mostrarResponsavel = false }: { d: Demanda; mostrarResponsavel?: boolean }) {
  const mapa = linkMapa(d.endereco)
  const wa = linkWhatsApp(d.contato_telefone)
  return (
    <div className="flex-1 min-w-0 space-y-1">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <span className="text-[10px] font-mono text-white/45">{rotuloOs(d.os_numero)}</span>
        <span className="text-[10px] uppercase tracking-wider font-bold px-1.5 py-0.5 rounded bg-weg-azul/15 text-weg-azul">{getTituloTipo(d.tipo_servico)}</span>
        {d.status === 'aguardando_pre_requisitos' && <span className="text-[10px] px-1.5 py-0.5 rounded bg-white/10 text-white/60">⏳ aguardando liberação</span>}
        {d.status === 'em_execucao' && <span className="text-[10px] px-1.5 py-0.5 rounded bg-coral/15 text-coral">🔨 em execução</span>}
        {d.vezes_reaberta > 0 && <span className="text-[10px] px-1.5 py-0.5 rounded bg-sol/15 text-sol">↩ voltou {d.vezes_reaberta}×</span>}
        {d.projeto_codigo ? <span className="text-[10px] text-white/45">{d.projeto_codigo}</span> : <span className="text-[10px] text-white/45">avulsa</span>}
      </div>
      <p className="text-sm font-bold text-white truncate">{d.cliente_nome || d.titulo}</p>
      <p className="text-xs text-white/60">{linhaEndereco(d.endereco) || 'Sem endereço'}</p>
      {d.descricao && <p className="text-xs text-white/50 line-clamp-2">{d.descricao}</p>}
      <div className="flex flex-wrap gap-3 text-xs">
        {mapa && <a href={mapa} target="_blank" rel="noreferrer" className="text-sol hover:underline">🗺 mapa</a>}
        {d.contato_telefone && <a href={`tel:${d.contato_telefone.replace(/\D/g, '')}`} className="text-white/70 hover:underline">📞 {d.contato_nome ? `${d.contato_nome} · ` : ''}{d.contato_telefone}</a>}
        {wa && <a href={wa} target="_blank" rel="noreferrer" className="text-verde hover:underline">💬 WhatsApp</a>}
        {mostrarResponsavel && d.responsavel_nome && <span className="text-white/50">👤 {d.responsavel_nome}</span>}
      </div>
    </div>
  )
}

function ModalAgendar({ qtd, equipe, ehAdmin, usuarioId, onFechar, onConfirmar }: {
  qtd: number; equipe: Array<{ id: string; nome: string }>; ehAdmin: boolean; usuarioId: string
  onFechar: () => void
  onConfirmar: (data: string, hora: string, responsavel: string | null) => Promise<string | null>
}) {
  const [data, setData] = useState(hojeBR())
  const [hora, setHora] = useState('08:00')
  const [resp, setResp] = useState(ehAdmin ? (equipe[0]?.id || usuarioId) : usuarioId)
  const [erro, setErro] = useState<string | null>(null)
  const [salvando, setSalvando] = useState(false)
  return (
    <div className="fixed inset-0 z-50 bg-black/70 flex items-end sm:items-center justify-center p-3" onClick={onFechar}>
      <div className="w-full max-w-md bg-noite border border-white/15 rounded-xl p-5 space-y-3" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-base font-bold text-white">📅 Agendar {qtd} serviço(s)</h2>
        <p className="text-xs text-white/60">Saem das demandas e vão pra agenda. Se passar a data sem concluir, a Bianca devolve pras demandas.</p>
        <div className="grid grid-cols-2 gap-2">
          <label className="block"><span className="block text-[11px] font-bold text-white/60 mb-1">Data</span>
            <input type="date" min={hojeBR()} value={data} onChange={(e) => setData(e.target.value)} className={inputCls} /></label>
          <label className="block"><span className="block text-[11px] font-bold text-white/60 mb-1">Começar às</span>
            <input type="time" value={hora} onChange={(e) => setHora(e.target.value)} className={inputCls} /></label>
        </div>
        {ehAdmin && equipe.length > 0 && (
          <label className="block"><span className="block text-[11px] font-bold text-white/60 mb-1">Profissional</span>
            <select value={resp} onChange={(e) => setResp(e.target.value)} className={inputCls}>
              {equipe.map((p) => <option key={p.id} value={p.id} className="bg-noite">{p.nome}</option>)}
            </select></label>
        )}
        {erro && <p className="text-xs text-coral">⚠ {erro}</p>}
        <div className="flex justify-end gap-2 pt-1">
          <button onClick={onFechar} className="px-4 py-2 bg-white/5 border border-white/10 text-white/70 text-sm rounded-lg">Cancelar</button>
          <button disabled={salvando} onClick={async () => {
            setSalvando(true); setErro(null)
            const e = await onConfirmar(data, hora, ehAdmin ? resp : null)
            if (e) setErro(e)
            setSalvando(false)
          }} className="px-4 py-2 bg-sol text-noite font-bold text-sm rounded-lg disabled:opacity-50">
            {salvando ? 'Agendando…' : 'Agendar'}
          </button>
        </div>
      </div>
    </div>
  )
}

function ModalNovaDemanda({ onFechar, onSalva }: { onFechar: () => void; onSalva: () => void }) {
  const [tipo, setTipo] = useState('')
  const [cliente, setCliente] = useState('')
  const [contatoNome, setContatoNome] = useState('')
  const [telefone, setTelefone] = useState('')
  const [end, setEnd] = useState<EnderecoCampo>({ cep: '', logradouro: '', numero: '', complemento: '', bairro: '', cidade: '', uf: 'SC' })
  const [descricao, setDescricao] = useState('')
  const [erro, setErro] = useState<string | null>(null)
  const [salvando, setSalvando] = useState(false)
  const campo = (k: keyof EnderecoCampo) => (e: React.ChangeEvent<HTMLInputElement>) => setEnd((x) => ({ ...x, [k]: e.target.value }))

  async function buscarCep(cep: string) {
    const d = cep.replace(/\D/g, '')
    if (d.length !== 8) return
    try {
      const r = await fetch(`https://viacep.com.br/ws/${d}/json/`)
      const j = await r.json()
      if (j?.erro) return
      setEnd((x) => ({ ...x, logradouro: x.logradouro || j.logradouro || '', bairro: x.bairro || j.bairro || '', cidade: j.localidade || x.cidade, uf: j.uf || x.uf }))
    } catch {}
  }

  async function salvar() {
    setSalvando(true); setErro(null)
    try {
      const r = await criarDemandaAction({ tipo_servico: tipo, cliente_nome: cliente, contato_nome: contatoNome, contato_telefone: telefone, endereco: end, descricao })
      if ('erro' in r) { setErro(r.erro); return }
      onSalva()
    } finally { setSalvando(false) }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/70 flex items-start sm:items-center justify-center p-3 overflow-y-auto" onClick={onFechar}>
      <div className="w-full max-w-lg bg-noite border border-white/15 rounded-xl p-5 space-y-3 my-4" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-base font-bold text-white">➕ Nova demanda de serviço</h2>
        <label className="block"><span className="block text-[11px] font-bold text-white/60 mb-1">Tipo de serviço *</span>
          <select value={tipo} onChange={(e) => setTipo(e.target.value)} className={inputCls}>
            <option value="" className="bg-noite">Escolha…</option>
            {TIPOS_SERVICO_CAMPO.map((t) => <option key={t.valor} value={t.valor} className="bg-noite">{t.rotulo}</option>)}
          </select></label>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <label className="block sm:col-span-2"><span className="block text-[11px] font-bold text-white/60 mb-1">Cliente *</span>
            <input value={cliente} onChange={(e) => setCliente(e.target.value)} className={inputCls} placeholder="Nome do cliente" /></label>
          <label className="block"><span className="block text-[11px] font-bold text-white/60 mb-1">Contato no local</span>
            <input value={contatoNome} onChange={(e) => setContatoNome(e.target.value)} className={inputCls} placeholder="Quem recebe" /></label>
          <label className="block"><span className="block text-[11px] font-bold text-white/60 mb-1">Telefone *</span>
            <input value={telefone} onChange={(e) => setTelefone(e.target.value)} className={inputCls} placeholder="(48) 99999-9999" inputMode="tel" /></label>
          <label className="block"><span className="block text-[11px] font-bold text-white/60 mb-1">CEP</span>
            <input value={end.cep || ''} onChange={campo('cep')} onBlur={(e) => buscarCep(e.target.value)} className={inputCls} placeholder="88200-000" inputMode="numeric" /></label>
          <label className="block"><span className="block text-[11px] font-bold text-white/60 mb-1">Cidade *</span>
            <input value={end.cidade || ''} onChange={campo('cidade')} className={inputCls} /></label>
          <label className="block sm:col-span-2"><span className="block text-[11px] font-bold text-white/60 mb-1">Rua</span>
            <input value={end.logradouro || ''} onChange={campo('logradouro')} className={inputCls} /></label>
          <label className="block"><span className="block text-[11px] font-bold text-white/60 mb-1">Número</span>
            <input value={end.numero || ''} onChange={campo('numero')} className={inputCls} /></label>
          <label className="block"><span className="block text-[11px] font-bold text-white/60 mb-1">Bairro</span>
            <input value={end.bairro || ''} onChange={campo('bairro')} className={inputCls} /></label>
          <label className="block sm:col-span-2"><span className="block text-[11px] font-bold text-white/60 mb-1">Complemento / referência</span>
            <input value={end.complemento || ''} onChange={campo('complemento')} className={inputCls} /></label>
          <label className="block sm:col-span-2"><span className="block text-[11px] font-bold text-white/60 mb-1">O que precisa ser feito</span>
            <textarea value={descricao} onChange={(e) => setDescricao(e.target.value)} rows={3} className={`${inputCls} resize-none`} /></label>
        </div>
        {erro && <p className="text-xs text-coral">⚠ {erro}</p>}
        <div className="flex justify-end gap-2">
          <button onClick={onFechar} className="px-4 py-2 bg-white/5 border border-white/10 text-white/70 text-sm rounded-lg">Cancelar</button>
          <button onClick={salvar} disabled={salvando} className="px-4 py-2 bg-sol text-noite font-bold text-sm rounded-lg disabled:opacity-50">
            {salvando ? 'Salvando…' : 'Cadastrar demanda'}
          </button>
        </div>
      </div>
    </div>
  )
}
