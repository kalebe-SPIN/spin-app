'use client'

/**
 * Gráfico de linhas do consumo mensal + linha da média (ponto de equilíbrio).
 *
 * A média representa quanto a geração solar precisa entregar em média por mês
 * pra "empatar" o consumo do cliente ao longo do ano.
 */

type Ponto = {
  mes_ano: string
  consumo_kwh: number
}

type Props = {
  historico: Ponto[]
  media: number
}

export function HistoricoConsumo({ historico, media }: Props) {
  if (!Array.isArray(historico) || historico.length === 0) return null

  // Ordem: da fatura CELESC vem do mais antigo → mais recente
  const pontos = historico.filter(p => Number(p.consumo_kwh) > 0)
  if (pontos.length === 0) return null

  // Dimensões do SVG
  const W = 720
  const H = 240
  const paddingLeft = 48
  const paddingRight = 16
  const paddingTop = 24
  const paddingBottom = 40
  const plotW = W - paddingLeft - paddingRight
  const plotH = H - paddingTop - paddingBottom

  // Valores min/max pra escala Y
  const valores = pontos.map(p => Number(p.consumo_kwh))
  const maxKwh = Math.max(...valores, media) * 1.1
  const minKwh = 0

  // Função pra converter valor kWh em pixel Y
  const yPixel = (kwh: number) => paddingTop + plotH - ((kwh - minKwh) / (maxKwh - minKwh)) * plotH

  // Função pra converter índice em pixel X
  const xPixel = (idx: number) =>
    paddingLeft + (pontos.length > 1 ? (idx / (pontos.length - 1)) * plotW : plotW / 2)

  // Path da linha do consumo
  const linha = pontos
    .map((p, i) => `${i === 0 ? 'M' : 'L'} ${xPixel(i)} ${yPixel(p.consumo_kwh)}`)
    .join(' ')

  // Ticks do eixo Y (4 divisões)
  const yTicks = [0, 0.33, 0.66, 1].map(f => Math.round(maxKwh * f))

  // Máximo real (não escalado)
  const maxReal = Math.max(...valores)
  const minReal = Math.min(...valores)

  return (
    <div className="bg-white/[0.03] border border-white/10 rounded-lg p-4">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-bold text-white flex items-center gap-2">
          📊 Consumo mês a mês
          <span className="text-xs font-normal text-white/40">({pontos.length} meses)</span>
        </h3>
        <div className="flex items-center gap-4 text-xs">
          <span className="flex items-center gap-1.5">
            <span className="w-3 h-0.5 bg-weg-azul"></span>
            <span className="text-white/60">Consumo</span>
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-3 h-0.5 border-t-2 border-dashed border-sol"></span>
            <span className="text-white/60">Média = {Math.round(media)} kWh</span>
          </span>
        </div>
      </div>

      <div className="overflow-x-auto">
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto min-w-[600px]">
          {/* Grid horizontal */}
          {yTicks.map((tick, i) => (
            <g key={i}>
              <line
                x1={paddingLeft}
                y1={yPixel(tick)}
                x2={W - paddingRight}
                y2={yPixel(tick)}
                stroke="rgba(255,255,255,0.06)"
                strokeWidth="1"
              />
              <text
                x={paddingLeft - 8}
                y={yPixel(tick) + 4}
                fontSize="10"
                fill="rgba(255,255,255,0.4)"
                textAnchor="end"
                fontFamily="system-ui, sans-serif"
              >
                {tick}
              </text>
            </g>
          ))}

          {/* Área sob a curva (leve) */}
          <path
            d={`${linha} L ${xPixel(pontos.length - 1)} ${yPixel(0)} L ${xPixel(0)} ${yPixel(0)} Z`}
            fill="rgba(88,127,255,0.08)"
          />

          {/* Linha da média (ponto de equilíbrio) */}
          <line
            x1={paddingLeft}
            y1={yPixel(media)}
            x2={W - paddingRight}
            y2={yPixel(media)}
            stroke="#FFB94D"
            strokeWidth="2"
            strokeDasharray="6 4"
          />
          <text
            x={W - paddingRight - 4}
            y={yPixel(media) - 6}
            fontSize="10"
            fill="#FFB94D"
            textAnchor="end"
            fontWeight="bold"
            fontFamily="system-ui, sans-serif"
          >
            Média — ponto de equilíbrio
          </text>

          {/* Linha do consumo */}
          <path
            d={linha}
            fill="none"
            stroke="#587FFF"
            strokeWidth="2.5"
            strokeLinejoin="round"
            strokeLinecap="round"
          />

          {/* Pontos + rótulos de valor */}
          {pontos.map((p, i) => {
            const cx = xPixel(i)
            const cy = yPixel(p.consumo_kwh)
            const acima = p.consumo_kwh > media
            return (
              <g key={i}>
                <circle
                  cx={cx}
                  cy={cy}
                  r="4"
                  fill={acima ? '#F17A5C' : '#5FCF80'}
                  stroke="#0B0F1A"
                  strokeWidth="2"
                />
                <text
                  x={cx}
                  y={cy - 12}
                  fontSize="9"
                  fill="white"
                  textAnchor="middle"
                  fontFamily="system-ui, sans-serif"
                >
                  {Math.round(p.consumo_kwh)}
                </text>
              </g>
            )
          })}

          {/* Rótulos do eixo X (meses) */}
          {pontos.map((p, i) => (
            <text
              key={i}
              x={xPixel(i)}
              y={H - paddingBottom + 16}
              fontSize="10"
              fill="rgba(255,255,255,0.5)"
              textAnchor="middle"
              fontFamily="system-ui, sans-serif"
            >
              {p.mes_ano}
            </text>
          ))}
        </svg>
      </div>

      {/* Sumário embaixo */}
      <div className="grid grid-cols-3 gap-3 mt-4 pt-4 border-t border-white/5">
        <div>
          <p className="text-[10px] uppercase tracking-wider text-white/40">Mínimo</p>
          <p className="text-sm font-bold text-verde">{Math.round(minReal)} kWh</p>
        </div>
        <div>
          <p className="text-[10px] uppercase tracking-wider text-white/40">Média (linha amarela)</p>
          <p className="text-sm font-bold text-sol">{Math.round(media)} kWh/mês</p>
        </div>
        <div>
          <p className="text-[10px] uppercase tracking-wider text-white/40">Máximo</p>
          <p className="text-sm font-bold text-coral">{Math.round(maxReal)} kWh</p>
        </div>
      </div>

      <p className="text-[10px] text-white/40 mt-4 leading-relaxed">
        <strong className="text-white/60">Ponto de equilíbrio:</strong> a linha amarela representa
        quanto o sistema fotovoltaico precisa entregar em média por mês pra empatar o consumo do
        cliente ao longo do ano. Meses com barra vermelha ficam <strong>acima</strong> da média
        (déficit), verdes ficam <strong>abaixo</strong> (superávit / crédito de geração).
      </p>
    </div>
  )
}
