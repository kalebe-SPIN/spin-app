'use client'

import { useState, useTransition } from 'react'
import { salvarSemFaturaAction } from '@/app/projetos/[id]/fatura/sem-fatura-actions'

type Modo = 'qtd_placas' | 'geracao_anual' | 'geracao_media'

export function SemFaturaForm({
  projetoId,
  hspInicial = 4.5,
  hspLabel,
}: {
  projetoId: string
  hspInicial?: number
  hspLabel?: string
}) {
  const [modo, setModo] = useState<Modo>('qtd_placas')
  const [qtdPlacas, setQtdPlacas] = useState('10')
  const [geracaoAnual, setGeracaoAnual] = useState('6000')
  const [geracaoMedia, setGeracaoMedia] = useState('500')
  const [potWpPlaca, setPotWpPlaca] = useState(605)
  const [hsp, setHsp] = useState(hspInicial)
  const [observacao, setObservacao] = useState('')
  const [erro, setErro] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  // Estimativas em tempo real
  const parseNum = (s: string) => parseFloat(s.replace(',', '.')) || 0
  const qtdP = parseNum(qtdPlacas)
  const gAnual = parseNum(geracaoAnual)
  const gMedia = parseNum(geracaoMedia)

  let potCcEstimada = 0
  let placasEstimadas = 0
  let consumoMedioEstimado = 0
  let geracaoAnualEstimada = 0

  if (modo === 'qtd_placas' && qtdP > 0) {
    placasEstimadas = qtdP
    potCcEstimada = (qtdP * potWpPlaca) / 1000
    consumoMedioEstimado = potCcEstimada * hsp * 30 * 0.8
    geracaoAnualEstimada = consumoMedioEstimado * 12
  } else if (modo === 'geracao_anual' && gAnual > 0) {
    geracaoAnualEstimada = gAnual
    consumoMedioEstimado = gAnual / 12
    potCcEstimada = gAnual / (hsp * 365 * 0.8)
    placasEstimadas = Math.ceil((potCcEstimada * 1000) / potWpPlaca)
  } else if (modo === 'geracao_media' && gMedia > 0) {
    consumoMedioEstimado = gMedia
    geracaoAnualEstimada = gMedia * 12
    potCcEstimada = gMedia / (hsp * 30 * 0.8)
    placasEstimadas = Math.ceil((potCcEstimada * 1000) / potWpPlaca)
  }

  function salvar() {
    setErro(null)
    startTransition(async () => {
      const res = await salvarSemFaturaAction(projetoId, {
        origem: modo,
        qtd_placas: modo === 'qtd_placas' ? qtdP : undefined,
        geracao_anual_kwh: modo === 'geracao_anual' ? gAnual : undefined,
        geracao_media_kwh: modo === 'geracao_media' ? gMedia : undefined,
        potencia_wp_placa: potWpPlaca,
        hsp,
        observacao,
      })
      if (res && 'erro' in res && res.erro) setErro(res.erro)
    })
  }

  return (
    <div className="space-y-6">
      <div className="bg-sol/10 border border-sol/30 rounded-lg p-4 text-sm text-white/80">
        ⚡ <strong className="text-sol">Modo rápido:</strong> use quando o cliente quer valores estimados
        antes de compartilhar a fatura. Os dados aqui geram uma proposta preliminar — depois pode subir a
        fatura pra recalcular.
      </div>

      {hspLabel && (
        <div className="bg-verde/5 border border-verde/20 rounded-lg p-3 text-xs text-white/70">
          ☀️ <strong className="text-verde">HSP detectada pelo endereço:</strong> {hspLabel} · Baseado no
          Atlas Brasileiro de Energia Solar (INPE). Você pode ajustar em "Parâmetros técnicos" se precisar.
        </div>
      )}

      {/* Escolha do modo */}
      <div>
        <label className="text-xs uppercase tracking-wider font-bold text-sol block mb-3">
          Como você quer dimensionar?
        </label>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
          <ModoBtn atual={modo} valor="qtd_placas" onChange={setModo} emoji="☀️" label="Qtd de placas" desc="Cliente disse 'quero N placas'" />
          <ModoBtn atual={modo} valor="geracao_anual" onChange={setModo} emoji="📅" label="Geração anual" desc="Total em kWh/ano" />
          <ModoBtn atual={modo} valor="geracao_media" onChange={setModo} emoji="📊" label="Geração média" desc="Média mensal em kWh" />
        </div>
      </div>

      {/* Entrada por modo */}
      <div className="p-4 bg-white/[0.03] border border-white/10 rounded-lg">
        {modo === 'qtd_placas' && (
          <label className="block">
            <span className="text-xs uppercase text-white/50 font-bold block mb-1.5">Quantidade de placas</span>
            <input
              type="number"
              min={1}
              value={qtdPlacas}
              onChange={(e) => setQtdPlacas(e.target.value)}
              className="w-full px-3 py-2 bg-noite/40 border border-white/10 rounded-lg text-sm text-white"
              placeholder="ex: 10"
            />
          </label>
        )}
        {modo === 'geracao_anual' && (
          <label className="block">
            <span className="text-xs uppercase text-white/50 font-bold block mb-1.5">Geração anual desejada (kWh)</span>
            <input
              type="number"
              min={100}
              step={100}
              value={geracaoAnual}
              onChange={(e) => setGeracaoAnual(e.target.value)}
              className="w-full px-3 py-2 bg-noite/40 border border-white/10 rounded-lg text-sm text-white"
              placeholder="ex: 6000"
            />
          </label>
        )}
        {modo === 'geracao_media' && (
          <label className="block">
            <span className="text-xs uppercase text-white/50 font-bold block mb-1.5">Consumo/geração média mensal (kWh)</span>
            <input
              type="number"
              min={30}
              step={10}
              value={geracaoMedia}
              onChange={(e) => setGeracaoMedia(e.target.value)}
              className="w-full px-3 py-2 bg-noite/40 border border-white/10 rounded-lg text-sm text-white"
              placeholder="ex: 500"
            />
          </label>
        )}
      </div>

      {/* Parâmetros técnicos (avançado) */}
      <details className="p-4 bg-white/[0.02] border border-white/5 rounded-lg">
        <summary className="text-xs text-white/60 cursor-pointer hover:text-white/80">
          ⚙️ Parâmetros técnicos (avançado)
        </summary>
        <div className="mt-3 grid grid-cols-2 gap-3">
          <label className="block">
            <span className="text-[10px] uppercase text-white/50 font-bold block mb-1">Potência placa (Wp)</span>
            <input
              type="number"
              min={300}
              max={800}
              value={potWpPlaca}
              onChange={(e) => setPotWpPlaca(parseInt(e.target.value) || 605)}
              className="w-full px-2 py-1.5 bg-noite/40 border border-white/10 rounded text-xs text-white"
            />
          </label>
          <label className="block">
            <span className="text-[10px] uppercase text-white/50 font-bold block mb-1">HSP (h/dia)</span>
            <input
              type="number"
              min={3}
              max={7}
              step={0.1}
              value={hsp}
              onChange={(e) => setHsp(parseFloat(e.target.value) || 4.5)}
              className="w-full px-2 py-1.5 bg-noite/40 border border-white/10 rounded text-xs text-white"
            />
          </label>
        </div>
        <p className="text-[10px] text-white/40 mt-2">
          Padrões: WEG 605Wp · HSP 4,5h/dia (Grande Florianópolis). 20% de perdas embutidas.
        </p>
      </details>

      {/* Prévia dos cálculos */}
      {(placasEstimadas > 0 || potCcEstimada > 0) && (
        <div className="p-4 bg-verde/5 border border-verde/20 rounded-lg">
          <p className="text-xs uppercase tracking-wider font-bold text-verde mb-2">Estimativa preliminar</p>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
            <Info label="Placas" valor={`${placasEstimadas}`} unit="un" />
            <Info label="Potência CC" valor={potCcEstimada.toFixed(2)} unit="kWp" />
            <Info label="Consumo médio" valor={Math.round(consumoMedioEstimado).toString()} unit="kWh/mês" />
            <Info label="Geração anual" valor={Math.round(geracaoAnualEstimada).toString()} unit="kWh/ano" />
          </div>
        </div>
      )}

      {/* Observação */}
      <label className="block">
        <span className="text-xs uppercase text-white/50 font-bold block mb-1.5">Observação (opcional)</span>
        <textarea
          value={observacao}
          onChange={(e) => setObservacao(e.target.value)}
          rows={2}
          placeholder="Ex: cliente falou por telefone, quer proposta rápida pra comparar"
          className="w-full px-3 py-2 bg-noite/40 border border-white/10 rounded-lg text-sm text-white"
        />
      </label>

      {erro && (
        <div className="p-3 bg-coral/10 border border-coral/30 rounded-lg text-sm text-coral">
          ⚠️ {erro}
        </div>
      )}

      <button
        onClick={salvar}
        disabled={isPending}
        className="w-full px-4 py-3 bg-sol text-noite font-bold rounded-lg hover:bg-sol/90 disabled:opacity-50"
      >
        {isPending ? 'Salvando...' : 'Confirmar → Passo 3 Telhado'}
      </button>
    </div>
  )
}

function ModoBtn({ atual, valor, onChange, emoji, label, desc }: {
  atual: Modo; valor: Modo; onChange: (v: Modo) => void; emoji: string; label: string; desc: string
}) {
  const ativo = atual === valor
  return (
    <button
      type="button"
      onClick={() => onChange(valor)}
      className={`p-3 rounded-lg border text-left transition ${
        ativo
          ? 'bg-sol/10 border-sol/40'
          : 'bg-white/[0.02] border-white/10 hover:bg-white/5'
      }`}
    >
      <div className="text-lg mb-1">{emoji}</div>
      <p className={`text-sm font-bold ${ativo ? 'text-sol' : 'text-white/80'}`}>{label}</p>
      <p className="text-[10px] text-white/50 mt-0.5">{desc}</p>
    </button>
  )
}

function Info({ label, valor, unit }: { label: string; valor: string; unit: string }) {
  return (
    <div>
      <p className="text-[10px] uppercase text-white/50 mb-0.5">{label}</p>
      <p className="text-lg font-black text-white">
        {valor} <span className="text-[10px] font-normal text-white/50">{unit}</span>
      </p>
    </div>
  )
}
