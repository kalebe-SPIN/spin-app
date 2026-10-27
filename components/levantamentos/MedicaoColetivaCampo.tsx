'use client'

import { useEffect, useMemo, useState } from 'react'
import { fmtNum } from '@/lib/formatters'
import { numeroBR, numeroParaCampo } from '@/lib/levantamentos/comum'
import {
  LIGACOES, T04_MONOFASICOS, T04_TRIFASICOS, T05_ATIVIDADES, TIPOS_UNIDADE,
  calcularColetiva, coletivaVazia, type MedicaoColetiva, type UnidadeColetiva,
} from '@/lib/levantamentos/n3210003'

const inputCls = 'w-full bg-white/5 border border-white/10 focus:border-sol/50 rounded-lg px-2.5 py-2 text-white text-base sm:text-sm focus:outline-none'
const rotuloCls = 'text-[10px] uppercase tracking-wider text-white/50'
const atividadesAZ = [...T05_ATIVIDADES].sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))

/** Número com vírgula; mantém o texto enquanto digita e acompanha mudanças de fora. */
function Num({ valor, onChange, sufixo, placeholder, inteiro }: {
  valor: number | null | undefined; onChange: (n: number | null) => void; sufixo?: string; placeholder?: string; inteiro?: boolean
}) {
  const [texto, setTexto] = useState(numeroParaCampo(valor))
  useEffect(() => { if ((numeroBR(texto) ?? null) !== (valor ?? null)) setTexto(numeroParaCampo(valor)) }, [valor]) // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div className="flex items-center gap-1.5">
      <input value={texto} inputMode={inteiro ? 'numeric' : 'decimal'} placeholder={placeholder}
        onChange={(e) => { setTexto(e.target.value); const n = numeroBR(e.target.value); onChange(n !== null && inteiro ? Math.round(n) : n) }}
        className={`${inputCls} ${texto && numeroBR(texto) === null ? 'border-coral/70' : ''}`} />
      {sufixo && <span className="text-xs text-white/55 shrink-0">{sufixo}</span>}
    </div>
  )
}

/**
 * Medição coletiva (Kalebe 2026-10-27) — CELESC N-321.0003: cada unidade com
 * o disjuntor dela; o sistema calcula a demanda provável (item 5.6) e o
 * disjuntor geral (Tabela 11, acima do maior individual).
 */
export function MedicaoColetivaCampo({ valor, onChange, borda, onUsarDisjuntor }: {
  valor: MedicaoColetiva | null
  onChange: (m: MedicaoColetiva) => void
  borda: string
  onUsarDisjuntor?: (a: number) => void
}) {
  const m = valor || coletivaVazia()
  const r = useMemo(() => calcularColetiva(m), [m])
  const [lote, setLote] = useState<{ aberto: boolean; qtd: number | null; prefixo: string; tipo: UnidadeColetiva['tipo']; ligacao: UnidadeColetiva['ligacao']; disj: number | null; area: number | null }>(
    { aberto: false, qtd: 4, prefixo: 'Apto', tipo: 'Residencial', ligacao: 'Monofásica (1F+N)', disj: null, area: null })
  const temComercial = m.unidades.some((u) => u.tipo === 'Comercial') || m.comercial.atividades.length + m.comercial.aquecimento.length + m.comercial.ar.length > 0

  const setUnidades = (unidades: UnidadeColetiva[]) => onChange({ ...m, unidades })
  const mudarUnidade = (i: number, p: Partial<UnidadeColetiva>) => setUnidades(m.unidades.map((u, j) => (j === i ? { ...u, ...p } : u)))
  const setCond = (p: Partial<MedicaoColetiva['condominio']>) => onChange({ ...m, condominio: { ...m.condominio, ...p } })
  const setCom = (p: Partial<MedicaoColetiva['comercial']>) => onChange({ ...m, comercial: { ...m.comercial, ...p } })

  function adicionarLote() {
    const n = Math.max(1, Math.min(300, Math.round(lote.qtd || 0)))
    const base = m.unidades.length
    setUnidades([...m.unidades, ...Array.from({ length: n }, (_, i) => ({
      identificacao: `${lote.prefixo.trim() || 'Unidade'} ${base + i + 1}`, tipo: lote.tipo, ligacao: lote.ligacao,
      disjuntor_a: lote.disj, area_m2: lote.tipo === 'Residencial' ? lote.area : null, demanda_kva: null,
    }))])
    setLote((l) => ({ ...l, aberto: false }))
  }

  return (
    <div className={`rounded-lg border p-3 space-y-4 ${borda}`}>
      {/* ── Unidades ── */}
      <section className="space-y-2">
        <h3 className="text-xs font-bold uppercase tracking-wider text-white/80">Relógios — unidades consumidoras ({m.unidades.length})</h3>
        <p className="text-[11px] text-white/45">Um relógio por unidade, cada um com o disjuntor dele. Residencial pede a área útil; industrial, a demanda.</p>
        {m.unidades.map((u, i) => (
          <div key={i} className="rounded-lg border border-white/10 p-2.5 space-y-2">
            <div className="flex items-center gap-2">
              <input value={u.identificacao} onChange={(e) => mudarUnidade(i, { identificacao: e.target.value })}
                placeholder="Ex.: Casa 1, Apto 101, Sala 2" className={inputCls} aria-label="Identificação da unidade" />
              <button type="button" onClick={() => setUnidades(m.unidades.filter((_, j) => j !== i))} className="px-2 py-1 text-white/50" aria-label={`Tirar ${u.identificacao || 'relógio'}`}>✕</button>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <label className="space-y-0.5"><span className={rotuloCls}>Tipo</span>
                <select value={u.tipo} onChange={(e) => mudarUnidade(i, { tipo: e.target.value as UnidadeColetiva['tipo'] })} className={inputCls}>
                  {TIPOS_UNIDADE.map((t) => <option key={t}>{t}</option>)}
                </select>
              </label>
              <label className="space-y-0.5"><span className={rotuloCls}>Ligação</span>
                <select value={u.ligacao} onChange={(e) => mudarUnidade(i, { ligacao: e.target.value as UnidadeColetiva['ligacao'] })} className={inputCls}>
                  {LIGACOES.map((t) => <option key={t}>{t}</option>)}
                </select>
              </label>
              <label className="space-y-0.5"><span className={rotuloCls}>Disjuntor *</span>
                <Num valor={u.disjuntor_a} onChange={(n) => mudarUnidade(i, { disjuntor_a: n })} sufixo="A" inteiro />
              </label>
              {u.tipo === 'Residencial' && (
                <label className="space-y-0.5"><span className={rotuloCls}>Área útil *</span>
                  <Num valor={u.area_m2} onChange={(n) => mudarUnidade(i, { area_m2: n })} sufixo="m²" />
                </label>
              )}
              {u.tipo === 'Industrial' && (
                <label className="space-y-0.5"><span className={rotuloCls}>Demanda *</span>
                  <Num valor={u.demanda_kva} onChange={(n) => mudarUnidade(i, { demanda_kva: n })} sufixo="kVA" />
                </label>
              )}
            </div>
          </div>
        ))}
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => setUnidades([...m.unidades, { identificacao: `Relógio ${m.unidades.length + 1}`, tipo: 'Residencial', ligacao: 'Monofásica (1F+N)', disjuntor_a: null, area_m2: null, demanda_kva: null }])}
            className="px-3 py-2 bg-sol text-noite text-sm font-bold rounded-lg">+ Adicionar relógio</button>
          <button type="button" onClick={() => setLote((l) => ({ ...l, aberto: !l.aberto }))} className="px-3 py-2 border border-white/15 text-white/85 text-sm rounded-lg">
            + Vários relógios iguais
          </button>
        </div>
        {lote.aberto && (
          <div className="rounded-lg border border-white/10 p-2.5 grid grid-cols-2 sm:grid-cols-3 gap-2">
            <label className="space-y-0.5"><span className={rotuloCls}>Quantas</span><Num valor={lote.qtd} onChange={(n) => setLote((l) => ({ ...l, qtd: n }))} inteiro /></label>
            <label className="space-y-0.5"><span className={rotuloCls}>Nome</span><input value={lote.prefixo} onChange={(e) => setLote((l) => ({ ...l, prefixo: e.target.value }))} className={inputCls} /></label>
            <label className="space-y-0.5"><span className={rotuloCls}>Tipo</span>
              <select value={lote.tipo} onChange={(e) => setLote((l) => ({ ...l, tipo: e.target.value as UnidadeColetiva['tipo'] }))} className={inputCls}>
                {TIPOS_UNIDADE.map((t) => <option key={t}>{t}</option>)}
              </select>
            </label>
            <label className="space-y-0.5"><span className={rotuloCls}>Ligação</span>
              <select value={lote.ligacao} onChange={(e) => setLote((l) => ({ ...l, ligacao: e.target.value as UnidadeColetiva['ligacao'] }))} className={inputCls}>
                {LIGACOES.map((t) => <option key={t}>{t}</option>)}
              </select>
            </label>
            <label className="space-y-0.5"><span className={rotuloCls}>Disjuntor</span><Num valor={lote.disj} onChange={(n) => setLote((l) => ({ ...l, disj: n }))} sufixo="A" inteiro /></label>
            {lote.tipo === 'Residencial' && (
              <label className="space-y-0.5"><span className={rotuloCls}>Área útil</span><Num valor={lote.area} onChange={(n) => setLote((l) => ({ ...l, area: n }))} sufixo="m²" /></label>
            )}
            <button type="button" onClick={adicionarLote} className="col-span-2 sm:col-span-3 px-3 py-2 bg-sol text-noite text-sm font-bold rounded-lg">
              Adicionar {lote.qtd || 0} relógio{(lote.qtd || 0) === 1 ? '' : 's'} ({lote.prefixo || 'Unidade'} …)
            </button>
          </div>
        )}
      </section>

      {/* ── Áreas comuns ── */}
      <section className="space-y-2">
        <h3 className="text-xs font-bold uppercase tracking-wider text-white/80">Áreas comuns (condomínio) — se houver</h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          <label className="space-y-0.5"><span className={rotuloCls}>Iluminação</span><Num valor={m.condominio.iluminacao_kw} onChange={(n) => setCond({ iluminacao_kw: n })} sufixo="kW" /></label>
          <label className="space-y-0.5"><span className={rotuloCls}>Tomadas de uso geral</span><Num valor={m.condominio.tomadas_kw} onChange={(n) => setCond({ tomadas_kw: n })} sufixo="kW" /></label>
          <label className="space-y-0.5"><span className={rotuloCls}>Cargas especiais</span><Num valor={m.condominio.especiais_kw} onChange={(n) => setCond({ especiais_kw: n })} sufixo="kW" /></label>
        </div>
        <p className="text-[11px] text-white/45">Cargas especiais (100%): recarga de veículo, sauna, aquecimento central, iluminação de quadra…</p>
        {m.condominio.motores.map((mo, i) => {
          const tab = mo.fases === 'Monofásico' ? T04_MONOFASICOS : T04_TRIFASICOS
          return (
            <div key={i} className="grid grid-cols-[1fr_1fr_5rem_auto] gap-2 items-end">
              <label className="space-y-0.5"><span className={rotuloCls}>Motor</span>
                <select value={mo.fases} onChange={(e) => setCond({ motores: m.condominio.motores.map((x, j) => (j === i ? { ...x, fases: e.target.value as 'Trifásico' | 'Monofásico', cv: '1' } : x)) })} className={inputCls}>
                  <option>Monofásico</option><option>Trifásico</option>
                </select>
              </label>
              <label className="space-y-0.5"><span className={rotuloCls}>Potência</span>
                <select value={mo.cv} onChange={(e) => setCond({ motores: m.condominio.motores.map((x, j) => (j === i ? { ...x, cv: e.target.value } : x)) })} className={inputCls}>
                  {Object.keys(tab).map((cv) => <option key={cv} value={cv}>{cv} CV</option>)}
                </select>
              </label>
              <label className="space-y-0.5"><span className={rotuloCls}>Qtd</span>
                <Num valor={mo.qtd} onChange={(n) => setCond({ motores: m.condominio.motores.map((x, j) => (j === i ? { ...x, qtd: n || 1 } : x)) })} inteiro />
              </label>
              <button type="button" onClick={() => setCond({ motores: m.condominio.motores.filter((_, j) => j !== i) })} className="px-2 py-2 text-white/50" aria-label="Tirar motor">✕</button>
            </div>
          )
        })}
        <button type="button" onClick={() => setCond({ motores: [...m.condominio.motores, { cv: '1', fases: 'Trifásico', qtd: 1 }] })} className="px-3 py-1.5 border border-white/15 text-white/80 text-xs rounded-lg">
          + Motor (bomba, elevador, portão…)
        </button>
      </section>

      {/* ── Comercial ── */}
      {temComercial && (
        <section className="space-y-2">
          <h3 className="text-xs font-bold uppercase tracking-wider text-white/80">Salas e lojas (comercial)</h3>
          <p className="text-[11px] text-white/45">Iluminação + tomadas de uso geral somadas por atividade; aquecimento e ar-condicionado de todas as salas.</p>
          {m.comercial.atividades.map((a, i) => (
            <div key={i} className="grid grid-cols-[1fr_7rem_auto] gap-2 items-end">
              <label className="space-y-0.5"><span className={rotuloCls}>Atividade</span>
                <select value={a.atividade} onChange={(e) => setCom({ atividades: m.comercial.atividades.map((x, j) => (j === i ? { ...x, atividade: e.target.value } : x)) })} className={inputCls}>
                  {atividadesAZ.map((t) => <option key={t.id} value={t.id}>{t.nome}</option>)}
                </select>
              </label>
              <label className="space-y-0.5"><span className={rotuloCls}>Ilum. + tomadas</span>
                <Num valor={a.kw} onChange={(n) => setCom({ atividades: m.comercial.atividades.map((x, j) => (j === i ? { ...x, kw: n } : x)) })} sufixo="kW" />
              </label>
              <button type="button" onClick={() => setCom({ atividades: m.comercial.atividades.filter((_, j) => j !== i) })} className="px-2 py-2 text-white/50" aria-label="Tirar atividade">✕</button>
            </div>
          ))}
          {m.comercial.aquecimento.map((a, i) => (
            <div key={i} className="grid grid-cols-[1fr_4.5rem_6rem_auto] gap-2 items-end">
              <label className="space-y-0.5"><span className={rotuloCls}>Aquecimento</span>
                <input value={a.descricao} placeholder="Chuveiro, forno…" onChange={(e) => setCom({ aquecimento: m.comercial.aquecimento.map((x, j) => (j === i ? { ...x, descricao: e.target.value } : x)) })} className={inputCls} />
              </label>
              <label className="space-y-0.5"><span className={rotuloCls}>Qtd</span>
                <Num valor={a.qtd} onChange={(n) => setCom({ aquecimento: m.comercial.aquecimento.map((x, j) => (j === i ? { ...x, qtd: n || 1 } : x)) })} inteiro />
              </label>
              <label className="space-y-0.5"><span className={rotuloCls}>Cada</span>
                <Num valor={a.kw_cada} onChange={(n) => setCom({ aquecimento: m.comercial.aquecimento.map((x, j) => (j === i ? { ...x, kw_cada: n } : x)) })} sufixo="kW" />
              </label>
              <button type="button" onClick={() => setCom({ aquecimento: m.comercial.aquecimento.filter((_, j) => j !== i) })} className="px-2 py-2 text-white/50" aria-label="Tirar aquecimento">✕</button>
            </div>
          ))}
          {m.comercial.ar.map((a, i) => (
            <div key={i} className="grid grid-cols-[1fr_6rem_auto] gap-2 items-end">
              <label className="space-y-0.5"><span className={rotuloCls}>Ar-condicionado (qtd)</span>
                <Num valor={a.qtd} onChange={(n) => setCom({ ar: m.comercial.ar.map((x, j) => (j === i ? { ...x, qtd: n || 1 } : x)) })} inteiro />
              </label>
              <label className="space-y-0.5"><span className={rotuloCls}>Cada</span>
                <Num valor={a.kw_cada} onChange={(n) => setCom({ ar: m.comercial.ar.map((x, j) => (j === i ? { ...x, kw_cada: n } : x)) })} sufixo="kW" />
              </label>
              <button type="button" onClick={() => setCom({ ar: m.comercial.ar.filter((_, j) => j !== i) })} className="px-2 py-2 text-white/50" aria-label="Tirar ar-condicionado">✕</button>
            </div>
          ))}
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => setCom({ atividades: [...m.comercial.atividades, { atividade: 'bancos_lojas', kw: null }] })} className="px-3 py-1.5 border border-white/15 text-white/80 text-xs rounded-lg">+ Atividade</button>
            <button type="button" onClick={() => setCom({ aquecimento: [...m.comercial.aquecimento, { descricao: '', qtd: 1, kw_cada: null }] })} className="px-3 py-1.5 border border-white/15 text-white/80 text-xs rounded-lg">+ Aquecimento</button>
            <button type="button" onClick={() => setCom({ ar: [...m.comercial.ar, { qtd: 1, kw_cada: null }] })} className="px-3 py-1.5 border border-white/15 text-white/80 text-xs rounded-lg">+ Ar-condicionado</button>
          </div>
        </section>
      )}

      {/* ── Resultado ── */}
      <section className="rounded-lg border border-sol/50 bg-white/[0.03] p-3 space-y-2">
        <p className="text-sm text-white">Demanda provável: <b>{fmtNum(r.dp_kva, 2)} kVA</b></p>
        {r.disjuntor_a && r.linha ? (
          <>
            <p className="text-base text-white">Disjuntor geral: <b>{r.disjuntor_a} A tripolar</b> <span className="text-xs text-white/55">(Tabela 11 — N-321.0003)</span></p>
            {r.por_seletividade && (
              <p className="text-xs text-white/70">Pela demanda seria {r.disjuntor_tabela} A; subiu para ficar acima do maior disjuntor individual ({r.maior_individual} A) — seletividade, item 5.8.7 e.</p>
            )}
            <p className="text-xs text-white/65">
              Ramal aéreo multiplexado {r.linha.aereo_cobre} mm² Cu / {r.linha.aereo_aluminio} mm² Al · entrada embutida {r.linha.entrada_cobre} mm² Cu, eletroduto {r.linha.entrada_eletroduto}&quot; · subterrânea {r.linha.sub_cobre} mm² Cu, eletroduto {r.linha.sub_eletroduto}&quot;
            </p>
            {onUsarDisjuntor && (
              <button type="button" onClick={() => onUsarDisjuntor(r.disjuntor_a!)} className="px-3 py-1.5 border border-sol/60 text-white text-xs font-semibold rounded-lg">
                Usar {r.disjuntor_a} A no disjuntor pretendido
              </button>
            )}
          </>
        ) : (
          <p className="text-sm text-white/70">Disjuntor geral: complete os dados abaixo para calcular.</p>
        )}
        {r.avisos.length > 0 && <ul className="space-y-0.5">{r.avisos.map((a, i) => <li key={i} className="text-xs text-sol">⚠ {a}</li>)}</ul>}
        {r.memorial.length > 0 && (
          <details>
            <summary className="cursor-pointer text-xs text-white/60">Memorial de cálculo</summary>
            <ul className="mt-1 space-y-0.5">{r.memorial.map((l, i) => <li key={i} className="text-[11px] text-white/70">{l}</li>)}</ul>
          </details>
        )}
      </section>
    </div>
  )
}
