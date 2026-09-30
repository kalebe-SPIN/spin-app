'use client'

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { fmtNum } from '@/lib/formatters'
import type { ParametrosVigentes } from '@/lib/precificacao/calcular'
import {
  PARAMETROS_VENDA_DIRETA, calcularVendaDireta, erroTravaCupom, type CupomAplicado,
} from '@/lib/precificacao/venda-direta'
import {
  editarParametroVendaDiretaAction, salvarCupomAction, alternarCupomAction, excluirCupomAction,
} from '@/app/admin/precificacao/venda-direta/actions'

/**
 * Estrutura de preço da venda de equipamentos + cupons (Kalebe 2026-09-30).
 * O simulador usa o valor que está sendo digitado (prévia antes de salvar).
 */

const brl = (v: number) => `R$ ${fmtNum(v, 2)}`
const lerBR = (s: string) => {
  const t = String(s ?? '').trim()
  if (!t) return NaN
  return Number(t.includes(',') ? t.replace(/\./g, '').replace(',', '.') : t)
}
const inp = 'w-full px-3 py-2 bg-white/5 border border-white/15 rounded-md text-sm text-white focus:outline-none focus:border-sol placeholder-white/30'
const hoje = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' })
const dataBR = (d: string | null) => (d ? d.split('-').reverse().join('/') : '—')

type Detalhe = { chave: string; valor_numero: number; unidade: string | null; valor_minimo: number | null; valor_maximo: number | null; vigente_de: string }
type Cupom = {
  id: string; codigo: string; descricao: string | null; tipo: 'percentual' | 'valor'; valor: number
  valido_de: string | null; valido_ate: string | null; limite_usos: number | null; ativo: boolean
}

export function PrecificacaoVendaDiretaClient({ params, detalhes, cupons, usosPorCupom, log }: {
  params: ParametrosVigentes
  detalhes: Detalhe[]
  cupons: Cupom[] | null
  usosPorCupom: Record<string, { qtd: number; total: number }>
  log: Array<{ parametro_chave: string; valor_anterior: any; valor_novo: any; motivo: string; created_at: string }>
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [msg, setMsg] = useState<{ tipo: 'ok' | 'erro'; texto: string } | null>(null)
  const [editando, setEditando] = useState<string | null>(null)
  const [rascunho, setRascunho] = useState('')
  const [motivo, setMotivo] = useState('')

  // Simulador
  const [simTabela, setSimTabela] = useState('10000')
  const [simFrete, setSimFrete] = useState('0')
  const [simCupom, setSimCupom] = useState('')

  const semMigration = detalhes.length === 0
  const porChave = new Map(detalhes.map((d) => [d.chave, d]))

  // Parâmetros da simulação: vigentes + o valor em edição (prévia)
  const paramsSim = useMemo(() => {
    const v = lerBR(rascunho)
    if (!editando || !Number.isFinite(v)) return params
    return { ...params, [editando]: { valor_numero: v, valor_json: null, unidade: params[editando]?.unidade || null } }
  }, [params, editando, rascunho])

  const cupomSim: CupomAplicado | null = useMemo(() => {
    const c = (cupons || []).find((x) => x.id === simCupom)
    return c ? { id: c.id, codigo: c.codigo, tipo: c.tipo, valor: Number(c.valor) } : null
  }, [cupons, simCupom])

  const sim = useMemo(() => calcularVendaDireta({
    itens: [{ produto_id: null, modelo: 'Simulação', fabricante: null, descricao: null, categoria: null, qtd: 1, preco_tabela: Math.max(0, lerBR(simTabela) || 0) }],
    frete: Math.max(0, lerBR(simFrete) || 0),
    cupom: cupomSim,
  }, paramsSim), [simTabela, simFrete, cupomSim, paramsSim])
  const travaSim = erroTravaCupom(sim, paramsSim)

  function rodar(fn: () => Promise<{ erro: string } | { sucesso: true }>, ok: string, depois?: () => void) {
    startTransition(async () => {
      const r = await fn()
      if ('erro' in r) setMsg({ tipo: 'erro', texto: r.erro })
      else { setMsg({ tipo: 'ok', texto: ok }); depois?.(); router.refresh() }
    })
  }

  function salvarParametro(chave: string, rotulo: string) {
    const v = lerBR(rascunho)
    if (!Number.isFinite(v)) { setMsg({ tipo: 'erro', texto: 'Valor inválido' }); return }
    rodar(() => editarParametroVendaDiretaAction(chave, v, motivo), `${rotulo} atualizado`, () => { setEditando(null); setMotivo('') })
  }

  const fmtParam = (chave: string, v: number | null | undefined) => {
    const def = PARAMETROS_VENDA_DIRETA.find((p) => p.chave === chave)
    const un = porChave.get(chave)?.unidade
    if (v === null || v === undefined) return '—'
    const n = fmtNum(v, def?.casas ?? 2)
    return un === '%' ? `${n}%` : un === 'x' ? `${n}×` : n
  }

  return (
    <div className="space-y-6">
      {msg && (
        <div className={`p-3 rounded-lg border text-sm ${msg.tipo === 'erro' ? 'bg-coral/10 border-coral/30 text-coral' : 'bg-verde/10 border-verde/30 text-verde'}`}>
          {msg.texto}<button onClick={() => setMsg(null)} className="float-right text-xs opacity-70">✕</button>
        </div>
      )}
      {semMigration && (
        <div className="p-4 rounded-xl border border-sol/30 bg-sol/10 text-sm text-sol">
          ⚠️ Falta rodar a migration 128 no Supabase — até lá a venda direta usa os parâmetros da proposta FV e não há cupons.
        </div>
      )}

      {/* Como o preço é formado */}
      <section className="bg-white/[0.03] border border-white/10 rounded-xl p-5">
        <h2 className="text-sm font-bold text-white mb-2">Como o preço é formado</h2>
        <ol className="text-xs text-white/70 space-y-1 list-decimal list-inside">
          <li>Custo dos equipamentos = preço de tabela WEG × <strong className="text-white">fator</strong> (itens sem preço na planilha: custo digitado entra sem fator)</li>
          <li>Base = custo dos equipamentos + frete da proposta</li>
          <li>Preço cheio = base ÷ (1 − <strong className="text-white">margem</strong> − <strong className="text-white">comissão</strong> − <strong className="text-white">imposto</strong>)</li>
          <li>Cupom (só admin aplica) desconta do preço cheio → preço final. Comissão e imposto são calculados sobre o preço final.</li>
          <li>Trava: se a margem depois do cupom ficar abaixo da <strong className="text-white">margem mínima</strong>, o cupom é recusado.</li>
          <li>Cartão: preço final + <strong className="text-white">taxa do cartão</strong> (cliente paga), dividido nas <strong className="text-white">parcelas</strong>.</li>
        </ol>
      </section>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_380px] gap-6 items-start">
        {/* Parâmetros */}
        <section className="space-y-2">
          <h2 className="text-xs uppercase tracking-wider font-bold text-sol">Parâmetros</h2>
          {PARAMETROS_VENDA_DIRETA.map((p) => {
            const d = porChave.get(p.chave)
            const emEdicao = editando === p.chave
            return (
              <div key={p.chave} className={`bg-white/[0.03] border rounded-xl p-3 ${emEdicao ? 'border-sol/50' : 'border-white/10'}`}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-white">{p.rotulo}</p>
                    <p className="text-[11px] text-white/50">{p.ajuda}</p>
                    {d && (
                      <p className="text-[10px] text-white/35 mt-0.5">
                        faixa {fmtParam(p.chave, d.valor_minimo)} a {fmtParam(p.chave, d.valor_maximo)} · vigente desde {dataBR(d.vigente_de)}
                      </p>
                    )}
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-xl font-black text-white">{fmtParam(p.chave, d?.valor_numero ?? params[p.chave]?.valor_numero ?? null)}</p>
                    {!emEdicao && d && (
                      <button onClick={() => { setEditando(p.chave); setRascunho(String(d.valor_numero).replace('.', ',')); setMotivo('') }}
                        className="text-xs text-sol hover:underline">✎ alterar</button>
                    )}
                  </div>
                </div>
                {emEdicao && (
                  <div className="mt-3 grid grid-cols-1 sm:grid-cols-[140px_1fr_auto] gap-2 items-start">
                    <input className={`${inp} font-mono`} inputMode="decimal" value={rascunho} autoFocus
                      onChange={(e) => setRascunho(e.target.value.replace(/[^\d.,]/g, ''))} />
                    <input className={inp} value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Motivo da mudança (obrigatório)" />
                    <div className="flex gap-2">
                      <button disabled={pending} onClick={() => salvarParametro(p.chave, p.rotulo)}
                        className="px-3 py-2 bg-sol text-noite text-xs font-bold rounded-md disabled:opacity-40">Salvar</button>
                      <button onClick={() => setEditando(null)} className="px-3 py-2 bg-white/5 text-white/60 text-xs rounded-md">✕</button>
                    </div>
                    <p className="sm:col-span-3 text-[10px] text-white/45">O simulador ao lado já mostra o efeito do valor digitado.</p>
                  </div>
                )}
              </div>
            )
          })}
        </section>

        {/* Simulador */}
        <section className="bg-white/[0.03] border border-sol/30 rounded-xl p-4 space-y-3 lg:sticky lg:top-20">
          <h2 className="text-xs uppercase tracking-wider font-bold text-sol">Simulador{editando ? ' (com o valor em edição)' : ''}</h2>
          <div className="grid grid-cols-2 gap-2">
            <label className="block text-[11px] text-white/60">Tabela WEG (R$)
              <input className={`${inp} font-mono mt-1`} inputMode="decimal" value={simTabela} onChange={(e) => setSimTabela(e.target.value.replace(/[^\d.,]/g, ''))} />
            </label>
            <label className="block text-[11px] text-white/60">Frete (R$)
              <input className={`${inp} font-mono mt-1`} inputMode="decimal" value={simFrete} onChange={(e) => setSimFrete(e.target.value.replace(/[^\d.,]/g, ''))} />
            </label>
          </div>
          {cupons && cupons.length > 0 && (
            <label className="block text-[11px] text-white/60">Cupom
              <select className={`${inp} mt-1`} value={simCupom} onChange={(e) => setSimCupom(e.target.value)}>
                <option value="" className="bg-noite">Sem cupom</option>
                {[...cupons].sort((a, b) => a.codigo.localeCompare(b.codigo, 'pt-BR')).map((c) => (
                  <option key={c.id} value={c.id} className="bg-noite">{c.codigo} — {c.tipo === 'percentual' ? `${fmtNum(c.valor, 2)}%` : brl(c.valor)}</option>
                ))}
              </select>
            </label>
          )}
          <table className="w-full text-xs">
            <tbody className="[&_td]:py-0.5">
              <tr><td className="text-white/55">Custo (× fator {fmtNum(sim.fator_aplicado, 4)})</td><td className="text-right text-white/80">{brl(sim.custo_equipamentos)}</td></tr>
              <tr><td className="text-white/55">+ frete</td><td className="text-right text-white/80">{brl(sim.frete)}</td></tr>
              <tr className="border-t border-white/10"><td className="text-white/70">Base</td><td className="text-right text-white">{brl(sim.base_custo)}</td></tr>
              <tr><td className="text-white/55">Preço cheio</td><td className="text-right text-white">{brl(sim.pv_cheio)}</td></tr>
              {sim.desconto_cupom > 0 && <tr><td className="text-white/55">− cupom {sim.cupom?.codigo}</td><td className="text-right text-coral">−{brl(sim.desconto_cupom)}</td></tr>}
              <tr><td className="text-white/55">Comissão {fmtNum(sim.comissao_pct, 2)}%</td><td className="text-right text-white/80">{brl(sim.comissao)}</td></tr>
              <tr><td className="text-white/55">Imposto {fmtNum(sim.imposto_pct, 2)}%</td><td className="text-right text-white/80">{brl(sim.imposto)}</td></tr>
              <tr><td className="text-white/55">Margem ({fmtNum(sim.margem_efetiva_pct, 2)}%)</td><td className={`text-right ${sim.margem >= 0 ? 'text-verde' : 'text-coral'}`}>{brl(sim.margem)}</td></tr>
              <tr className="border-t border-white/10"><td className="text-sol font-bold">Preço final à vista</td><td className="text-right text-sol font-bold">{brl(sim.pv_total)}</td></tr>
              <tr><td className="text-white/55">Cartão</td><td className="text-right text-white/80">{fmtNum(sim.pagamento.cartao_parcelas, 0)}× {brl(sim.pagamento.cartao_parcela)}</td></tr>
            </tbody>
          </table>
          {travaSim && <p className="text-[11px] text-coral">⚠ {travaSim}</p>}
        </section>
      </div>

      {/* Cupons */}
      <Cupons cupons={cupons} usosPorCupom={usosPorCupom} pending={pending} rodar={rodar} />

      {/* Histórico */}
      {log.length > 0 && (
        <section className="space-y-1.5">
          <h2 className="text-xs uppercase tracking-wider font-bold text-white/50">Últimas mudanças</h2>
          {log.map((l, i) => {
            const def = PARAMETROS_VENDA_DIRETA.find((p) => p.chave === l.parametro_chave)
            return (
              <p key={i} className="text-[11px] text-white/55">
                {new Date(l.created_at).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' })} ·{' '}
                <strong className="text-white/80">{def?.rotulo || l.parametro_chave}</strong>:{' '}
                {fmtParam(l.parametro_chave, l.valor_anterior?.valor_numero)} → {fmtParam(l.parametro_chave, l.valor_novo?.valor_numero)} — “{l.motivo}”
              </p>
            )
          })}
        </section>
      )}
    </div>
  )
}

// ─── Cupons ─────────────────────────────────────────────────────────────────

function Cupons({ cupons, usosPorCupom, pending, rodar }: {
  cupons: Cupom[] | null
  usosPorCupom: Record<string, { qtd: number; total: number }>
  pending: boolean
  rodar: (fn: () => Promise<{ erro: string } | { sucesso: true }>, ok: string, depois?: () => void) => void
}) {
  const vazio = { codigo: '', descricao: '', tipo: 'percentual' as 'percentual' | 'valor', valor: '', valido_de: '', valido_ate: '', limite_usos: '' }
  const [form, setForm] = useState<typeof vazio | null>(null)
  const [editId, setEditId] = useState<string | null>(null)

  if (cupons === null) return null
  const agora = hoje()

  function salvar() {
    if (!form) return
    rodar(() => salvarCupomAction({
      id: editId || undefined,
      codigo: form.codigo, descricao: form.descricao, tipo: form.tipo,
      valor: lerBR(form.valor),
      valido_de: form.valido_de || null, valido_ate: form.valido_ate || null,
      limite_usos: form.limite_usos ? Number(form.limite_usos) : null,
    }), editId ? 'Cupom atualizado' : 'Cupom criado', () => { setForm(null); setEditId(null) })
  }

  return (
    <section className="space-y-2">
      <div className="flex items-center justify-between">
        <h2 className="text-xs uppercase tracking-wider font-bold text-sol">🎟 Cupons de desconto</h2>
        {!form && <button onClick={() => { setForm(vazio); setEditId(null) }} className="px-3 py-2 bg-sol text-noite text-xs font-bold rounded-lg">+ Novo cupom</button>}
      </div>
      <p className="text-[11px] text-white/45">Só o admin aplica cupom, na tela da venda direta. O desconto sai do preço cheio; comissão e imposto acompanham o valor com desconto.</p>

      {form && (
        <div className="bg-white/[0.03] border border-sol/40 rounded-xl p-4 grid grid-cols-1 sm:grid-cols-4 gap-3">
          <label className="block text-[11px] text-white/60">Código *
            <input className={`${inp} mt-1 font-mono uppercase`} value={form.codigo} onChange={(e) => setForm({ ...form, codigo: e.target.value.toUpperCase() })} placeholder="SPIN10" autoFocus />
          </label>
          <label className="block text-[11px] text-white/60">Tipo *
            <select className={`${inp} mt-1`} value={form.tipo} onChange={(e) => setForm({ ...form, tipo: e.target.value as any })}>
              <option value="percentual" className="bg-noite">Percentual (%)</option>
              <option value="valor" className="bg-noite">Valor fixo (R$)</option>
            </select>
          </label>
          <label className="block text-[11px] text-white/60">{form.tipo === 'percentual' ? 'Desconto (%) *' : 'Desconto (R$) *'}
            <input className={`${inp} mt-1 font-mono`} inputMode="decimal" value={form.valor} onChange={(e) => setForm({ ...form, valor: e.target.value.replace(/[^\d.,]/g, '') })} />
          </label>
          <label className="block text-[11px] text-white/60">Limite de usos
            <input className={`${inp} mt-1`} type="number" min={1} value={form.limite_usos} onChange={(e) => setForm({ ...form, limite_usos: e.target.value })} placeholder="sem limite" />
          </label>
          <label className="block text-[11px] text-white/60">Válido de
            <input className={`${inp} mt-1`} type="date" value={form.valido_de} onChange={(e) => setForm({ ...form, valido_de: e.target.value })} />
          </label>
          <label className="block text-[11px] text-white/60">Válido até
            <input className={`${inp} mt-1`} type="date" value={form.valido_ate} onChange={(e) => setForm({ ...form, valido_ate: e.target.value })} />
          </label>
          <label className="block text-[11px] text-white/60 sm:col-span-2">Descrição (interna)
            <input className={`${inp} mt-1`} value={form.descricao} onChange={(e) => setForm({ ...form, descricao: e.target.value })} placeholder="Ex.: feira de outubro" />
          </label>
          <div className="sm:col-span-4 flex gap-2">
            <button disabled={pending} onClick={salvar} className="px-4 py-2 bg-sol text-noite text-xs font-bold rounded-lg disabled:opacity-40">{editId ? 'Salvar cupom' : 'Criar cupom'}</button>
            <button onClick={() => { setForm(null); setEditId(null) }} className="px-4 py-2 bg-white/5 text-white/60 text-xs rounded-lg">Cancelar</button>
          </div>
        </div>
      )}

      {cupons.length === 0 && !form && <p className="text-sm text-white/40 py-6 text-center">Nenhum cupom criado.</p>}
      {cupons.map((c) => {
        const u = usosPorCupom[c.id] || { qtd: 0, total: 0 }
        const vencido = !!c.valido_ate && c.valido_ate < agora
        const esgotado = !!c.limite_usos && u.qtd >= c.limite_usos
        const status = !c.ativo ? 'desativado' : vencido ? 'vencido' : esgotado ? 'esgotado' : 'ativo'
        return (
          <div key={c.id} className={`bg-white/[0.03] border rounded-xl p-3 flex flex-col sm:flex-row sm:items-center gap-2 ${status === 'ativo' ? 'border-white/10' : 'border-white/5 opacity-60'}`}>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold text-white">
                <span className="font-mono">{c.codigo}</span>
                <span className="text-verde ml-2">{c.tipo === 'percentual' ? `−${fmtNum(c.valor, 2)}%` : `−${brl(c.valor)}`}</span>
                <span className={`ml-2 text-[10px] uppercase px-1.5 py-0.5 rounded ${status === 'ativo' ? 'bg-verde/10 text-verde' : 'bg-white/10 text-white/60'}`}>{status}</span>
              </p>
              <p className="text-[11px] text-white/50">
                {c.descricao ? `${c.descricao} · ` : ''}
                validade {c.valido_de || c.valido_ate ? `${dataBR(c.valido_de)} a ${dataBR(c.valido_ate)}` : 'sem prazo'} ·
                {' '}usos {u.qtd}{c.limite_usos ? `/${c.limite_usos}` : ''}{u.total > 0 ? ` · ${brl(u.total)} concedidos` : ''}
              </p>
            </div>
            <div className="flex gap-3 text-xs shrink-0">
              <button className="text-white/60 hover:underline" onClick={() => {
                setEditId(c.id)
                setForm({
                  codigo: c.codigo, descricao: c.descricao || '', tipo: c.tipo, valor: String(c.valor).replace('.', ','),
                  valido_de: c.valido_de || '', valido_ate: c.valido_ate || '', limite_usos: c.limite_usos ? String(c.limite_usos) : '',
                })
              }}>editar</button>
              <button className={c.ativo ? 'text-coral/80 hover:underline' : 'text-verde hover:underline'} disabled={pending}
                onClick={() => rodar(() => alternarCupomAction(c.id, !c.ativo), c.ativo ? 'Cupom desativado' : 'Cupom reativado')}>
                {c.ativo ? 'desativar' : 'reativar'}
              </button>
              {u.qtd === 0 && (
                <button className="text-coral/70 hover:underline" disabled={pending} onClick={() => {
                  if (confirm(`Excluir o cupom ${c.codigo}?`)) rodar(() => excluirCupomAction(c.id), 'Cupom excluído')
                }}>excluir</button>
              )}
            </div>
          </div>
        )
      })}
    </section>
  )
}
