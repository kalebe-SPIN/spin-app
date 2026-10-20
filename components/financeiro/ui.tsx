'use client'

import { useEffect, useRef, useState, type ReactNode } from 'react'

/** Peças de formulário do financeiro (mesmo visual dos modais do portal). */

export const classeInput =
  'w-full px-3 py-2 bg-white/5 border border-white/15 rounded-md text-sm text-white focus:outline-none focus:border-sol placeholder-white/30'

export function Campo({ rotulo, dica, children, className = '' }: { rotulo: string; dica?: string; children: ReactNode; className?: string }) {
  return (
    <label className={`block ${className}`}>
      <span className="block text-[11px] uppercase font-bold text-white/60 tracking-wider mb-1">{rotulo}</span>
      {children}
      {dica && <span className="block text-[10px] text-white/40 mt-1">{dica}</span>}
    </label>
  )
}

/** Valor em R$ digitado no padrão brasileiro (1.234,56). */
export function InputValor({ valor, onChange, placeholder = '0,00', autoFocus }: {
  valor: string; onChange: (v: string) => void; placeholder?: string; autoFocus?: boolean
}) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-white/40 text-sm">R$</span>
      <input
        type="text" inputMode="decimal" value={valor} autoFocus={autoFocus} placeholder={placeholder}
        onChange={(e) => onChange(e.target.value.replace(/[^\d.,]/g, ''))}
        className={`${classeInput} font-mono`}
      />
    </div>
  )
}

export function Selecao({ valor, onChange, opcoes, vazio }: {
  valor: string; onChange: (v: string) => void; opcoes: Array<{ valor: string; rotulo: string }>; vazio?: string
}) {
  return (
    <select value={valor} onChange={(e) => onChange(e.target.value)} className={classeInput}>
      {vazio !== undefined && <option value="" className="bg-noite">{vazio}</option>}
      {opcoes.map((o) => <option key={o.valor} value={o.valor} className="bg-noite">{o.rotulo}</option>)}
    </select>
  )
}

const semAcento = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
const MAX_RESULTADOS = 50

/**
 * Lista longa com busca (Kalebe 2026-10-20: "preciso de um filtro pra achar
 * mais fácil um projeto"): digita parte do código ou do nome — vale qualquer
 * pedaço, sem acento e em qualquer ordem ("0126", "reichert vanildo").
 * Setas + Enter escolhem; Esc fecha; ✕ limpa.
 */
export function SelecaoComBusca({ valor, onChange, opcoes, vazio, placeholder = 'Digite pra buscar…' }: {
  valor: string; onChange: (v: string) => void; opcoes: Array<{ valor: string; rotulo: string }>; vazio?: string; placeholder?: string
}) {
  const [aberto, setAberto] = useState(false)
  const [busca, setBusca] = useState('')
  const [ativo, setAtivo] = useState(0)
  const caixaRef = useRef<HTMLDivElement>(null)
  const selecionada = opcoes.find((o) => o.valor === valor) || null

  // Clique fora fecha
  useEffect(() => {
    if (!aberto) return
    const fora = (e: MouseEvent) => { if (caixaRef.current && !caixaRef.current.contains(e.target as Node)) { setAberto(false); setBusca('') } }
    document.addEventListener('mousedown', fora)
    return () => document.removeEventListener('mousedown', fora)
  }, [aberto])

  const termos = semAcento(busca).split(/\s+/).filter(Boolean)
  const filtradas = termos.length ? opcoes.filter((o) => { const r = semAcento(o.rotulo); return termos.every((t) => r.includes(t)) }) : opcoes
  const lista = filtradas.slice(0, MAX_RESULTADOS)
  const comVazio = vazio !== undefined && !termos.length
  const itens: Array<{ valor: string; rotulo: string }> = [...(comVazio ? [{ valor: '', rotulo: vazio! }] : []), ...lista]

  function escolher(v: string) { onChange(v); setBusca(''); setAberto(false) }
  function teclas(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'ArrowDown') { e.preventDefault(); setAberto(true); setAtivo((i) => Math.min(i + 1, itens.length - 1)) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setAtivo((i) => Math.max(i - 1, 0)) }
    else if (e.key === 'Enter') { if (aberto && itens[ativo]) { e.preventDefault(); escolher(itens[ativo].valor) } }
    else if (e.key === 'Escape') { setAberto(false); setBusca('') }
  }

  return (
    <div ref={caixaRef} className="relative">
      <div className="relative">
        <input
          className={`${classeInput} pr-8`}
          value={aberto ? busca : selecionada?.rotulo || ''}
          placeholder={selecionada ? selecionada.rotulo : placeholder}
          onFocus={() => { setAberto(true); setBusca(''); setAtivo(0) }}
          onChange={(e) => { setBusca(e.target.value); setAberto(true); setAtivo(0) }}
          onKeyDown={teclas}
          role="combobox" aria-expanded={aberto} aria-autocomplete="list" autoComplete="off"
        />
        {valor ? (
          <button type="button" onClick={() => escolher('')} aria-label="Limpar"
            className="absolute right-2 top-1/2 -translate-y-1/2 text-white/50 hover:text-white text-xs">✕</button>
        ) : (
          <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-white/40 text-xs pointer-events-none">🔍</span>
        )}
      </div>
      {aberto && (
        <ul role="listbox" className="absolute z-30 mt-1 w-full max-h-64 overflow-y-auto rounded-md border border-white/15 bg-noite shadow-2xl py-1">
          {itens.map((o, i) => (
            <li key={o.valor || '__vazio'}>
              <button type="button" role="option" aria-selected={o.valor === valor}
                onMouseDown={(e) => e.preventDefault()} onClick={() => escolher(o.valor)} onMouseEnter={() => setAtivo(i)}
                className={`w-full text-start px-3 py-2 text-sm ${i === ativo ? 'bg-white/10' : ''} ${o.valor === valor ? 'font-bold text-white' : 'text-white/80'}`}>
                {o.rotulo}
              </button>
            </li>
          ))}
          {!itens.length && <li className="px-3 py-2 text-xs text-white/50">Nada encontrado com “{busca}”</li>}
          {filtradas.length > MAX_RESULTADOS && (
            <li className="px-3 py-1.5 text-[10px] text-white/40">Mostrando {MAX_RESULTADOS} de {filtradas.length} — digite mais pra afinar</li>
          )}
        </ul>
      )}
    </div>
  )
}

export function Modal({ titulo, subtitulo, onFechar, children, largura = 'max-w-2xl' }: {
  titulo: string; subtitulo?: string; onFechar: () => void; children: ReactNode; largura?: string
}) {
  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-start sm:items-center justify-center p-3 sm:p-4 overflow-y-auto" onClick={onFechar}>
      <div className={`bg-noite border border-white/15 rounded-xl w-full ${largura} p-5 sm:p-6 space-y-4 my-4 shadow-2xl`} onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-black text-white">{titulo}</h2>
            {subtitulo && <p className="text-xs text-white/55 mt-0.5">{subtitulo}</p>}
          </div>
          <button onClick={onFechar} className="text-white/40 hover:text-white text-lg leading-none">✕</button>
        </div>
        {children}
      </div>
    </div>
  )
}

export function Aviso({ tipo, children }: { tipo: 'erro' | 'ok' | 'info'; children: ReactNode }) {
  const cor = tipo === 'erro' ? 'bg-coral/10 border-coral/30 text-coral'
    : tipo === 'ok' ? 'bg-verde/10 border-verde/30 text-verde'
    : 'bg-sol/10 border-sol/30 text-sol'
  return <div className={`p-2.5 rounded border text-xs ${cor}`}>{children}</div>
}

export function Botoes({ onCancelar, onConfirmar, rotulo, processando, desabilitado }: {
  onCancelar: () => void; onConfirmar: () => void; rotulo: string; processando?: boolean; desabilitado?: boolean
}) {
  return (
    <div className="flex gap-2 pt-1">
      <button type="button" onClick={onCancelar} disabled={processando}
        className="flex-1 py-2.5 bg-white/5 border border-white/15 text-white/80 text-sm rounded-lg hover:bg-white/10 disabled:opacity-40">
        Cancelar
      </button>
      <button type="button" onClick={onConfirmar} disabled={processando || desabilitado}
        className="flex-1 py-2.5 bg-sol text-noite font-bold text-sm rounded-lg hover:bg-sol/90 disabled:opacity-40">
        {processando ? 'Salvando…' : rotulo}
      </button>
    </div>
  )
}
