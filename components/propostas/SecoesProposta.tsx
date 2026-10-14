'use client'

import { useEffect, useState } from 'react'
import { formatarMoedaBRL } from '@/lib/formatters'
import {
  CONFIG_SECAO, TIPOS_SECAO, itensDeAluguel, valorSugerido, totalSecoes, variaveisDoTipo, entradaDaVariavel, rotuloSecao,
  type FaixaSecao, type SecaoProposta, type TipoSecao, type VariavelPreco,
} from '@/lib/propostas/secoes'
import { variaveisSecoesAction } from '@/app/precificacao/painel-actions'
import { CampoNumero, inputCls } from './CampoNumero'

/**
 * Seções incorporadas à proposta (Kalebe 2026-10-13): aluguel, alvenaria,
 * elétrica predial, padrão de entrada… Valor ao cliente sugerido pela tabela
 * de faixas e editável; enquanto não for editado à mão, acompanha a sugestão.
 * Kalebe 2026-10-14: os campos de cada item vêm das variáveis que o admin
 * estrutura no painel de precificação (grandeza, unidade, modo, faixas).
 * `versao` muda quando o admin salva algo no painel → recarrega.
 */
export function SecoesProposta({ faixas: faixasProp, secoes, onChange, versao = 0 }: {
  faixas: FaixaSecao[]
  secoes: SecaoProposta[]
  onChange: (s: SecaoProposta[]) => void
  versao?: number
}) {
  const [novoTipo, setNovoTipo] = useState('')
  const [variaveis, setVariaveis] = useState<VariavelPreco[]>([])
  const [faixasDin, setFaixasDin] = useState<FaixaSecao[] | null>(null)
  useEffect(() => {
    variaveisSecoesAction().then((r) => { if (!('erro' in r)) { setVariaveis(r.variaveis); setFaixasDin(r.faixas) } })
  }, [versao])
  const faixas = faixasDin || faixasProp

  function comResumo(s: SecaoProposta): SecaoProposta {
    return variaveisDoTipo(variaveis, s.tipo).length ? { ...s, resumo: rotuloSecao(s, variaveis).detalhe } : s
  }
  function adicionar() {
    if (!novoTipo) return
    onChange([...secoes, { tipo: novoTipo as TipoSecao, descricao: '', qtd: 0, item: null, valor: 0 }])
    setNovoTipo('')
  }
  function mudar(i: number, patch: Partial<SecaoProposta>) {
    const antiga = secoes[i]
    let nova: SecaoProposta = { ...antiga, ...patch }
    // Quantidade/item mudou e o valor ainda é o sugerido (ou zero): acompanha a tabela
    if (('qtd' in patch || 'item' in patch || 'valores' in patch) && !('valor' in patch)) {
      const sugAntiga = valorSugerido(faixas, antiga, variaveis)?.valor ?? 0
      const sugNova = valorSugerido(faixas, nova, variaveis)
      if (sugNova && (antiga.valor === 0 || Math.abs(antiga.valor - sugAntiga) < 0.005)) nova.valor = Math.round(sugNova.valor * 100) / 100
    }
    nova = comResumo(nova)
    onChange(secoes.map((s, j) => (j === i ? nova : s)))
  }
  function mudarVariavel(i: number, v: VariavelPreco, principal: boolean, patch: { qtd?: number; item?: string | null }) {
    const s = secoes[i]
    const atual = entradaDaVariavel(s, v, principal)
    const valores = { ...(s.valores || {}), [v.chave]: { ...atual, ...patch } }
    // A principal também fica em qtd/item (compatibilidade com o que já existe)
    mudar(i, { valores, ...(principal ? { qtd: valores[v.chave].qtd, item: valores[v.chave].item ?? null } : {}) })
  }

  return (
    <div className="space-y-2">
      {secoes.map((s, i) => {
        const cfg = CONFIG_SECAO[s.tipo]
        const info = TIPOS_SECAO.find((t) => t.tipo === s.tipo)
        const vs = variaveisDoTipo(variaveis, s.tipo)
        const sug = valorSugerido(faixas, s, variaveis)
        const itens = itensDeAluguel(faixas, s.tipo)
        return (
          <div key={i} className="rounded-xl border border-white/10 p-2 space-y-2">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[13px] font-bold text-white">{info?.emoji} {info?.rotulo}</span>
              <button type="button" onClick={() => onChange(secoes.filter((_, j) => j !== i))} aria-label="Tirar seção"
                className="w-6 h-6 rounded-full bg-white/[0.06] text-white/60 hover:text-white shrink-0">✕</button>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {vs.length > 0 ? vs.map((v, n) => {
                const e = entradaDaVariavel(s, v, n === 0)
                if (v.modo === 'fixo') return <p key={v.chave} className="text-[11px] text-white/55 self-end">{v.rotulo}: valor fixo</p>
                if (v.modo === 'por_item') {
                  const opcoes = faixas.filter((f) => f.chave_servico === v.chave_servico && (f.variavel === v.chave || (n === 0 && !f.variavel)) && f.descricao)
                    .sort((a, b) => String(a.descricao).localeCompare(String(b.descricao), 'pt-BR'))
                  return (
                    <div key={v.chave} className="contents">
                      <label className="block col-span-2 sm:col-span-1"><span className="block text-[10px] text-white/50">{v.rotulo}</span>
                        <select value={e.item || ''} onChange={(x) => mudarVariavel(i, v, n === 0, { item: x.target.value || null })} className={inputCls}>
                          <option value="" className="bg-noite">Escolha…</option>
                          {opcoes.map((o) => <option key={o.id || o.descricao} value={o.descricao!} className="bg-noite">{o.descricao} · {formatarMoedaBRL(o.valor)}{v.unidade ? `/${v.unidade}` : ''}</option>)}
                        </select></label>
                      <label className="block"><span className="block text-[10px] text-white/50">Quantidade{v.unidade ? ` (${v.unidade})` : ''}</span>
                        <CampoNumero valor={e.qtd} onChange={(q) => mudarVariavel(i, v, n === 0, { qtd: q })} casas={1} placeholder="1" /></label>
                    </div>
                  )
                }
                return (
                  <label key={v.chave} className="block"><span className="block text-[10px] text-white/50">{v.rotulo}{v.unidade ? ` (${v.unidade})` : ''}</span>
                    <CampoNumero valor={e.qtd} onChange={(q) => mudarVariavel(i, v, n === 0, { qtd: q })} casas={1} /></label>
                )
              }) : (
                <>
                  {cfg.modo === 'diaria' && (
                    <label className="block col-span-2 sm:col-span-1"><span className="block text-[10px] text-white/50">Item</span>
                      <select value={s.item || ''} onChange={(e) => mudar(i, { item: e.target.value || null })} className={inputCls}>
                        <option value="" className="bg-noite">Escolha…</option>
                        {itens.map((x) => <option key={x.item} value={x.item} className="bg-noite">{x.item} · {formatarMoedaBRL(x.diaria)}/dia</option>)}
                      </select></label>
                  )}
                  {cfg.modo !== 'manual' && (
                    <label className="block"><span className="block text-[10px] text-white/50">{cfg.rotuloQtd}</span>
                      <CampoNumero valor={s.qtd} onChange={(n) => mudar(i, { qtd: n })} casas={1} /></label>
                  )}
                </>
              )}
              <label className="block"><span className="block text-[10px] text-white/50">Valor ao cliente (R$)</span>
                <CampoNumero valor={s.valor} onChange={(n) => mudar(i, { valor: n })} casas={2}
                  className={`${inputCls} ${s.valor > 0 ? '' : 'border-coral/60'}`} /></label>
            </div>
            <input value={s.descricao} onChange={(e) => mudar(i, { descricao: e.target.value })}
              placeholder="Escopo que vai pro cliente (ex.: base de concreto pro totem)" className={inputCls} />
            {sug && (
              <p className="text-[10px] text-white/45">
                Tabela de faixas: {sug.referencia} = {formatarMoedaBRL(sug.valor)}
                {Math.abs(sug.valor - s.valor) >= 0.005 && (
                  <button type="button" onClick={() => mudar(i, { valor: Math.round(sug.valor * 100) / 100 })} className="ml-2 underline text-white/70 hover:text-white">usar</button>
                )}
              </p>
            )}
          </div>
        )
      })}
      <div className="grid grid-cols-[1fr_auto] gap-2">
        <select value={novoTipo} onChange={(e) => setNovoTipo(e.target.value)} className={inputCls}>
          <option value="" className="bg-noite">Adicionar seção (aluguel, alvenaria, elétrica…)</option>
          {TIPOS_SECAO.map((t) => <option key={t.tipo} value={t.tipo} className="bg-noite">{t.emoji} {t.rotulo}</option>)}
        </select>
        <button type="button" onClick={adicionar} disabled={!novoTipo}
          className="px-4 py-2 rounded-xl bg-weg-azul text-white text-sm font-bold disabled:opacity-40">Adicionar</button>
      </div>
      {secoes.length > 0 && (
        <p className="text-[11px] text-white/60 text-end">Seções: <strong className="text-white tabular-nums">{formatarMoedaBRL(totalSecoes(secoes))}</strong></p>
      )}
    </div>
  )
}
