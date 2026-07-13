'use client'

import type { ComparativoFinanceiro as CF } from '@/lib/proposta/tipos'
import { formatarMoedaBRL } from '@/lib/formatters'

/**
 * A ESTRELA da proposta — mata as 3 objeções que sempre aparecem:
 *   1. "Vou pagar mais?" → Parcela vs Conta
 *   2. "Vou zerar a conta?" → O que continua com CELESC
 *   3. "Vs deixar aplicado?" → Rendimento comparado
 *
 * Renderizado em HTML pra html2canvas → PDF.
 */
export function ComparativoFinanceiro({ dados }: { dados: CF }) {
  const percEconomia = dados.contaAtualMensal > 0
    ? ((dados.contaAtualMensal - dados.parcelaSolarMensal - dados.totalContaPosSolarMensal) / dados.contaAtualMensal) * 100
    : 0

  return (
    <div className="p-8 bg-white text-gray-900">
      <div className="text-center mb-8">
        <h2 className="text-3xl font-black text-orange-500 mb-2">💰 Comparativo Financeiro</h2>
        <p className="text-sm text-gray-600">O que muda no seu bolso com energia solar Spin</p>
      </div>

      {/* ═══════════════ OBJEÇÃO 1: PARCELA VS CONTA ═══════════════ */}
      <section className="mb-8">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-8 h-8 rounded-full bg-orange-500 text-white flex items-center justify-center font-black">1</div>
          <h3 className="text-xl font-bold text-gray-800">Sua parcela vs sua conta hoje</h3>
        </div>

        <div className="grid grid-cols-3 gap-4 mb-4">
          <BarraComparativa
            label="Hoje você paga"
            valor={dados.contaAtualMensal}
            max={dados.contaAtualMensal}
            cor="bg-red-500"
            textoCor="text-red-700"
          />
          <BarraComparativa
            label="Parcela solar"
            valor={dados.parcelaSolarMensal}
            max={dados.contaAtualMensal}
            cor="bg-blue-500"
            textoCor="text-blue-700"
          />
          <BarraComparativa
            label="+ CELESC pós-solar"
            valor={dados.totalContaPosSolarMensal}
            max={dados.contaAtualMensal}
            cor="bg-gray-400"
            textoCor="text-gray-700"
          />
        </div>

        <div className={`p-4 rounded-lg text-center ${dados.economiaMensalDesdePrimeiroMes > 0 ? 'bg-green-50 border-2 border-green-500' : 'bg-yellow-50 border-2 border-yellow-500'}`}>
          <p className="text-xs uppercase font-bold text-gray-600 tracking-wider mb-1">
            {dados.economiaMensalDesdePrimeiroMes > 0 ? '✅ Você economiza desde o 1º mês' : '⚠️ Investimento nos primeiros meses'}
          </p>
          <p className={`text-3xl font-black ${dados.economiaMensalDesdePrimeiroMes > 0 ? 'text-green-600' : 'text-yellow-700'}`}>
            {formatarMoedaBRL(Math.abs(dados.economiaMensalDesdePrimeiroMes))} <span className="text-lg">/ mês</span>
          </p>
          {percEconomia > 0 && (
            <p className="text-xs text-gray-600 mt-1">
              Isso representa <strong>{percEconomia.toFixed(1)}%</strong> da sua conta atual
            </p>
          )}
        </div>
      </section>

      {/* ═══════════════ OBJEÇÃO 2: CELESC PÓS-SOLAR ═══════════════ */}
      <section className="mb-8">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-8 h-8 rounded-full bg-orange-500 text-white flex items-center justify-center font-black">2</div>
          <h3 className="text-xl font-bold text-gray-800">O que continua com a CELESC</h3>
        </div>

        <div className="bg-blue-50 border-l-4 border-blue-500 p-4 mb-4">
          <p className="text-sm text-gray-700">
            <strong className="text-blue-800">Transparência total:</strong> mesmo com solar, você continua com um valor mensal fixo pra CELESC.
            Diferente do que muita gente promete, sua conta NÃO fica zero — mas cai muito.
          </p>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="p-4 bg-gray-100 rounded-lg">
            <p className="text-xs uppercase font-bold text-gray-500 mb-1">Taxa mínima disponibilidade</p>
            <p className="text-2xl font-black text-gray-800">{formatarMoedaBRL(dados.taxaMinimaDisponibilidade)}</p>
            <p className="text-[10px] text-gray-500 mt-1">Independente da geração — sempre pago</p>
          </div>
          <div className="p-4 bg-gray-100 rounded-lg">
            <p className="text-xs uppercase font-bold text-gray-500 mb-1">Fio B sobre geração (Lei 14.300)</p>
            <p className="text-2xl font-black text-gray-800">{formatarMoedaBRL(dados.fioBCompensadoMensal)}</p>
            <p className="text-[10px] text-gray-500 mt-1">Aumenta progressivamente até 2030</p>
          </div>
        </div>

        <div className="mt-4 p-4 bg-gray-900 text-white rounded-lg text-center">
          <p className="text-xs uppercase font-bold tracking-wider mb-1">Total sua nova conta CELESC</p>
          <p className="text-3xl font-black text-orange-400">{formatarMoedaBRL(dados.totalContaPosSolarMensal)} / mês</p>
          <p className="text-xs text-gray-300 mt-2">
            Vs. {formatarMoedaBRL(dados.contaAtualMensal)} que você paga hoje —
            <strong className="text-green-400"> {(((dados.contaAtualMensal - dados.totalContaPosSolarMensal) / dados.contaAtualMensal) * 100).toFixed(0)}% menor</strong>
          </p>
        </div>
      </section>

      {/* ═══════════════ OBJEÇÃO 3: RENDIMENTO À VISTA ═══════════════ */}
      <section>
        <div className="flex items-center gap-3 mb-4">
          <div className="w-8 h-8 rounded-full bg-orange-500 text-white flex items-center justify-center font-black">3</div>
          <h3 className="text-xl font-bold text-gray-800">Se você pagar à vista — quanto renderia?</h3>
        </div>

        <div className="bg-yellow-50 border-l-4 border-yellow-500 p-4 mb-4">
          <p className="text-sm text-gray-700">
            Compare o retorno do investimento em solar contra deixar o mesmo dinheiro aplicado.
            Solar tem retorno <strong>real</strong> (você economiza + o sistema se valoriza no imóvel).
          </p>
        </div>

        <div className="grid grid-cols-3 gap-3 mb-4">
          <CardRendimento
            label="☀️ Solar Spin"
            valor={dados.retornoSolarPercAA}
            highlight
            desc="Retorno real (economia + valorização)"
          />
          <CardRendimento
            label="📊 CDI/CDB"
            valor={dados.rendimentoCDIPercAA}
            desc="Bruto — tributado depois"
          />
          <CardRendimento
            label="🏦 Poupança"
            valor={dados.rendimentoPoupancaPercAA}
            desc="Sem valorização real"
          />
        </div>

        <div className="p-5 bg-gradient-to-r from-orange-500 to-orange-600 text-white rounded-lg">
          <div className="grid grid-cols-2 gap-4 items-center">
            <div>
              <p className="text-xs uppercase font-bold opacity-90 mb-1">Economia total em 25 anos</p>
              <p className="text-4xl font-black">{formatarMoedaBRL(dados.economia25Anos)}</p>
              <p className="text-xs opacity-90 mt-1">Considerando inflação energética + degradação das placas</p>
            </div>
            <div className="text-right">
              <p className="text-xs uppercase font-bold opacity-90 mb-1">Payback</p>
              <p className="text-4xl font-black">{dados.paybackAnos.toFixed(1)} <span className="text-2xl">anos</span></p>
              <p className="text-xs opacity-90 mt-1">Depois disso é 100% lucro</p>
            </div>
          </div>
        </div>
      </section>
    </div>
  )
}

function BarraComparativa({ label, valor, max, cor, textoCor }: {
  label: string; valor: number; max: number; cor: string; textoCor: string
}) {
  const pct = Math.max(5, Math.min(100, (valor / max) * 100))
  return (
    <div className="text-center">
      <p className="text-xs uppercase font-bold text-gray-500 mb-2 h-8">{label}</p>
      <div className="relative h-32 bg-gray-100 rounded-lg overflow-hidden flex items-end">
        <div className={`w-full ${cor} transition-all`} style={{ height: `${pct}%` }} />
      </div>
      <p className={`text-lg font-black mt-2 ${textoCor}`}>{formatarMoedaBRL(valor)}</p>
    </div>
  )
}

function CardRendimento({ label, valor, desc, highlight }: {
  label: string; valor: number; desc: string; highlight?: boolean
}) {
  return (
    <div className={`p-4 rounded-lg text-center ${
      highlight ? 'bg-green-500 text-white shadow-lg' : 'bg-gray-100 text-gray-800'
    }`}>
      <p className={`text-xs uppercase font-bold mb-1 ${highlight ? 'opacity-95' : 'text-gray-500'}`}>
        {label}
      </p>
      <p className="text-3xl font-black mb-1">
        {valor.toFixed(1)}<span className="text-lg">%</span>
      </p>
      <p className={`text-[10px] ${highlight ? 'opacity-90' : 'text-gray-500'}`}>
        ao ano
      </p>
      <p className={`text-[9px] mt-2 ${highlight ? 'opacity-80' : 'text-gray-500'}`}>{desc}</p>
    </div>
  )
}
