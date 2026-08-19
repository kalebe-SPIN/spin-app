'use client'

/**
 * Gráfico de pizza em SVG puro. Zero dependência.
 * Recebe uma lista de fatias e desenha arcos usando trigonometria.
 *
 * - `fatias`: valor > 0. Fatias com valor 0 são ignoradas.
 * - `tamanho`: diâmetro em px (default 180).
 * - `donut`: se true, deixa um furo no meio (default false).
 * - `legenda`: se true, renderiza legenda à direita com %.
 */
export type FatiaPizza = {
  rotulo: string
  valor: number
  cor: string
}

export function GraficoPizza({
  fatias,
  tamanho = 180,
  donut = false,
  legenda = true,
  fmtValor,
}: {
  fatias: FatiaPizza[]
  tamanho?: number
  donut?: boolean
  legenda?: boolean
  fmtValor?: (v: number) => string
}) {
  const validas = fatias.filter((f) => f.valor > 0)
  const total = validas.reduce((s, f) => s + f.valor, 0)
  const cx = tamanho / 2
  const cy = tamanho / 2
  const r = tamanho / 2 - 2
  const rInner = donut ? r * 0.55 : 0

  const fmt = fmtValor || ((v: number) => v.toLocaleString('pt-BR'))

  if (total === 0) {
    return (
      <div className="flex items-center justify-center rounded-xl border border-dashed border-white/15 p-6 text-xs text-white/40" style={{ minHeight: tamanho }}>
        Sem faturamento ainda neste mês
      </div>
    )
  }

  // Uma única fatia — desenha círculo cheio (svg arc não fecha em 360°)
  if (validas.length === 1) {
    const f = validas[0]
    return (
      <div className="flex items-center gap-5">
        <svg width={tamanho} height={tamanho} viewBox={`0 0 ${tamanho} ${tamanho}`}>
          <circle cx={cx} cy={cy} r={r} fill={f.cor} />
          {donut && <circle cx={cx} cy={cy} r={rInner} fill="#0F1825" />}
        </svg>
        {legenda && (
          <div className="flex-1">
            <LegendaLinha rotulo={f.rotulo} cor={f.cor} valor={fmt(f.valor)} pct={100} />
          </div>
        )}
      </div>
    )
  }

  // Múltiplas fatias — desenha arcos
  let anguloAcumulado = -Math.PI / 2  // começa no topo
  const paths = validas.map((f) => {
    const angulo = (f.valor / total) * Math.PI * 2
    const inicio = anguloAcumulado
    const fim = anguloAcumulado + angulo
    anguloAcumulado = fim

    const x1 = cx + r * Math.cos(inicio)
    const y1 = cy + r * Math.sin(inicio)
    const x2 = cx + r * Math.cos(fim)
    const y2 = cy + r * Math.sin(fim)

    const largo = angulo > Math.PI ? 1 : 0
    const path = donut
      ? [
          `M ${x1} ${y1}`,
          `A ${r} ${r} 0 ${largo} 1 ${x2} ${y2}`,
          `L ${cx + rInner * Math.cos(fim)} ${cy + rInner * Math.sin(fim)}`,
          `A ${rInner} ${rInner} 0 ${largo} 0 ${cx + rInner * Math.cos(inicio)} ${cy + rInner * Math.sin(inicio)}`,
          'Z',
        ].join(' ')
      : [
          `M ${cx} ${cy}`,
          `L ${x1} ${y1}`,
          `A ${r} ${r} 0 ${largo} 1 ${x2} ${y2}`,
          'Z',
        ].join(' ')

    return { path, fatia: f, pct: (f.valor / total) * 100 }
  })

  return (
    <div className="flex items-center gap-5">
      <svg width={tamanho} height={tamanho} viewBox={`0 0 ${tamanho} ${tamanho}`}>
        {paths.map((p, i) => (
          <path key={i} d={p.path} fill={p.fatia.cor} />
        ))}
      </svg>
      {legenda && (
        <div className="flex-1 space-y-1.5 min-w-0">
          {paths.map((p, i) => (
            <LegendaLinha key={i} rotulo={p.fatia.rotulo} cor={p.fatia.cor} valor={fmt(p.fatia.valor)} pct={p.pct} />
          ))}
        </div>
      )}
    </div>
  )
}

function LegendaLinha({ rotulo, cor, valor, pct }: { rotulo: string; cor: string; valor: string; pct: number }) {
  return (
    <div className="flex items-center gap-2 text-xs">
      <span className="inline-block w-2.5 h-2.5 rounded-sm flex-shrink-0" style={{ background: cor }} />
      <span className="text-white/70 truncate flex-1 min-w-0">{rotulo}</span>
      <span className="text-white font-bold tabular-nums">{pct.toFixed(0)}%</span>
      <span className="text-white/40 tabular-nums text-[10px] ml-1">{valor}</span>
    </div>
  )
}
