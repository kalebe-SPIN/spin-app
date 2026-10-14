'use client'

import { useEffect, useState } from 'react'
import {
  painelPrecificacaoAction, salvarParametroPainelAction, salvarCampoServicoPainelAction,
  salvarVariavelAction, excluirVariavelAction, salvarFaixaPainelAction, excluirFaixaPainelAction,
  type ItemPainel, type ParametroPainel, type ServicoPainel,
} from '@/app/precificacao/painel-actions'
import { CONTEXTOS_PAINEL, MODOS_VARIAVEL, type ContextoPainel } from '@/lib/precificacao/painel'
import type { FaixaSecao, ModoVariavel, VariavelPreco } from '@/lib/propostas/secoes'
import { CampoNumero, inputCls } from '@/components/propostas/CampoNumero'

/**
 * Painel de precificação dentro da proposta (Kalebe 2026-10-14) — só admin.
 * Edita a precificação existente (mesmas tabelas do /admin/precificacao,
 * vale pro sistema todo) e estrutura as variáveis de cada item: rótulo,
 * grandeza/unidade, modo de cobrança e faixas de valor (adicionar, editar,
 * excluir).
 */

type Aba = 'parametros' | 'servicos' | 'itens'
const mini = 'bg-white/5 border border-white/10 rounded-lg px-2 py-1.5 text-white text-xs w-full focus:outline-none focus:border-sol/50'

function LinhaParametro({ p, motivo, onSalvo, def }: { p: ParametroPainel; motivo: string; onSalvo: () => void; def?: { grupo?: string; padrao?: number; unidade?: string } }) {
  const [valor, setValor] = useState<number>(p.valor ?? def?.padrao ?? 0)
  const [estado, setEstado] = useState<string | null>(null)
  const mudou = p.existe ? valor !== p.valor : true
  async function salvar() {
    setEstado('salvando…')
    const r = await salvarParametroPainelAction(p.chave, valor, motivo, p.existe ? undefined : { grupo: def?.grupo || 'geral', descricao: p.rotulo, unidade: def?.unidade || p.unidade || '' })
    setEstado('erro' in r ? `⚠ ${r.erro}` : '✓ salvo')
    if (!('erro' in r)) onSalvo()
  }
  return (
    <div className="grid grid-cols-[1fr_110px_auto] gap-2 items-center py-1 border-b border-white/5">
      <div className="min-w-0">
        <p className="text-[12px] text-white truncate">{p.rotulo} <span className="text-white/40">{p.unidade ? `(${p.unidade})` : ''}</span></p>
        <p className="text-[10px] text-white/40 truncate">{p.existe ? p.chave : `não cadastrado — usando ${def?.padrao ?? '—'}`}{estado ? ` · ${estado}` : ''}</p>
      </div>
      <CampoNumero valor={valor} onChange={setValor} casas={4} className={mini} />
      <button type="button" onClick={salvar} disabled={!mudou || motivo.trim().length < 10}
        className="px-3 py-1.5 rounded-lg bg-verde text-white text-[11px] font-bold disabled:opacity-30">{p.existe ? 'Salvar' : 'Criar'}</button>
    </div>
  )
}

function CamposServico({ s, onSalvo }: { s: ServicoPainel; onSalvo: () => void }) {
  const folhas: Array<{ caminho: string[]; valor: number }> = []
  const varrer = (o: any, cam: string[]) => {
    for (const [k, v] of Object.entries(o || {})) {
      if (typeof v === 'number') folhas.push({ caminho: [...cam, k], valor: v })
      else if (v && typeof v === 'object' && !Array.isArray(v)) varrer(v, [...cam, k])
    }
  }
  varrer(s.parametros, [])
  return (
    <details className="rounded-xl border border-white/10 px-3 py-2">
      <summary className="text-[12px] font-bold text-white cursor-pointer">{s.nome}</summary>
      <div className="mt-2">{folhas.map((f) => <CampoServico key={f.caminho.join('.')} chave={s.chave} caminho={f.caminho} inicial={f.valor} onSalvo={onSalvo} />)}</div>
    </details>
  )
}
function CampoServico({ chave, caminho, inicial, onSalvo }: { chave: string; caminho: string[]; inicial: number; onSalvo: () => void }) {
  const [valor, setValor] = useState(inicial)
  const [estado, setEstado] = useState<string | null>(null)
  async function salvar() {
    setEstado('…')
    const r = await salvarCampoServicoPainelAction(chave, caminho, valor)
    setEstado('erro' in r ? `⚠ ${r.erro}` : '✓')
    if (!('erro' in r)) onSalvo()
  }
  return (
    <div className="grid grid-cols-[1fr_100px_auto] gap-2 items-center py-0.5">
      <span className="text-[11px] text-white/70 truncate">{caminho.join(' › ').replace(/_/g, ' ')}{estado ? ` ${estado}` : ''}</span>
      <CampoNumero valor={valor} onChange={setValor} casas={4} className={mini} />
      <button type="button" onClick={salvar} disabled={valor === inicial} className="px-2 py-1 rounded-lg bg-verde text-white text-[10px] font-bold disabled:opacity-30">Salvar</button>
    </div>
  )
}

function LinhaFaixa({ f, chave_servico, variavel, unidade, onSalvo }: { f: Partial<FaixaSecao>; chave_servico: string; variavel: string | null; unidade: string; onSalvo: () => void }) {
  const [x, setX] = useState({ faixa_min: f.faixa_min ?? 0, faixa_max: f.faixa_max ?? null as number | null, valor: f.valor ?? 0, descricao: f.descricao || '', ordem: f.ordem ?? 0 })
  const [estado, setEstado] = useState<string | null>(null)
  async function salvar() {
    setEstado('…')
    const r = await salvarFaixaPainelAction({ id: f.id, chave_servico, variavel, unidade, ...x, faixa_max: x.faixa_max })
    setEstado('erro' in r ? `⚠ ${r.erro}` : '✓')
    if (!('erro' in r)) onSalvo()
  }
  async function excluir() {
    if (!f.id) { onSalvo(); return }
    if (!confirm('Excluir esta faixa?')) return
    const r = await excluirFaixaPainelAction(f.id)
    if ('erro' in r) setEstado(`⚠ ${r.erro}`); else onSalvo()
  }
  return (
    <div className="grid grid-cols-[64px_64px_90px_1fr_auto_auto] gap-1.5 items-center">
      <CampoNumero valor={x.faixa_min} onChange={(n) => setX({ ...x, faixa_min: n })} casas={2} className={mini} aria-label="De" />
      <CampoNumero valor={x.faixa_max ?? 0} onChange={(n) => setX({ ...x, faixa_max: n || null })} casas={2} className={mini} placeholder="∞" aria-label="Até" />
      <CampoNumero valor={x.valor} onChange={(n) => setX({ ...x, valor: n })} casas={2} className={mini} aria-label="Valor" />
      <input value={x.descricao} onChange={(e) => setX({ ...x, descricao: e.target.value })} className={mini} placeholder="Descrição / item" />
      <button type="button" onClick={salvar} className="px-2 py-1 rounded-lg bg-verde text-white text-[10px] font-bold" title={estado || ''}>{estado === '✓' ? '✓' : 'Salvar'}</button>
      <button type="button" onClick={excluir} aria-label="Excluir faixa" className="w-6 h-6 rounded-full bg-white/[0.06] text-white/60 hover:text-white">✕</button>
      {estado && estado.startsWith('⚠') && <p className="col-span-6 text-[10px] text-coral">{estado}</p>}
    </div>
  )
}

function CartaoVariavel({ v, chave_servico, faixas, onSalvo }: { v: Partial<VariavelPreco> & { faixas?: FaixaSecao[] }; chave_servico: string; faixas: FaixaSecao[]; onSalvo: () => void }) {
  const [x, setX] = useState({ rotulo: v.rotulo || '', unidade: v.unidade || '', modo: (v.modo || 'por_unidade') as ModoVariavel, ordem: v.ordem ?? 0 })
  const [novas, setNovas] = useState(0)
  const [estado, setEstado] = useState<string | null>(null)
  async function salvar() {
    setEstado('…')
    const r = await salvarVariavelAction({ id: v.id, chave_servico, ...x })
    setEstado('erro' in r ? `⚠ ${r.erro}` : '✓ salvo')
    if (!('erro' in r)) onSalvo()
  }
  async function excluir() {
    if (!v.id) { onSalvo(); return }
    if (!confirm(`Excluir a variável "${x.rotulo}" e as faixas dela?`)) return
    const r = await excluirVariavelAction(v.id)
    if ('erro' in r) setEstado(`⚠ ${r.erro}`); else onSalvo()
  }
  return (
    <div className="rounded-xl border border-white/10 p-2.5 space-y-2">
      <div className="grid grid-cols-2 sm:grid-cols-[1.4fr_0.8fr_1.2fr_56px] gap-1.5">
        <input value={x.rotulo} onChange={(e) => setX({ ...x, rotulo: e.target.value })} className={mini} placeholder="Variável (ex.: Área)" />
        <input value={x.unidade} onChange={(e) => setX({ ...x, unidade: e.target.value })} className={mini} placeholder="Unidade (m², h, dia…)" />
        <select value={x.modo} onChange={(e) => setX({ ...x, modo: e.target.value as ModoVariavel })} className={mini}>
          {MODOS_VARIAVEL.map((m) => <option key={m.valor} value={m.valor} className="bg-noite">{m.rotulo}</option>)}
        </select>
        <CampoNumero valor={x.ordem} onChange={(n) => setX({ ...x, ordem: Math.round(n) })} className={mini} aria-label="Ordem" />
      </div>
      <p className="text-[10px] text-white/40">{MODOS_VARIAVEL.find((m) => m.valor === x.modo)?.ajuda}{estado ? ` · ${estado}` : ''}</p>
      <div className="flex gap-2">
        <button type="button" onClick={salvar} className="px-3 py-1.5 rounded-lg bg-verde text-white text-[11px] font-bold">{v.id ? 'Salvar variável' : 'Criar variável'}</button>
        {v.id && <button type="button" onClick={excluir} className="px-3 py-1.5 rounded-lg border border-coral/50 text-white/80 text-[11px] font-bold">Excluir</button>}
      </div>
      {v.id && v.chave && (
        <div className="space-y-1">
          <p className="text-[10px] text-white/50">Faixas — de · até · valor (R$) · descrição/item</p>
          {faixas.map((f) => <LinhaFaixa key={f.id} f={f} chave_servico={chave_servico} variavel={v.chave!} unidade={x.unidade} onSalvo={onSalvo} />)}
          {Array.from({ length: novas }).map((_, i) => (
            <LinhaFaixa key={`nova-${i}`} f={{ faixa_min: 0, faixa_max: null, valor: 0, ordem: faixas.length + i + 1 }} chave_servico={chave_servico} variavel={v.chave!} unidade={x.unidade}
              onSalvo={() => { setNovas((n) => Math.max(0, n - 1)); onSalvo() }} />
          ))}
          <button type="button" onClick={() => setNovas((n) => n + 1)} className="text-[11px] font-bold text-white/70 hover:text-white">＋ Faixa</button>
        </div>
      )}
    </div>
  )
}

export function PainelPrecificacao({ contexto, onFechar, onAlterado }: { contexto: ContextoPainel; onFechar: () => void; onAlterado?: () => void }) {
  const ctx = CONTEXTOS_PAINEL[contexto]
  const [aba, setAba] = useState<Aba>('parametros')
  const [dados, setDados] = useState<Exclude<Awaited<ReturnType<typeof painelPrecificacaoAction>>, { erro: string }> | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [motivo, setMotivo] = useState('')
  const [item, setItem] = useState(ctx.itens[0]?.chave || '')
  const [novaVar, setNovaVar] = useState(false)
  const [alterou, setAlterou] = useState(false)

  async function carregar() {
    const r = await painelPrecificacaoAction(contexto)
    if ('erro' in r) setErro(r.erro); else { setErro(null); setDados(r) }
  }
  useEffect(() => { carregar() // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contexto])
  const salvo = () => { setAlterou(true); setNovaVar(false); carregar() }
  const fechar = () => { if (alterou) onAlterado?.(); onFechar() }
  const itemSel: ItemPainel | undefined = dados?.itens.find((i) => i.chave_servico === item)

  return (
    <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center sm:p-4" onClick={(e) => { e.stopPropagation(); fechar() }}>
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />
      <div className="relative w-full sm:max-w-3xl max-h-[92vh] overflow-y-auto rounded-t-3xl sm:rounded-3xl border border-sol/40 bg-noite/95 shadow-2xl p-5 space-y-4" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-black text-white">⚙️ Precificação · {ctx.titulo}</h2>
            <p className="text-[11px] text-white/50">Muda em todo o sistema — propostas, telas do projeto e /admin/precificacao.</p>
          </div>
          <button onClick={fechar} aria-label="Fechar" className="w-8 h-8 rounded-full bg-white/[0.06] text-white/70 hover:text-white flex items-center justify-center shrink-0">✕</button>
        </div>
        <div className={`grid gap-1 p-1 rounded-xl bg-white/[0.04] border border-white/10 ${ctx.servicos.length ? 'grid-cols-3' : 'grid-cols-2'}`}>
          {([['parametros', 'Parâmetros'], ...(ctx.servicos.length ? [['servicos', 'Serviços']] : []), ['itens', 'Itens e variáveis']] as Array<[Aba, string]>).map(([k, l]) => (
            <button key={k} type="button" onClick={() => setAba(k)} className={`py-2 rounded-lg text-xs font-bold ${aba === k ? 'bg-weg-azul text-white' : 'text-white/60 hover:text-white'}`}>{l}</button>
          ))}
        </div>
        {erro && <p className="text-xs text-coral border border-coral/40 rounded-xl p-2">⚠ {erro}</p>}
        {!dados ? <p className="text-sm text-white/50">Carregando…</p> : (
          <>
            {aba === 'parametros' && (
              <div className="space-y-2">
                <label className="block">
                  <span className="block text-[11px] font-bold text-white/60 mb-1">Motivo da alteração (fica no histórico)</span>
                  <input value={motivo} onChange={(e) => setMotivo(e.target.value)} className={inputCls} placeholder="Ex.: reajuste da diária do eletricista em outubro" />
                </label>
                {dados.parametros.map((p) => <LinhaParametro key={p.chave} p={p} motivo={motivo} onSalvo={salvo} def={ctx.parametros.find((d) => d.chave === p.chave)} />)}
              </div>
            )}
            {aba === 'servicos' && (
              <div className="space-y-2">
                {dados.servicos.length === 0 && <p className="text-[12px] text-white/50">Parâmetros dos serviços não encontrados.</p>}
                {dados.servicos.map((s) => <CamposServico key={s.chave} s={s} onSalvo={salvo} />)}
              </div>
            )}
            {aba === 'itens' && (
              <div className="space-y-2">
                {dados.sem_migracao && <p className="text-[11px] text-white/75 border border-coral/45 rounded-xl p-2">⚠ Falta rodar a migration 156 pra estruturar variáveis. As faixas abaixo seguem editáveis.</p>}
                <select value={item} onChange={(e) => { setItem(e.target.value); setNovaVar(false) }} className={inputCls}>
                  {ctx.itens.map((i) => <option key={i.chave} value={i.chave} className="bg-noite">{i.rotulo}</option>)}
                </select>
                {itemSel && (
                  <div className="space-y-2">
                    {itemSel.variaveis.map((v) => (
                      <CartaoVariavel key={v.id} v={v} chave_servico={itemSel.chave_servico} faixas={v.faixas} onSalvo={salvo} />
                    ))}
                    {itemSel.faixas_soltas.length > 0 && (
                      <div className="rounded-xl border border-white/10 p-2.5 space-y-1">
                        <p className="text-[10px] text-white/50">Faixas (sem variável estruturada)</p>
                        {itemSel.faixas_soltas.map((f) => <LinhaFaixa key={f.id} f={f} chave_servico={itemSel.chave_servico} variavel={null} unidade="unidade" onSalvo={salvo} />)}
                      </div>
                    )}
                    {novaVar
                      ? <CartaoVariavel v={{ ordem: itemSel.variaveis.length }} chave_servico={itemSel.chave_servico} faixas={[]} onSalvo={salvo} />
                      : <button type="button" onClick={() => setNovaVar(true)} disabled={dados.sem_migracao}
                          className="px-3 py-2 rounded-xl bg-weg-azul text-white text-xs font-bold disabled:opacity-40">＋ Nova variável</button>}
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
