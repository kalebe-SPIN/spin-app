'use client'

import { useState, useMemo, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import {
  calcularInstalacaoPlacas,
  type EntradasInstalacaoPlacas,
  type ParametrosInstalacaoPlacas,
} from '@/lib/precificacao/servico-instalacao-placas'
import {
  OPCOES_TELHADO,
  OPCOES_PAVIMENTO,
  OPCOES_PROGRAMACAO,
} from '@/lib/precificacao/servico-retirada-recolocacao'
import { salvarServicoInstalacaoAction } from '@/app/projetos/[id]/servico-instalacao/actions'

type Props = {
  projetoId: string
  parametros: ParametrosInstalacaoPlacas
  entradasIniciais: EntradasInstalacaoPlacas | null
  valorFinalInicial: number | null
}

const DEFAULT: EntradasInstalacaoPlacas = {
  qtd_modulos: 12,
  qtd_strings: 1,
  tipo_telhado: 'fibrocimento',
  altura_telhado_m: 4,
  pavimento: 'terreo',
  km_deslocamento: 30,
  programacao: 'normal',
  qtd_instaladores: 2,
  dias_estimados: 2,
  precisa_cabo_novo: true,   // instalacao nova, cabo geralmente vai novo
  spin_assina_rt: true,       // padrao Spin assina pra homologacao CELESC
  precisa_padrao_novo: false,
  observacoes: '',
}

const OPT: React.CSSProperties = { backgroundColor: '#050B16', color: '#ffffff' }

export function ServicoInstalacaoForm({ projetoId, parametros, entradasIniciais, valorFinalInicial }: Props) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [msg, setMsg] = useState<string | null>(null)
  const [erro, setErro] = useState<string | null>(null)

  const [e, setE] = useState<EntradasInstalacaoPlacas>(entradasIniciais || DEFAULT)
  const resultado = useMemo(() => calcularInstalacaoPlacas(e, parametros), [e, parametros])
  const [ajuste, setAjuste] = useState<number>(
    valorFinalInicial != null ? valorFinalInicial - (entradasIniciais ? resultado.subtotal : 0) : 0,
  )
  const valorFinal = resultado.subtotal + ajuste

  function set<K extends keyof EntradasInstalacaoPlacas>(k: K, v: EntradasInstalacaoPlacas[K]) {
    setE({ ...e, [k]: v })
  }

  function salvar() {
    setMsg(null); setErro(null)
    startTransition(async () => {
      const res = await salvarServicoInstalacaoAction(projetoId, e, resultado, valorFinal)
      if ('erro' in res && res.erro) setErro(res.erro)
      else {
        setMsg('✓ Serviço salvo no projeto.')
        setTimeout(() => router.push(`/projetos/${projetoId}`), 800)
      }
    })
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      {/* Form */}
      <div className="lg:col-span-2 space-y-4">
        <Bloco titulo="Módulos e strings">
          <Num label="Qtd módulos" v={e.qtd_modulos} onChange={v => set('qtd_modulos', v)} />
          <Num label="Qtd strings" v={e.qtd_strings} onChange={v => set('qtd_strings', v)}
            hint="Pra calcular MC4 (1 par por string)" />
        </Bloco>

        <Bloco titulo="Local da instalação">
          <Select label="Tipo do telhado" v={e.tipo_telhado}
            onChange={v => set('tipo_telhado', v as any)} opcoes={OPCOES_TELHADO} />
          <Select label="Pavimento" v={e.pavimento}
            onChange={v => set('pavimento', v as any)} opcoes={OPCOES_PAVIMENTO} />
          <Num label="Altura telhado (m)" v={e.altura_telhado_m ?? 0} onChange={v => set('altura_telhado_m', v)} step={0.5} />
        </Bloco>

        <Bloco titulo="Logística">
          <Num label="KM base Spin → obra" v={e.km_deslocamento} onChange={v => set('km_deslocamento', v)} />
          <Num label="Qtd instaladores" v={e.qtd_instaladores} onChange={v => set('qtd_instaladores', v)} />
          <Num label="Dias estimados" v={e.dias_estimados} onChange={v => set('dias_estimados', v)} step={0.5} />
          <Select label="Programação" v={e.programacao}
            onChange={v => set('programacao', v as any)} opcoes={OPCOES_PROGRAMACAO} />
        </Bloco>

        <Bloco titulo="Materiais">
          <div className="col-span-2 space-y-2">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={e.precisa_cabo_novo}
                onChange={ev => set('precisa_cabo_novo', ev.target.checked)}
                className="w-4 h-4 accent-sol"
              />
              <span className="text-sm text-white">Comprar cabo solar novo</span>
            </label>
            <p className="text-[10px] text-white/50 pl-6">
              MC4, mangueira, suportes e parafusos SEMPRE são novos nesse serviço.
            </p>
          </div>
        </Bloco>

        <Bloco titulo="Serviços adicionais (opcionais)">
          <div className="col-span-2 space-y-2">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={e.spin_assina_rt}
                onChange={ev => set('spin_assina_rt', ev.target.checked)}
                className="w-4 h-4 accent-verde"
              />
              <span className="text-sm text-white">Spin assina o RT/ART (homologação CELESC)</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={e.precisa_padrao_novo}
                onChange={ev => set('precisa_padrao_novo', ev.target.checked)}
                className="w-4 h-4 accent-weg-azul"
              />
              <span className="text-sm text-white">Precisa padrão de entrada NOVO</span>
            </label>
          </div>
        </Bloco>

        <Bloco titulo="Observações">
          <div className="col-span-2">
            <textarea
              value={e.observacoes || ''}
              onChange={ev => set('observacoes', ev.target.value)}
              rows={3}
              placeholder="Kit trazido pelo cliente, particularidades da obra, prazo, etc..."
              className="w-full px-3 py-2 bg-noite border border-white/15 rounded text-white text-sm placeholder:text-white/30"
            />
          </div>
        </Bloco>
      </div>

      {/* Painel de calculo */}
      <div className="lg:sticky lg:top-6 lg:self-start space-y-4">
        <div className="bg-sol/5 border border-sol/30 rounded-xl p-5">
          <p className="text-xs uppercase tracking-wider font-bold text-sol mb-3">Preço calculado</p>

          <div className="space-y-1.5 text-sm text-white/80 mb-4">
            <Linha label="Mão de obra" v={resultado.mao_obra} />
            <Linha label="Deslocamento" v={resultado.deslocamento} />
            <Linha label="Diárias" v={resultado.diarias} />
            <Linha label="Materiais" v={resultado.materiais_total} />
            <Linha label="Extras (ART / padrão)" v={resultado.extras_total} />
          </div>

          <div className="border-t border-white/10 pt-3 mb-3">
            <div className="flex items-baseline justify-between mb-1">
              <span className="text-xs text-white/60">Subtotal (custo)</span>
              <span className="text-sm font-bold text-white">R$ {resultado.subtotal.toFixed(2)}</span>
            </div>

            <label className="text-[10px] uppercase text-white/50 block mt-3 mb-1">Ajuste manual (R$)</label>
            <input
              type="number"
              step={10}
              value={ajuste}
              onChange={ev => setAjuste(parseFloat(ev.target.value) || 0)}
              className="w-full px-2 py-1.5 bg-noite border border-white/15 rounded text-white text-sm"
              placeholder="Margem / comissão / desconto"
            />
          </div>

          <div className="p-3 bg-sol/20 rounded-lg">
            <p className="text-[10px] uppercase text-noite/80 font-bold">Valor final ao cliente</p>
            <p className="text-2xl font-black text-noite">R$ {valorFinal.toFixed(2)}</p>
          </div>

          <div className="mt-4 pt-3 border-t border-white/10">
            <p className="text-[10px] uppercase text-white/50 mb-2">Materiais detalhados</p>
            <div className="space-y-0.5 text-xs">
              <Mini label="MC4" v={resultado.materiais_mc4} />
              <Mini label="Mangueira" v={resultado.materiais_mangueira} />
              <Mini label="Suportes" v={resultado.materiais_suportes} />
              <Mini label="Parafusos" v={resultado.materiais_parafusos} />
              <Mini label={e.precisa_cabo_novo ? 'Cabo NOVO' : 'Cabo (reaproveita)'} v={resultado.materiais_cabo} />
            </div>
            {resultado.extras_total > 0 && (
              <>
                <p className="text-[10px] uppercase text-white/50 mt-3 mb-2">Extras</p>
                <div className="space-y-0.5 text-xs">
                  {resultado.extras_art > 0 && <Mini label="ART/RT" v={resultado.extras_art} />}
                  {resultado.extras_padrao > 0 && <Mini label="Padrão novo" v={resultado.extras_padrao} />}
                </div>
              </>
            )}
          </div>

          <button
            onClick={salvar}
            disabled={pending}
            className="w-full mt-4 px-4 py-3 bg-verde text-noite font-bold text-sm rounded-lg disabled:opacity-40"
          >
            {pending ? '⏳ Salvando...' : '✅ Salvar no projeto'}
          </button>
          {msg && <p className="text-xs text-verde mt-2">{msg}</p>}
          {erro && <p className="text-xs text-coral mt-2">⚠️ {erro}</p>}
        </div>

        <details className="bg-white/[0.02] border border-white/10 rounded-lg p-4">
          <summary className="text-xs font-bold text-white/60 cursor-pointer">
            📐 Memória de cálculo
          </summary>
          <div className="mt-3 space-y-1 text-[10px] font-mono text-white/60">
            {resultado.memoria_calculo.map((linha, i) => <p key={i}>{linha}</p>)}
          </div>
        </details>
      </div>
    </div>
  )
}

function Bloco({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <div className="p-4 bg-white/[0.03] border border-white/10 rounded-xl">
      <p className="text-xs uppercase tracking-wider font-bold text-sol mb-3">{titulo}</p>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">{children}</div>
    </div>
  )
}

function Num({ label, v, onChange, step = 1, hint }: {
  label: string; v: number; onChange: (n: number) => void; step?: number; hint?: string
}) {
  return (
    <div>
      <label className="text-[10px] uppercase text-white/50 block mb-1">{label}</label>
      <input
        type="number"
        step={step}
        value={v ?? 0}
        onChange={e => onChange(parseFloat(e.target.value) || 0)}
        className="w-full px-2 py-1.5 bg-noite border border-white/15 rounded text-white text-sm"
      />
      {hint && <p className="text-[9px] text-white/40 mt-1">{hint}</p>}
    </div>
  )
}

function Select({ label, v, onChange, opcoes }: {
  label: string; v: string; onChange: (v: string) => void; opcoes: Array<{ id: string; label: string; hint?: string }>
}) {
  return (
    <div>
      <label className="text-[10px] uppercase text-white/50 block mb-1">{label}</label>
      <select
        value={v}
        onChange={e => onChange(e.target.value)}
        className="w-full px-2 py-1.5 bg-noite border border-white/15 rounded text-white text-sm"
      >
        {opcoes.map(o => (
          <option key={o.id} value={o.id} style={OPT}>
            {o.label}{o.hint ? ` (${o.hint})` : ''}
          </option>
        ))}
      </select>
    </div>
  )
}

function Linha({ label, v }: { label: string; v: number }) {
  return (
    <div className="flex items-baseline justify-between">
      <span className="text-white/60">{label}</span>
      <span className="text-white font-mono">R$ {v.toFixed(2)}</span>
    </div>
  )
}

function Mini({ label, v }: { label: string; v: number }) {
  return (
    <div className="flex items-baseline justify-between text-white/70">
      <span>{label}</span>
      <span className={`font-mono ${v === 0 ? 'text-white/30' : ''}`}>R$ {v.toFixed(2)}</span>
    </div>
  )
}
