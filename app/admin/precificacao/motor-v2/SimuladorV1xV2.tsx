'use client'

import { useState, useTransition } from 'react'
import { simularComparacaoAction, type EntradasSim, type ResultadoSim } from './actions'

type Props = {
  multiplicadoresDisponiveis: Array<{ codigo: string; nome: string; tipo: string; valor: number }>
}

const ORIGEM_OPCOES: Array<{ v: EntradasSim['origem_lead']; label: string; mult: number }> = [
  { v: 'base_repassada', label: 'Base repassada', mult: 0.85 },
  { v: 'lead_spin',      label: 'Lead SPIN',      mult: 1.00 },
  { v: 'aquecimento_1',  label: 'Aquecimento 1',  mult: 1.15 },
  { v: 'lead_verba',     label: 'Lead com verba', mult: 1.15 },
  { v: 'aquecimento_2',  label: 'Aquecimento 2',  mult: 1.25 },
  { v: 'indicacao',      label: 'Indicação',      mult: 1.25 },
  { v: 'prospeccao',     label: 'Prospecção',     mult: 1.35 },
  { v: 'resgate',        label: 'Resgate',        mult: 1.35 },
]

const fmtBRL = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 2 })
const fmtPct = (v: number) => `${(v * 100).toFixed(2).replace('.', ',')}%`
const parseNum = (s: string) => Number(String(s || '0').replace(/\./g, '').replace(',', '.'))

export function SimuladorV1xV2({ multiplicadoresDisponiveis }: Props) {
  const [pending, startTransition] = useTransition()
  const [resultado, setResultado] = useState<ResultadoSim | null>(null)
  const [erro, setErro] = useState<string | null>(null)

  const [potenciaKwp, setPotenciaKwp] = useState('10,45')
  const [kitBrutoWeg, setKitBrutoWeg] = useState('42.500,00')
  const [listaCa, setListaCa] = useState('3.200,00')
  const [distancia, setDistancia] = useState('0')
  const [origem, setOrigem] = useState<EntradasSim['origem_lead']>('prospeccao')
  const [volumeMensal, setVolumeMensal] = useState('80.000,00')
  const [planoOm, setPlanoOm] = useState(false)
  const [multsAtivos, setMultsAtivos] = useState<string[]>([])

  function toggleMult(codigo: string) {
    setMultsAtivos((atual) => atual.includes(codigo)
      ? atual.filter(c => c !== codigo)
      : [...atual, codigo])
  }

  function simular() {
    setErro(null)
    const kwp = parseNum(potenciaKwp)
    const wp = kwp * 1000
    const entrada: EntradasSim = {
      potencia_kwp: kwp,
      potencia_wp: wp,
      kit_bruto_weg: parseNum(kitBrutoWeg),
      lista_ca: parseNum(listaCa),
      distancia_km_extra: parseNum(distancia),
      origem_lead: origem,
      volume_mensal_consultor: parseNum(volumeMensal),
      plano_om_anexado: planoOm,
      multiplicadores_ativos: multsAtivos,
    }
    startTransition(async () => {
      const r = await simularComparacaoAction(entrada)
      if ('erro' in r) { setErro(r.erro); setResultado(null); return }
      setResultado(r.resultado)
    })
  }

  return (
    <section className="mt-10">
      <div className="flex items-baseline justify-between mb-3 flex-wrap gap-2">
        <div>
          <h2 className="text-xs uppercase tracking-widest font-bold text-sol">Simulador v1 × v2</h2>
          <p className="text-white/60 text-sm mt-0.5">
            Rode os dois motores lado a lado com os mesmos números. Serve pra validar impacto antes de ligar a flag.
          </p>
        </div>
        <button
          onClick={simular} disabled={pending}
          className="px-5 py-2.5 rounded-lg bg-sol text-sol-fundo font-bold text-sm hover:bg-sol/80 disabled:opacity-50 transition"
        >
          {pending ? 'Calculando…' : '⚡ Simular'}
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Entradas */}
        <div className="bg-white/[0.03] border border-white/10 rounded-xl p-5 space-y-4 lg:col-span-1">
          <p className="text-[10px] uppercase tracking-widest font-bold text-white/50">Entradas</p>

          <Campo label="Potência CC (kWp)" value={potenciaKwp} onChange={setPotenciaKwp} prefixo="" sufixo="kWp" />
          <Campo label="Kit WEG bruto (R$)" value={kitBrutoWeg} onChange={setKitBrutoWeg} prefixo="R$" />
          <Campo label="Lista CA agregada (R$)" value={listaCa} onChange={setListaCa} prefixo="R$" />
          <Campo label="Distância extra (km)" value={distancia} onChange={setDistancia} sufixo="km" />
          <Campo label="Volume mensal do consultor (R$)" value={volumeMensal} onChange={setVolumeMensal} prefixo="R$" />

          <div>
            <label className="text-[10px] uppercase tracking-wider text-white/50 font-bold block mb-1">
              Origem do lead
            </label>
            <select
              value={origem} onChange={(e) => setOrigem(e.target.value as any)}
              className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:border-sol/50 focus:outline-none"
            >
              {ORIGEM_OPCOES.map(o => (
                <option key={o.v} value={o.v}>{o.label} — {o.mult.toFixed(2)}×</option>
              ))}
            </select>
          </div>

          <label className="flex items-center gap-2 text-sm text-white/80 cursor-pointer">
            <input type="checkbox" checked={planoOm} onChange={(e) => setPlanoOm(e.target.checked)}
              className="w-4 h-4 accent-sol" />
            Plano O&M anexado
          </label>

          <div>
            <p className="text-[10px] uppercase tracking-wider text-white/50 font-bold mb-2">
              Multiplicadores de complexidade
            </p>
            <div className="space-y-1.5">
              {multiplicadoresDisponiveis.map(m => (
                <label key={m.codigo} className="flex items-start gap-2 text-xs text-white/80 cursor-pointer">
                  <input type="checkbox" checked={multsAtivos.includes(m.codigo)} onChange={() => toggleMult(m.codigo)}
                    className="w-4 h-4 mt-0.5 accent-sol" />
                  <span>
                    <span className="text-white">{m.nome}</span>
                    <span className="text-white/50 ml-2">
                      {m.tipo === 'percentual' ? `+${(m.valor * 100).toFixed(0)}%`
                        : m.tipo === 'valor_fixo' ? `+${fmtBRL(m.valor)}`
                        : m.tipo === 'por_km' ? `R$ ${m.valor.toFixed(2)}/km`
                        : 'orçar à parte'}
                    </span>
                  </span>
                </label>
              ))}
            </div>
          </div>
        </div>

        {/* Resultados */}
        <div className="lg:col-span-2">
          {erro && (
            <div className="bg-coral/10 border border-coral/30 text-coral rounded-xl p-4 mb-4 text-sm">
              {erro}
            </div>
          )}

          {!resultado && !erro && (
            <div className="bg-white/[0.02] border border-white/10 border-dashed rounded-xl p-10 text-center text-white/40 text-sm">
              Preencha os campos e clique em <strong className="text-white/60">Simular</strong> pra comparar os motores.
            </div>
          )}

          {resultado && (
            <div className="space-y-4">
              {/* Delta destaque */}
              <div className={`rounded-xl p-5 border ${resultado.delta_pv_pct > 0 ? 'bg-verde/10 border-verde/40' : resultado.delta_pv_pct < 0 ? 'bg-coral/10 border-coral/40' : 'bg-white/5 border-white/10'}`}>
                <div className="flex items-baseline justify-between flex-wrap gap-3">
                  <div>
                    <p className="text-[10px] uppercase tracking-widest font-bold text-white/50">
                      Δ preço final (v2 vs v1)
                    </p>
                    <p className={`text-3xl font-mono font-black mt-1 ${resultado.delta_pv_pct > 0 ? 'text-verde' : resultado.delta_pv_pct < 0 ? 'text-coral' : 'text-white'}`}>
                      {resultado.delta_pv_pct > 0 ? '+' : ''}{resultado.delta_pv_pct.toFixed(2)}%
                    </p>
                  </div>
                  <div className="text-right text-xs text-white/60 space-y-0.5">
                    <p>Linha: <strong className="text-white capitalize">{resultado.contexto.linha}</strong></p>
                    <p>Anexo Simples: <strong className="text-white">{resultado.contexto.anexo}</strong></p>
                    <p>RBT12: <strong className="text-white font-mono">{fmtBRL(resultado.contexto.rbt12)}</strong></p>
                  </div>
                </div>
              </div>

              {/* 2 colunas: v1 e v2 */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* v1 */}
                <div className="bg-white/[0.03] border border-white/10 rounded-xl overflow-hidden">
                  <p className="px-4 py-2.5 bg-white/5 text-[10px] uppercase tracking-widest font-bold text-white/60 border-b border-white/5">
                    Motor v1 (legado)
                  </p>
                  <div className="p-4 space-y-2 text-sm">
                    <Linha label="PV total" valor={fmtBRL(resultado.v1.pv_total)} destaque />
                    <Linha label="R$/Wp" valor={`R$ ${resultado.v1.reais_por_wp.toFixed(2)}`} />
                    <hr className="border-white/5 my-2" />
                    <Linha label="Kit WEG (× 0,4182)" valor={fmtBRL(resultado.v1.kit_com_fator)} />
                    <Linha label="Margem (20%)" valor={fmtBRL(resultado.v1.margem)} />
                    <Linha label="Comissão (5%)" valor={fmtBRL(resultado.v1.comissao_vendedor)} />
                    <Linha label="Imposto (15% s/ nota SPIN)" valor={fmtBRL(resultado.v1.impostos_simples)} />
                  </div>
                </div>

                {/* v2 */}
                <div className="bg-sol/[0.05] border border-sol/25 rounded-xl overflow-hidden">
                  <p className="px-4 py-2.5 bg-sol/10 text-[10px] uppercase tracking-widest font-bold text-sol border-b border-sol/20">
                    Motor v2 (Prompt 12)
                  </p>
                  <div className="p-4 space-y-2 text-sm">
                    <Linha label="PV total" valor={fmtBRL(resultado.v2.pv_total)} destaque />
                    <Linha label="R$/Wp" valor={`R$ ${resultado.v2.reais_por_wp.toFixed(2)}`}
                      chip={resultado.v2.piso_aplicado ? { label: 'piso aplicado', cor: 'bg-sol/20 text-sol' } : undefined} />
                    <hr className="border-white/5 my-2" />
                    <Linha label="Margem SPIN" valor={fmtBRL(resultado.v2.margem_spin)} />
                    <Linha label={`Comissão efetiva (${fmtPct(resultado.v2.comissao_efetiva)})`} valor={fmtBRL(resultado.v2.comissao_valor)} />
                    <Linha label={`Imposto (nominal ${fmtPct(resultado.v2.aliquota_nominal)} / efetivo ${fmtPct(resultado.v2.aliquota_efetiva)})`} valor={fmtBRL(resultado.v2.imposto_valor)} />
                    <Linha label="Fatia SPIN no PV" valor={fmtPct(resultado.v2.fatia_spin)} />
                  </div>

                  {resultado.v2.alertas.length > 0 && (
                    <div className="border-t border-sol/20 bg-sol/5 px-4 py-2 space-y-1">
                      {resultado.v2.alertas.map((a, i) => (
                        <p key={i} className="text-[11px] text-sol/80">⚠️ {a}</p>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </section>
  )
}

function Campo({ label, value, onChange, prefixo, sufixo }: {
  label: string; value: string; onChange: (s: string) => void; prefixo?: string; sufixo?: string
}) {
  return (
    <div>
      <label className="text-[10px] uppercase tracking-wider text-white/50 font-bold block mb-1">{label}</label>
      <div className="flex">
        {prefixo && (
          <span className="inline-flex items-center px-3 rounded-l-lg bg-white/5 border border-r-0 border-white/10 text-white/60 text-xs">
            {prefixo}
          </span>
        )}
        <input type="text" inputMode="decimal" value={value} onChange={(e) => onChange(e.target.value)}
          className={`flex-1 bg-white/5 border border-white/10 px-3 py-2 text-white text-sm font-mono focus:border-sol/50 focus:outline-none ${prefixo ? '' : 'rounded-l-lg'} ${sufixo ? '' : 'rounded-r-lg'}`} />
        {sufixo && (
          <span className="inline-flex items-center px-3 rounded-r-lg bg-white/5 border border-l-0 border-white/10 text-white/60 text-xs">
            {sufixo}
          </span>
        )}
      </div>
    </div>
  )
}

function Linha({ label, valor, destaque, chip }: {
  label: string; valor: string; destaque?: boolean
  chip?: { label: string; cor: string }
}) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className={`text-xs ${destaque ? 'text-white/80 font-bold' : 'text-white/60'}`}>{label}</span>
      <span className="flex items-center gap-2">
        {chip && (
          <span className={`text-[9px] uppercase tracking-wider font-bold px-1.5 py-0.5 rounded ${chip.cor}`}>
            {chip.label}
          </span>
        )}
        <span className={`font-mono ${destaque ? 'text-lg text-white font-black' : 'text-sm text-white/80'}`}>
          {valor}
        </span>
      </span>
    </div>
  )
}
