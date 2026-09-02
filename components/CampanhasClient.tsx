'use client'

import { useState, useTransition } from 'react'
import {
  salvarCampanhaAction,
  toggleCampanhaAction,
  excluirCampanhaAction,
  type CampanhaMes,
} from '@/app/admin/campanhas/actions'

type Produto = {
  id: string
  modelo: string
  codigo_weg?: string | null
  specs?: any
  preco_venda?: number | null
}

type Props = {
  campanhas: any[]
  placas: Produto[]
  inversores: Produto[]
}

const emptyForm: CampanhaMes = {
  titulo: '',
  subtitulo: '',
  condicao_especial: '',
  placa_id: null,
  qtd_placas: null,
  inversor_id: null,
  qtd_inversores: 1,
  pv_promocional: null,
  vigente_de: new Date().toISOString().slice(0, 10),
  vigente_ate: null,
  ativa: true,
}

export function CampanhasClient({ campanhas, placas, inversores }: Props) {
  const [editing, setEditing] = useState<CampanhaMes | null>(null)
  const [msg, setMsg] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  const fmt = (v: number) => v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

  async function salvar() {
    if (!editing) return
    setMsg(null)
    startTransition(async () => {
      const r = await salvarCampanhaAction(editing)
      if ('sucesso' in r) {
        setMsg('✓ Salvo')
        setEditing(null)
        setTimeout(() => window.location.reload(), 500)
      } else {
        setMsg('❌ ' + r.erro)
      }
    })
  }

  async function toggle(c: any) {
    startTransition(async () => {
      await toggleCampanhaAction(c.id, !c.ativa)
      window.location.reload()
    })
  }

  async function excluir(c: any) {
    if (!confirm(`Excluir campanha "${c.titulo}"?`)) return
    startTransition(async () => {
      await excluirCampanhaAction(c.id)
      window.location.reload()
    })
  }

  return (
    <div className="space-y-6">
      {/* Botão + form */}
      <section className="bg-white/[0.03] border border-white/10 rounded-xl p-6">
        {!editing ? (
          <button
            type="button"
            onClick={() => setEditing({ ...emptyForm })}
            className="px-4 py-2 bg-sol text-noite font-bold text-sm rounded-lg"
          >
            + Nova campanha
          </button>
        ) : (
          <FormCampanha
            valor={editing}
            onChange={setEditing}
            placas={placas}
            inversores={inversores}
            fmt={fmt}
            onSalvar={salvar}
            onCancelar={() => setEditing(null)}
            salvando={isPending}
            msg={msg}
          />
        )}
      </section>

      {/* Lista */}
      <section className="bg-white/[0.03] border border-white/10 rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-white/[0.03] border-b border-white/10">
            <tr>
              <th className="text-left px-4 py-3 text-[10px] uppercase tracking-wider text-white/50 font-bold">Título</th>
              <th className="text-left px-4 py-3 text-[10px] uppercase tracking-wider text-white/50 font-bold">Kit</th>
              <th className="text-right px-4 py-3 text-[10px] uppercase tracking-wider text-white/50 font-bold">PV Promo</th>
              <th className="text-left px-4 py-3 text-[10px] uppercase tracking-wider text-white/50 font-bold">Vigência</th>
              <th className="text-center px-4 py-3 text-[10px] uppercase tracking-wider text-white/50 font-bold">Ativa</th>
              <th className="text-right px-4 py-3 text-[10px] uppercase tracking-wider text-white/50 font-bold">Ações</th>
            </tr>
          </thead>
          <tbody>
            {campanhas.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-white/40 text-sm">
                  Nenhuma campanha cadastrada ainda.
                </td>
              </tr>
            )}
            {campanhas.map((c) => {
              const placa = placas.find(p => p.id === c.placa_id)
              const inversor = inversores.find(i => i.id === c.inversor_id)
              return (
                <tr key={c.id} className="border-b border-white/5 hover:bg-white/[0.02]">
                  <td className="px-4 py-3">
                    <div className="text-white font-semibold">{c.titulo}</div>
                    {c.subtitulo && <div className="text-white/50 text-xs mt-0.5">{c.subtitulo}</div>}
                  </td>
                  <td className="px-4 py-3 text-white/70 text-xs">
                    {placa ? `${c.qtd_placas || '?'}× ${placa.modelo}` : '—'}
                    {inversor && <div className="mt-1">{c.qtd_inversores || 1}× {inversor.modelo}</div>}
                  </td>
                  <td className="px-4 py-3 text-right font-mono text-sol">
                    {c.pv_promocional ? `R$ ${fmt(Number(c.pv_promocional))}` : '—'}
                  </td>
                  <td className="px-4 py-3 text-white/60 text-xs">
                    {c.vigente_de} {c.vigente_ate ? `→ ${c.vigente_ate}` : '(sem fim)'}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <button type="button" onClick={() => toggle(c)}
                      className={`px-2 py-1 rounded text-[10px] font-bold ${c.ativa ? 'bg-verde/20 text-verde' : 'bg-white/10 text-white/50'}`}>
                      {c.ativa ? 'ATIVA' : 'off'}
                    </button>
                  </td>
                  <td className="px-4 py-3 text-right space-x-2">
                    <button type="button" onClick={() => setEditing({
                      id: c.id, titulo: c.titulo, subtitulo: c.subtitulo,
                      condicao_especial: c.condicao_especial,
                      placa_id: c.placa_id, qtd_placas: c.qtd_placas,
                      inversor_id: c.inversor_id, qtd_inversores: c.qtd_inversores,
                      pv_promocional: c.pv_promocional ? Number(c.pv_promocional) : null,
                      vigente_de: c.vigente_de, vigente_ate: c.vigente_ate,
                      ativa: c.ativa,
                    })}
                      className="text-xs text-sol hover:underline">✏ editar</button>
                    <button type="button" onClick={() => excluir(c)}
                      className="text-xs text-coral hover:underline">🗑 excluir</button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </section>
    </div>
  )
}

function FormCampanha({
  valor, onChange, placas, inversores, fmt, onSalvar, onCancelar, salvando, msg,
}: {
  valor: CampanhaMes
  onChange: (v: CampanhaMes) => void
  placas: Produto[]
  inversores: Produto[]
  fmt: (v: number) => string
  onSalvar: () => void
  onCancelar: () => void
  salvando: boolean
  msg: string | null
}) {
  const set = <K extends keyof CampanhaMes>(k: K, v: CampanhaMes[K]) => onChange({ ...valor, [k]: v })
  const placa = placas.find(p => p.id === valor.placa_id)
  const inversor = inversores.find(i => i.id === valor.inversor_id)
  const pvBaseKit = (Number(placa?.preco_venda) || 0) * (valor.qtd_placas || 0)
    + (Number(inversor?.preco_venda) || 0) * (valor.qtd_inversores || 1)

  return (
    <div className="space-y-4">
      <h3 className="text-lg font-bold text-white">
        {valor.id ? '✏ Editar campanha' : '+ Nova campanha'}
      </h3>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <Field label="Título *">
          <input value={valor.titulo} onChange={e => set('titulo', e.target.value)}
            placeholder='ex: "Sol de Setembro"'
            className="w-full bg-white/[0.03] border border-white/15 rounded px-3 py-2 text-sm text-white focus:border-sol outline-none" />
        </Field>
        <Field label="Subtítulo">
          <input value={valor.subtitulo || ''} onChange={e => set('subtitulo', e.target.value)}
            placeholder='ex: "kit 4kWp com condição especial"'
            className="w-full bg-white/[0.03] border border-white/15 rounded px-3 py-2 text-sm text-white focus:border-sol outline-none" />
        </Field>
      </div>

      <Field label="Condição especial * (texto que aparece no PDF)">
        <textarea value={valor.condicao_especial} onChange={e => set('condicao_especial', e.target.value)}
          rows={2}
          placeholder='ex: "Oferta promocional válida pra fechamento até 30/setembro/2026. Preço final não sujeito a negociação."'
          className="w-full bg-white/[0.03] border border-white/15 rounded px-3 py-2 text-sm text-white focus:border-sol outline-none" />
      </Field>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <Field label="Placa">
          <select value={valor.placa_id || ''} onChange={e => set('placa_id', e.target.value || null)}
            className="w-full bg-white/[0.03] border border-white/15 rounded px-3 py-2 text-sm text-white focus:border-sol outline-none">
            <option value="">— nenhuma —</option>
            {placas.map(p => (
              <option key={p.id} value={p.id}>
                {p.modelo} {p.specs?.potencia_wp ? `(${p.specs.potencia_wp}Wp)` : ''} — R$ {fmt(Number(p.preco_venda) || 0)}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Qtd placas">
          <input type="number" min={1} value={valor.qtd_placas ?? ''}
            onChange={e => set('qtd_placas', e.target.value ? Number(e.target.value) : null)}
            className="w-full bg-white/[0.03] border border-white/15 rounded px-3 py-2 text-sm text-white font-mono focus:border-sol outline-none" />
        </Field>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <Field label="Inversor">
          <select value={valor.inversor_id || ''} onChange={e => set('inversor_id', e.target.value || null)}
            className="w-full bg-white/[0.03] border border-white/15 rounded px-3 py-2 text-sm text-white focus:border-sol outline-none">
            <option value="">— nenhum —</option>
            {inversores.map(i => (
              <option key={i.id} value={i.id}>
                {i.modelo} {i.specs?.potencia_kw ? `(${i.specs.potencia_kw}kW)` : ''} — R$ {fmt(Number(i.preco_venda) || 0)}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Qtd inversores">
          <input type="number" min={1} value={valor.qtd_inversores ?? ''}
            onChange={e => set('qtd_inversores', e.target.value ? Number(e.target.value) : null)}
            className="w-full bg-white/[0.03] border border-white/15 rounded px-3 py-2 text-sm text-white font-mono focus:border-sol outline-none" />
        </Field>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <Field label={`PV promocional (R$)${pvBaseKit ? ` — kit WEG ~ R$ ${fmt(pvBaseKit)}` : ''}`}>
          <input type="number" step="0.01" value={valor.pv_promocional ?? ''}
            onChange={e => set('pv_promocional', e.target.value ? Number(e.target.value) : null)}
            placeholder="ex: 19900.00"
            className="w-full bg-white/[0.03] border border-white/15 rounded px-3 py-2 text-sm text-sol font-mono focus:border-sol outline-none" />
        </Field>
        <Field label="Vigente de">
          <input type="date" value={valor.vigente_de || ''}
            onChange={e => set('vigente_de', e.target.value || null)}
            className="w-full bg-white/[0.03] border border-white/15 rounded px-3 py-2 text-sm text-white focus:border-sol outline-none" />
        </Field>
        <Field label="Vigente até">
          <input type="date" value={valor.vigente_ate || ''}
            onChange={e => set('vigente_ate', e.target.value || null)}
            className="w-full bg-white/[0.03] border border-white/15 rounded px-3 py-2 text-sm text-white focus:border-sol outline-none" />
        </Field>
      </div>

      <div className="flex items-center gap-3 pt-2 flex-wrap">
        <label className="flex items-center gap-2 text-sm text-white/80">
          <input type="checkbox" checked={valor.ativa !== false}
            onChange={e => set('ativa', e.target.checked)} />
          Campanha ativa (consultor pode oferecer)
        </label>
        <div className="flex-1" />
        <button type="button" onClick={onSalvar} disabled={salvando}
          className="px-4 py-2 bg-sol text-noite font-bold text-sm rounded-lg disabled:opacity-40">
          {salvando ? '⏳' : '💾'} Salvar
        </button>
        <button type="button" onClick={onCancelar} disabled={salvando}
          className="px-4 py-2 bg-white/5 border border-white/15 text-white text-sm rounded-lg">
          Cancelar
        </button>
      </div>
      {msg && <p className="text-xs text-white/70">{msg}</p>}
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[10px] uppercase tracking-wider text-white/50 font-bold">{label}</span>
      {children}
    </label>
  )
}
