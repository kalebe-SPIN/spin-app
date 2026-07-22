'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { salvarParametrosServicoAction } from '@/app/admin/precificacao/servicos/actions'

type Props = {
  chave: string
  nome: string
  descricao: string | null
  parametrosIniciais: any
}

export function PainelPrecificacaoServicosClient({ chave, nome, descricao, parametrosIniciais }: Props) {
  const router = useRouter()
  const [params, setParams] = useState<any>(parametrosIniciais)
  const [pending, startTransition] = useTransition()
  const [msg, setMsg] = useState<string | null>(null)
  const [erro, setErro] = useState<string | null>(null)

  function setNum(chave: string, valor: string) {
    setParams({ ...params, [chave]: parseFloat(valor) || 0 })
  }
  function setNested(grupo: string, chave: string, valor: string) {
    setParams({
      ...params,
      [grupo]: { ...(params[grupo] || {}), [chave]: parseFloat(valor) || 0 },
    })
  }

  function salvar() {
    setMsg(null)
    setErro(null)
    startTransition(async () => {
      const res = await salvarParametrosServicoAction(chave, params)
      if ('erro' in res && res.erro) setErro(res.erro)
      else {
        setMsg('✓ Parâmetros salvos. Novas propostas vão usar esses valores.')
        router.refresh()
      }
    })
  }

  return (
    <div className="bg-white/[0.03] border border-white/10 rounded-xl p-6">
      <div className="mb-5">
        <h2 className="text-xl font-bold text-white">{nome}</h2>
        {descricao && <p className="text-sm text-white/60 mt-1">{descricao}</p>}
      </div>

      {/* Mao de obra */}
      <Bloco titulo="Mão de obra por módulo">
        <Field label="Retirada (R$/módulo)" valor={params.mao_obra_retirada_por_modulo}
          onChange={v => setNum('mao_obra_retirada_por_modulo', v)} />
        <Field label="Recolocação (R$/módulo)" valor={params.mao_obra_recolocacao_por_modulo}
          onChange={v => setNum('mao_obra_recolocacao_por_modulo', v)} />
      </Bloco>

      {/* Fator telhado */}
      <Bloco titulo="Fator multiplicador por tipo de telhado" hint="Multiplica a mão de obra. 1.0 = neutro. Valores altos = mais complexo/perigoso.">
        {Object.entries(params.fator_telhado || {}).map(([tipo, val]) => (
          <Field key={tipo} label={cap(tipo)} valor={val as number} step={0.1}
            onChange={v => setNested('fator_telhado', tipo, v)} />
        ))}
      </Bloco>

      {/* Fator pavimento */}
      <Bloco titulo="Fator por pavimento" hint="Térreo é fácil, prédio alto exige andaimes/plataformas.">
        {Object.entries(params.fator_pavimento || {}).map(([tipo, val]) => (
          <Field key={tipo} label={cap(tipo).replace('_ou_mais', ' ou +')} valor={val as number} step={0.1}
            onChange={v => setNested('fator_pavimento', tipo, v)} />
        ))}
      </Bloco>

      {/* Fator programacao */}
      <Bloco titulo="Fator por programação" hint="Feriado, noite ou urgência custam mais.">
        {Object.entries(params.fator_programacao || {}).map(([tipo, val]) => (
          <Field key={tipo} label={cap(tipo)} valor={val as number} step={0.1}
            onChange={v => setNested('fator_programacao', tipo, v)} />
        ))}
      </Bloco>

      {/* Deslocamento e diarias */}
      <Bloco titulo="Deslocamento e diárias">
        <Field label="KM rodado (R$/km)" valor={params.valor_km_rodado}
          onChange={v => setNum('valor_km_rodado', v)} />
        <Field label="Diária instalador (R$)" valor={params.diaria_instalador}
          onChange={v => setNum('diaria_instalador', v)} />
        <Field label="Realocação temporária (R$/metro)" valor={params.valor_realocacao_por_metro}
          onChange={v => setNum('valor_realocacao_por_metro', v)} />
      </Bloco>

      {/* Materiais */}
      <Bloco titulo="Materiais consumíveis (R$)" hint="MC4 e mangueira SEMPRE novos. Suporte só se telhado mudou; cabo só se cliente pedir novo.">
        <Field label="Par MC4" valor={params.par_mc4}
          onChange={v => setNum('par_mc4', v)} />
        <Field label="Mangueira corrugada (metro)" valor={params.mangueira_corrugada_metro}
          onChange={v => setNum('mangueira_corrugada_metro', v)} />
        <Field label="Suporte fixação (unidade)" valor={params.suporte_fixacao_unidade}
          onChange={v => setNum('suporte_fixacao_unidade', v)} />
        <Field label="Cabo solar 6mm² (metro)" valor={params.cabo_solar_6mm_metro}
          onChange={v => setNum('cabo_solar_6mm_metro', v)} />
      </Bloco>

      {/* Estimativas de calculo */}
      <Bloco titulo="Fatores de cálculo estimados" hint="Consumo médio por módulo pra estimar materiais. Ajuste conforme sua realidade.">
        <Field label="Mangueira por módulo (m)" valor={params.metros_mangueira_por_modulo} step={0.1}
          onChange={v => setNum('metros_mangueira_por_modulo', v)} />
        <Field label="Suportes por módulo (média)" valor={params.suportes_por_modulo} step={0.1}
          onChange={v => setNum('suportes_por_modulo', v)} />
        <Field label="Cabo por módulo estimado (m)" valor={params.metros_cabo_estimado_por_modulo} step={0.5}
          onChange={v => setNum('metros_cabo_estimado_por_modulo', v)} />
      </Bloco>

      <div className="flex items-center gap-3 mt-5">
        <button
          onClick={salvar}
          disabled={pending}
          className="px-6 py-2.5 bg-sol text-noite font-bold text-sm rounded-lg disabled:opacity-40"
        >
          {pending ? '⏳ Salvando...' : '💾 Salvar parâmetros'}
        </button>
        {msg && <span className="text-sm text-verde">{msg}</span>}
        {erro && <span className="text-sm text-coral">⚠️ {erro}</span>}
      </div>
    </div>
  )
}

function Bloco({ titulo, hint, children }: { titulo: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="mb-4 p-4 bg-white/[0.02] border border-white/10 rounded-lg">
      <p className="text-xs uppercase tracking-wider font-bold text-sol mb-1">{titulo}</p>
      {hint && <p className="text-[10px] text-white/50 mb-3">{hint}</p>}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
        {children}
      </div>
    </div>
  )
}

function Field({
  label, valor, step = 0.01, onChange,
}: { label: string; valor: number; step?: number; onChange: (v: string) => void }) {
  return (
    <div>
      <label className="text-[10px] uppercase text-white/50 block mb-1">{label}</label>
      <input
        type="number"
        step={step}
        value={valor ?? 0}
        onChange={e => onChange(e.target.value)}
        className="w-full px-2 py-1.5 bg-noite border border-white/15 rounded text-white text-sm"
      />
    </div>
  )
}

function cap(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1).replace(/_/g, ' ')
}
