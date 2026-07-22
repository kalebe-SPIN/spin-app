'use client'

import { useState, useMemo, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import {
  calcularLimpeza,
  type EntradasLimpeza,
  type ParametrosLimpeza,
} from '@/lib/precificacao/servico-limpeza'
import {
  OPCOES_TELHADO,
  OPCOES_PAVIMENTO,
  OPCOES_PROGRAMACAO,
} from '@/lib/precificacao/servico-retirada-recolocacao'
import { salvarServicoLimpezaAction } from '@/app/projetos/[id]/servico-limpeza/actions'

type Props = {
  projetoId: string
  parametros: ParametrosLimpeza
  entradasIniciais: EntradasLimpeza | null
  valorFinalInicial: number | null
}

const DEFAULT: EntradasLimpeza = {
  qtd_modulos: 20,
  tipo_telhado: 'fibrocimento',
  altura_telhado_m: 4,
  pavimento: 'terreo',
  km_deslocamento: 30,
  programacao: 'normal',
  qtd_instaladores: 2,
  dias_estimados: 1,
  tem_ponto_agua: true,
  tem_ponto_energia: true,
  observacoes: '',
}

const OPT: React.CSSProperties = { backgroundColor: '#050B16', color: '#ffffff' }

export function ServicoLimpezaForm({ projetoId, parametros, entradasIniciais, valorFinalInicial }: Props) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [msg, setMsg] = useState<string | null>(null)
  const [erro, setErro] = useState<string | null>(null)

  const [e, setE] = useState<EntradasLimpeza>(entradasIniciais || DEFAULT)
  const resultado = useMemo(() => calcularLimpeza(e, parametros), [e, parametros])
  const [ajuste, setAjuste] = useState<number>(
    valorFinalInicial != null ? valorFinalInicial - (entradasIniciais ? resultado.subtotal : 0) : 0,
  )
  const valorFinal = resultado.subtotal + ajuste

  function set<K extends keyof EntradasLimpeza>(k: K, v: EntradasLimpeza[K]) {
    setE({ ...e, [k]: v })
  }

  function salvar() {
    setMsg(null); setErro(null)
    startTransition(async () => {
      const res = await salvarServicoLimpezaAction(projetoId, e, resultado, valorFinal)
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
        <Bloco titulo="Módulos">
          <Num label="Qtd módulos" v={e.qtd_modulos} onChange={v => set('qtd_modulos', v)} />
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
          <Num label="Qtd técnicos" v={e.qtd_instaladores} onChange={v => set('qtd_instaladores', v)} />
          <Num label="Dias estimados" v={e.dias_estimados} onChange={v => set('dias_estimados', v)} step={0.5} />
          <Select label="Programação" v={e.programacao}
            onChange={v => set('programacao', v as any)} opcoes={OPCOES_PROGRAMACAO} />
        </Bloco>

        <Bloco titulo="💧 Ponto de água e energia no local">
          <div className="col-span-2 space-y-2">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={e.tem_ponto_agua}
                onChange={ev => set('tem_ponto_agua', ev.target.checked)}
                className="w-4 h-4 accent-verde"
              />
              <span className="text-sm text-white">
                <strong>Ponto de água disponível</strong> no local
              </span>
            </label>
            <p className="text-[10px] text-white/50 pl-6">
              Se desmarcar, sistema adiciona caminhão pipa (~R$ {parametros.valor_caminhao_pipa_diaria}/dia × {e.dias_estimados} dias).
              Estimativa consumo: {(e.qtd_modulos * parametros.litros_agua_por_modulo).toFixed(0)}L pra {e.qtd_modulos} módulos.
            </p>

            <label className="flex items-center gap-2 cursor-pointer mt-3">
              <input
                type="checkbox"
                checked={e.tem_ponto_energia}
                onChange={ev => set('tem_ponto_energia', ev.target.checked)}
                className="w-4 h-4 accent-verde"
              />
              <span className="text-sm text-white">
                <strong>Ponto de energia disponível</strong> (pra bomba pressurizada)
              </span>
            </label>
            <p className="text-[10px] text-white/50 pl-6">
              Se desmarcar, sistema adiciona gerador portátil (R$ {parametros.valor_gerador_diaria}/dia).
            </p>
          </div>
        </Bloco>

        <Bloco titulo="Observações">
          <div className="col-span-2">
            <textarea
              value={e.observacoes || ''}
              onChange={ev => set('observacoes', ev.target.value)}
              rows={3}
              placeholder="Sujidade específica, restrições de acesso, frequência sugerida..."
              className="w-full px-3 py-2 bg-noite border border-white/15 rounded text-white text-sm placeholder:text-white/30"
            />
          </div>
        </Bloco>
      </div>

      {/* Painel calculo */}
      <div className="lg:sticky lg:top-6 lg:self-start space-y-4">
        <div className="bg-sol/5 border border-sol/30 rounded-xl p-5">
          <p className="text-xs uppercase tracking-wider font-bold text-sol mb-3">Preço calculado</p>
          <div className="space-y-1.5 text-sm text-white/80 mb-4">
            <L label="Mão de obra" v={resultado.mao_obra} />
            <L label="Deslocamento" v={resultado.deslocamento} />
            <L label="Diárias" v={resultado.diarias} />
            <L label="Detergente" v={resultado.insumos_detergente} />
            <L label="EPI / ferramentas" v={resultado.insumos_epi} />
            {resultado.agua_pipa > 0 && <L label="💧 Caminhão pipa" v={resultado.agua_pipa} destaque />}
            {resultado.gerador > 0 && <L label="⚡ Gerador portátil" v={resultado.gerador} destaque />}
          </div>

          <div className="border-t border-white/10 pt-3 mb-3">
            <div className="flex items-baseline justify-between mb-1">
              <span className="text-xs text-white/60">Subtotal calculado</span>
              <span className="text-sm text-white">R$ {resultado.subtotal_calculado.toFixed(2)}</span>
            </div>
            {resultado.aplicou_visita_minima && (
              <p className="text-[10px] text-sol">⚠️ Cobrando visita mínima R$ {parametros.valor_minimo_visita.toFixed(2)}</p>
            )}
            <div className="flex items-baseline justify-between mt-2">
              <span className="text-xs text-white/60">Subtotal (com mínima)</span>
              <span className="text-sm font-bold text-white">R$ {resultado.subtotal.toFixed(2)}</span>
            </div>

            <label className="text-[10px] uppercase text-white/50 block mt-3 mb-1">Ajuste manual (R$)</label>
            <input
              type="number"
              step={10}
              value={ajuste}
              onChange={ev => setAjuste(parseFloat(ev.target.value) || 0)}
              className="w-full px-2 py-1.5 bg-noite border border-white/15 rounded text-white text-sm"
            />
          </div>

          <div className="p-3 bg-sol/20 rounded-lg">
            <p className="text-[10px] uppercase text-noite/80 font-bold">Valor final ao cliente</p>
            <p className="text-2xl font-black text-noite">R$ {valorFinal.toFixed(2)}</p>
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
          <summary className="text-xs font-bold text-white/60 cursor-pointer">📐 Memória de cálculo</summary>
          <div className="mt-3 space-y-1 text-[10px] font-mono text-white/60">
            {resultado.memoria_calculo.map((l, i) => <p key={i}>{l}</p>)}
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

function Num({ label, v, onChange, step = 1 }: { label: string; v: number; onChange: (n: number) => void; step?: number }) {
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
    </div>
  )
}

function Select({ label, v, onChange, opcoes }: {
  label: string; v: string; onChange: (v: string) => void; opcoes: Array<{ id: string; label: string; hint?: string }>
}) {
  return (
    <div>
      <label className="text-[10px] uppercase text-white/50 block mb-1">{label}</label>
      <select value={v} onChange={e => onChange(e.target.value)}
        className="w-full px-2 py-1.5 bg-noite border border-white/15 rounded text-white text-sm">
        {opcoes.map(o => (
          <option key={o.id} value={o.id} style={OPT}>
            {o.label}{o.hint ? ` (${o.hint})` : ''}
          </option>
        ))}
      </select>
    </div>
  )
}

function L({ label, v, destaque }: { label: string; v: number; destaque?: boolean }) {
  return (
    <div className={`flex items-baseline justify-between ${destaque ? 'text-sol' : ''}`}>
      <span className={destaque ? '' : 'text-white/60'}>{label}</span>
      <span className={`font-mono ${destaque ? 'font-bold' : 'text-white'}`}>R$ {v.toFixed(2)}</span>
    </div>
  )
}
