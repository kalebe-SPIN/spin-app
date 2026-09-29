import { fmtNum } from '@/lib/formatters'

/**
 * Gráfico do passo Fatura: consumo de cada UC (linhas) + energia injetada
 * na rede pela geradora (barras verdes) + média consolidada. Usado na tela
 * e na imagem que vai pro cliente pelo WhatsApp (Kalebe 2026-09-29).
 */

const MESES = ['JAN', 'FEV', 'MAR', 'ABR', 'MAI', 'JUN', 'JUL', 'AGO', 'SET', 'OUT', 'NOV', 'DEZ']

function chaveMes(mesAno: string): number | null {
  const m = String(mesAno || '').toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g, '').match(/([A-Z]{3})\W*(\d{2,4})/)
  if (!m) return null
  const i = MESES.indexOf(m[1])
  if (i < 0) return null
  const ano = Number(m[2]) < 100 ? 2000 + Number(m[2]) : Number(m[2])
  return ano * 12 + i
}

/** A CELESC lista do mês mais novo pro mais antigo — o gráfico lê da esquerda (antigo) pra direita. */
export function ordemCronologica<T extends { mes_ano?: string }>(lista: T[]): T[] {
  if (!Array.isArray(lista) || lista.length < 2) return lista || []
  const a = chaveMes(lista[0]?.mes_ano || '')
  const b = chaveMes(lista[lista.length - 1]?.mes_ano || '')
  return a !== null && b !== null && a > b ? [...lista].reverse() : lista
}

export function GraficoConsumoInjetado({ series, injetado, legendaMedia = 'Média consolidada', semMoldura = false }: {
  series: Array<{ uc: string; cor: string; historico: any[]; media: number }>
  injetado?: Array<number | null>
  legendaMedia?: string
  semMoldura?: boolean
}) {
  const W = 720, H = 260
  const paddingLeft = 48, paddingRight = 16, paddingTop = 24, paddingBottom = 40
  const plotW = W - paddingLeft - paddingRight
  const plotH = H - paddingTop - paddingBottom

  const todosPontos = [
    ...series.flatMap(s => s.historico.map(h => Number(h.consumo_kwh) || 0)),
    ...(injetado || []).map((v) => Number(v) || 0),
  ]
  const maxKwh = Math.max(...todosPontos, 0) * 1.1
  const nMeses = Math.max(...series.map(s => s.historico.length))
  const larguraBarra = Math.max(8, Math.min(28, (plotW / Math.max(nMeses, 1)) * 0.45))

  const yPixel = (kwh: number) => paddingTop + plotH - (maxKwh > 0 ? (kwh / maxKwh) * plotH : 0)
  const xPixel = (idx: number) => paddingLeft + (nMeses > 1 ? (idx / (nMeses - 1)) * plotW : plotW / 2)
  const yTicks = [0, 0.33, 0.66, 1].map(f => Math.round(maxKwh * f))

  // Média consolidada = soma das médias
  const mediaConsolidada = series.reduce((sum, s) => sum + s.media, 0)

  const svg = (
    <svg viewBox={`0 0 ${W} ${H}`} className={semMoldura ? 'w-full h-auto' : 'w-full h-auto min-w-[600px]'}>
      {/* Grid + labels Y */}
      {yTicks.map((tick, i) => (
        <g key={i}>
          <line x1={paddingLeft} y1={yPixel(tick)} x2={W - paddingRight} y2={yPixel(tick)} stroke="rgba(255,255,255,0.06)" strokeWidth="1" />
          <text x={paddingLeft - 8} y={yPixel(tick) + 4} fontSize="10" fill="rgba(255,255,255,0.4)" textAnchor="end" fontFamily="system-ui">
            {fmtNum(tick, 0)}
          </text>
        </g>
      ))}

      {/* Injetado na rede (barras atrás das linhas de consumo) */}
      {(injetado || []).map((v, i) => (v !== null && v > 0 ? (
        <g key={`inj-${i}`}>
          <rect
            x={xPixel(i) - larguraBarra / 2} y={yPixel(v)}
            width={larguraBarra} height={Math.max(0, yPixel(0) - yPixel(v))}
            fill="rgba(95,207,128,0.28)" stroke="#5FCF80" strokeWidth="1" rx="2"
          />
          <text x={xPixel(i)} y={yPixel(v) - 4} fontSize="9" fill="#5FCF80" textAnchor="middle" fontFamily="system-ui">
            {fmtNum(v, 0)}
          </text>
        </g>
      ) : null))}

      {/* Linha média consolidada */}
      {mediaConsolidada > 0 && (
        <>
          <line x1={paddingLeft} y1={yPixel(mediaConsolidada)} x2={W - paddingRight} y2={yPixel(mediaConsolidada)} stroke="#FFB94D" strokeWidth="2" strokeDasharray="6 4" />
          <text x={W - paddingRight - 4} y={yPixel(mediaConsolidada) - 6} fontSize="10" fill="#FFB94D" textAnchor="end" fontWeight="bold" fontFamily="system-ui">
            {legendaMedia} — {fmtNum(mediaConsolidada, 0)} kWh
          </text>
        </>
      )}

      {/* Cada série (UC) uma linha */}
      {series.map((s, si) => {
        const path = s.historico
          .map((h, i) => `${i === 0 ? 'M' : 'L'} ${xPixel(i)} ${yPixel(Number(h.consumo_kwh) || 0)}`)
          .join(' ')
        return (
          <g key={si}>
            <path d={path} fill="none" stroke={s.cor} strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
            {s.historico.map((h, i) => (
              <circle key={i} cx={xPixel(i)} cy={yPixel(Number(h.consumo_kwh) || 0)} r="3.5" fill={s.cor} stroke="#0B0F1A" strokeWidth="1.5" />
            ))}
          </g>
        )
      })}

      {/* Labels do eixo X (usar meses da série principal) */}
      {series[0]?.historico.map((h, i) => (
        <text key={i} x={xPixel(i)} y={H - paddingBottom + 16} fontSize="10" fill="rgba(255,255,255,0.5)" textAnchor="middle" fontFamily="system-ui">
          {h.mes_ano}
        </text>
      ))}
    </svg>
  )

  if (semMoldura) return svg
  return <div className="overflow-x-auto bg-white/[0.03] border border-white/10 rounded-lg p-4">{svg}</div>
}
