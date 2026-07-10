export function Kpi({
  valor,
  label,
  cor = 'sol',
}: {
  valor: string | number
  label: string
  cor?: 'sol' | 'verde' | 'coral' | 'branco' | 'azul'
}) {
  const cores = {
    sol: 'text-sol',
    verde: 'text-verde',
    coral: 'text-coral',
    branco: 'text-white',
    azul: 'text-weg-azul',
  }
  return (
    <div className="flex flex-col">
      <span className={`text-2xl font-black ${cores[cor]} leading-none`}>{valor}</span>
      <span className="text-[9px] uppercase tracking-wider text-white/50 mt-1">{label}</span>
    </div>
  )
}

export function KpiRow({ children }: { children: React.ReactNode }) {
  return <div className="flex gap-4 mt-3">{children}</div>
}

/** Gráfico de barras horizontais compacto */
export function MiniBarras({
  dados,
  altura = 30,
}: {
  dados: { label: string; valor: number; cor?: string }[]
  altura?: number
}) {
  const total = dados.reduce((s, d) => s + d.valor, 0)
  if (total === 0) {
    return (
      <div className="text-[10px] text-white/30 italic mt-2">
        (sem dados ainda)
      </div>
    )
  }
  return (
    <div className="mt-3 space-y-1">
      {dados.slice(0, 4).map((d, i) => {
        const pct = (d.valor / total) * 100
        return (
          <div key={i} className="flex items-center gap-2">
            <span className="text-[9px] text-white/50 w-12 truncate">{d.label}</span>
            <div className="flex-1 h-1.5 bg-white/5 rounded-full overflow-hidden">
              <div
                className="h-full rounded-full"
                style={{
                  width: `${pct}%`,
                  backgroundColor: d.cor || 'rgb(245 158 11 / 0.7)',
                }}
              />
            </div>
            <span className="text-[9px] font-bold text-white w-4 text-right">{d.valor}</span>
          </div>
        )
      })}
    </div>
  )
}

/** Sparkline simples com pontos em SVG */
export function Sparkline({
  valores,
  cor = 'rgb(245 158 11)',
  altura = 30,
}: {
  valores: number[]
  cor?: string
  altura?: number
}) {
  if (valores.length < 2) {
    return <div className="text-[9px] text-white/30 mt-2">(pouco histórico)</div>
  }
  const max = Math.max(...valores, 1)
  const min = Math.min(...valores, 0)
  const range = max - min || 1
  const largura = 100
  const pontos = valores
    .map((v, i) => {
      const x = (i / (valores.length - 1)) * largura
      const y = altura - ((v - min) / range) * altura
      return `${x},${y}`
    })
    .join(' ')

  return (
    <svg
      viewBox={`0 0 ${largura} ${altura}`}
      className="mt-2 w-full"
      style={{ height: altura }}
      preserveAspectRatio="none"
    >
      <polyline
        points={pontos}
        fill="none"
        stroke={cor}
        strokeWidth="1.5"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  )
}

/** Linha de status chips coloridos: [chip verde 12] [chip amarelo 3] */
export function StatusChips({
  chips,
}: {
  chips: { label: string; valor: number; cor: 'sol' | 'verde' | 'coral' | 'azul' | 'branco' }[]
}) {
  const cores = {
    sol: 'bg-sol/10 border-sol/30 text-sol',
    verde: 'bg-verde/10 border-verde/30 text-verde',
    coral: 'bg-coral/10 border-coral/30 text-coral',
    azul: 'bg-weg-azul/10 border-weg-azul/30 text-weg-azul',
    branco: 'bg-white/5 border-white/20 text-white/70',
  }
  return (
    <div className="flex flex-wrap gap-1 mt-2">
      {chips.filter(c => c.valor > 0).map((c, i) => (
        <span
          key={i}
          className={`text-[9px] uppercase tracking-wider font-bold px-1.5 py-0.5 rounded border ${cores[c.cor]}`}
        >
          {c.valor} {c.label}
        </span>
      ))}
    </div>
  )
}
