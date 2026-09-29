'use client'

import { fmtNum } from '@/lib/formatters'
import { balancoCreditos, type SerieUc } from '@/lib/dimensionamento/meta-energia'

/**
 * Balanço de créditos de quem JÁ TEM geração (Kalebe 2026-09-29): cliente
 * que gera e precisa ampliar — pra zerar a fatura de novo ou pra incluir
 * novas UCs beneficiárias. Compara a energia INJETADA na rede com o consumo
 * a compensar (UC principal + beneficiárias do rateio, menos a taxa mínima
 * de cada uma). Mesma regra do Dimensionar/Kit (lib/dimensionamento/meta-energia).
 */
export function BalancoCreditosGD({
  series,
  geracao,
  temGeracao,
}: {
  series: SerieUc[]
  geracao: any | null
  temGeracao: boolean
}) {
  if (!series[0] || !temGeracao) return null
  const b = balancoCreditos(series)
  const saldoCreditos = Number(geracao?.saldo_creditos_kwh) || null

  if (!b) {
    return (
      <div className="p-4 rounded-lg bg-sol/5 border border-sol/30 text-xs text-white/70">
        ⚖️ Esta UC já tem geração, mas a análise não trouxe a energia injetada mês a mês.
        Use <strong className="text-white">📄 Trocar fatura</strong> e envie a fatura de novo (de preferência a que mostra a
        tabela <em>Geradora no Período</em>) pra ver o balanço de créditos.
        {saldoCreditos ? <span className="block mt-1">Saldo de créditos informado na fatura: <strong className="text-white">{fmtNum(saldoCreditos, 0)} kWh</strong>.</span> : null}
      </div>
    )
  }

  const estilo = b.status === 'deficitario'
    ? { borda: 'border-coral/40', fundo: 'bg-coral/5', cor: 'text-coral', icone: '🔴', rotulo: 'Deficitário' }
    : b.status === 'superavitario'
      ? { borda: 'border-verde/40', fundo: 'bg-verde/5', cor: 'text-verde', icone: '🟢', rotulo: 'Superavitário' }
      : { borda: 'border-sol/40', fundo: 'bg-sol/5', cor: 'text-sol', icone: '🟡', rotulo: 'Equilibrado' }
  const sinal = b.balanco_mes >= 0 ? '+' : '−'

  return (
    <div className={`rounded-xl border ${estilo.borda} ${estilo.fundo} p-4 space-y-3`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-bold text-white">⚖️ Balanço de créditos (geração × consumo)</h3>
        <span className={`text-xs font-bold uppercase tracking-wider ${estilo.cor}`}>{estilo.icone} {estilo.rotulo}</span>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        <Metrica rotulo="Injetado na rede" valor={`${fmtNum(b.injetado_medio, 0)} kWh/mês`}
          detalhe={`${fmtNum(b.injetado_medio * 12, 0)} kWh/ano · ${b.meses_com_injecao} ${b.meses_com_injecao === 1 ? 'mês' : 'meses'} com dado`} />
        <Metrica rotulo="Consumo a compensar" valor={`${fmtNum(b.compensavel, 0)} kWh/mês`}
          detalhe={`${fmtNum(b.consumo_total, 0)} consumidos − taxa mínima${series.length > 1 ? ` · ${series.length} UCs` : ''}`} />
        <Metrica rotulo="Balanço" valor={`${sinal}${fmtNum(Math.abs(b.balanco_mes), 0)} kWh/mês`}
          detalhe={`${sinal}${fmtNum(Math.abs(b.balanco_mes) * 12, 0)} kWh/ano`} cor={estilo.cor} />
        <Metrica rotulo="Saldo de créditos" valor={saldoCreditos ? `${fmtNum(saldoCreditos, 0)} kWh` : '—'}
          detalhe={geracao?.creditos_a_expirar_kwh
            ? `${fmtNum(Number(geracao.creditos_a_expirar_kwh), 0)} kWh expiram${geracao.creditos_expiram_em ? ` em ${geracao.creditos_expiram_em}` : ''}`
            : 'acumulado, segundo a fatura'} />
      </div>

      <p className="text-sm text-white/85">
        {b.status === 'deficitario' && (
          <>Faltam cerca de <strong className={estilo.cor}>{fmtNum(Math.abs(b.balanco_mes), 0)} kWh/mês</strong> pra zerar a fatura
            {series.length > 1 ? ' de todas as UCs' : ''}. Ampliação estimada: <strong className="text-white">~{fmtNum(b.ampliacao_kwp, 2)} kWp</strong>
            {' '}— o passo Dimensionar já usa esse número.</>
        )}
        {b.status === 'superavitario' && (
          <>Sobram cerca de <strong className={estilo.cor}>{fmtNum(Math.abs(b.balanco_mes), 0)} kWh/mês</strong> — dá pra incluir beneficiárias
            que consumam até isso (além da taxa mínima de cada uma) sem ampliar.</>
        )}
        {b.status === 'equilibrado' && (
          <>Geração e consumo estão equilibrados — qualquer consumo novo (ou nova beneficiária) já pede ampliação.</>
        )}
      </p>

      <p className="text-[10px] text-white/40 leading-relaxed">
        Sistema atual estimado pela injeção: ~{fmtNum(b.kwp_atual_estimado, 2)} kWp (conservador: o que a casa consome na hora da
        geração não aparece como injetado). Taxa mínima do grupo B: mono 30 · bi 50 · tri 100 kWh.
        Adicione beneficiárias acima pra ver o impacto no balanço.
      </p>
    </div>
  )
}

function Metrica({ rotulo, valor, detalhe, cor }: { rotulo: string; valor: string; detalhe: string; cor?: string }) {
  return (
    <div className="p-3 rounded-lg bg-noite/40 border border-white/10">
      <p className="text-[10px] uppercase tracking-wider font-bold text-white/45">{rotulo}</p>
      <p className={`text-base font-bold mt-0.5 ${cor || 'text-white'}`}>{valor}</p>
      <p className="text-[10px] text-white/45 mt-0.5">{detalhe}</p>
    </div>
  )
}
