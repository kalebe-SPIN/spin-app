/**
 * Gráfico "Consumo × Geração" — 12 meses.
 *
 * Kalebe 2026-09-06: usado tanto no /orcamento (Client) quanto no
 * PropostaPDFTemplate (via html2canvas). SVG puro por isso (sem chart.js).
 *
 * - Barras douradas: geração estimada do kit (kWh/mês)
 * - Linha coral: consumo do cliente (kWh/mês), quando cadastrado
 * - Área verde translúcida: saldo de geração acima do consumo (crédito)
 * - Área coral translúcida: déficit (consumo acima da geração)
 */

type Props = {
  geracaoMensal: number[]      // 12 valores em kWh
  consumoMensal?: number[] | null  // 12 valores em kWh (opcional)
  titulo?: string
  altura?: number
  /** Tema — 'dark' pra Client (fundo escuro), 'light' pra PDF (fundo branco) */
  tema?: 'dark' | 'light'
  compacto?: boolean
}

const MESES = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez']

export function GraficoGeracaoConsumo({
  geracaoMensal, consumoMensal, titulo = 'Consumo × geração estimada',
  altura = 260, tema = 'dark', compacto = false,
}: Props) {
  const paleta = tema === 'dark'
    ? {
        fundo: 'transparent',
        titulo: '#F5F5F0',
        subtitulo: 'rgba(245,245,240,0.5)',
        eixo: 'rgba(245,245,240,0.15)',
        eixoLabel: 'rgba(245,245,240,0.6)',
        geracao: '#F5B400',           // sol dourado
        geracaoFill: 'rgba(245,180,0,0.85)',
        consumo: '#EF6D6D',           // coral
        consumoFill: 'rgba(239,109,109,0.15)',
        saldoPositivo: 'rgba(63,178,120,0.25)',  // verde
        saldoNegativo: 'rgba(239,109,109,0.20)',
        grid: 'rgba(245,245,240,0.06)',
      }
    : {
        fundo: '#FFFFFF',
        titulo: '#050B16',
        subtitulo: 'rgba(5,11,22,0.6)',
        eixo: 'rgba(5,11,22,0.15)',
        eixoLabel: 'rgba(5,11,22,0.65)',
        geracao: '#D4AF37',
        geracaoFill: 'rgba(212,175,55,0.85)',
        consumo: '#B33636',
        consumoFill: 'rgba(179,54,54,0.10)',
        saldoPositivo: 'rgba(52,131,80,0.20)',
        saldoNegativo: 'rgba(179,54,54,0.15)',
        grid: 'rgba(5,11,22,0.06)',
      }

  const W = 720
  const H = altura
  const padL = 44, padR = 16, padT = 26, padB = 34
  const iw = W - padL - padR
  const ih = H - padT - padB

  const temConsumo = Array.isArray(consumoMensal) && consumoMensal.length === 12
  const maxValor = Math.max(
    ...geracaoMensal,
    ...(temConsumo ? consumoMensal! : [0]),
    1,
  )
  const escalaY = ih / (maxValor * 1.1)  // 10% de folga em cima

  const barraW = iw / 12
  const xBarra = (i: number) => padL + i * barraW + barraW * 0.15
  const wBarra = barraW * 0.7

  const yFromValor = (v: number) => padT + ih - v * escalaY
  const xCentroBarra = (i: number) => padL + i * barraW + barraW / 2

  // Área do consumo (linha ligando os centros das barras)
  const pontosConsumo = temConsumo
    ? consumoMensal!.map((v, i) => `${xCentroBarra(i)},${yFromValor(v)}`).join(' ')
    : ''

  // Grid horizontal — 4 linhas
  const gridSteps = [0.25, 0.5, 0.75, 1.0]
  const passoY = maxValor * 1.1 / 4

  const geracaoAnual = geracaoMensal.reduce((s, v) => s + v, 0)
  const consumoAnual = temConsumo ? consumoMensal!.reduce((s, v) => s + v, 0) : 0
  const cobertura = temConsumo && consumoAnual > 0 ? Math.min(100, (geracaoAnual / consumoAnual) * 100) : null

  const fmt = (v: number) => v.toLocaleString('pt-BR', { maximumFractionDigits: 0 })

  return (
    <div style={{ background: paleta.fundo, padding: compacto ? 8 : 12, borderRadius: 8 }}>
      {titulo && (
        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
          marginBottom: 8, gap: 12, flexWrap: 'wrap',
        }}>
          <div>
            <p style={{
              margin: 0, fontSize: 9, letterSpacing: 2, textTransform: 'uppercase',
              color: paleta.subtitulo, fontWeight: 700,
            }}>
              12 meses · kWh
            </p>
            <h3 style={{
              margin: '4px 0 0', fontSize: 15, fontWeight: 800, color: paleta.titulo,
            }}>
              {titulo}
            </h3>
          </div>
          {cobertura !== null && (
            <div style={{ textAlign: 'right' }}>
              <p style={{
                margin: 0, fontSize: 9, letterSpacing: 2, textTransform: 'uppercase',
                color: paleta.subtitulo, fontWeight: 700,
              }}>
                Cobertura anual
              </p>
              <p style={{
                margin: '2px 0 0', fontSize: 18, fontWeight: 900,
                color: cobertura >= 100 ? paleta.geracao : paleta.consumo,
                fontFamily: 'monospace',
              }}>
                {cobertura.toFixed(0)}%
              </p>
            </div>
          )}
        </div>
      )}

      <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ display: 'block' }}>
        {/* Grid horizontal */}
        {gridSteps.map((f, i) => {
          const v = passoY * (4 - i)
          const y = yFromValor(v)
          return (
            <g key={i}>
              <line x1={padL} y1={y} x2={W - padR} y2={y} stroke={paleta.grid} strokeWidth={1} />
              <text
                x={padL - 6} y={y + 3}
                fontSize={9} fill={paleta.eixoLabel} textAnchor="end"
                fontFamily="sans-serif"
              >
                {fmt(v)}
              </text>
            </g>
          )
        })}

        {/* Barras de geração */}
        {geracaoMensal.map((v, i) => {
          const y = yFromValor(v)
          const h = padT + ih - y
          return (
            <rect
              key={`b${i}`}
              x={xBarra(i)}
              y={y}
              width={wBarra}
              height={Math.max(0, h)}
              fill={paleta.geracaoFill}
              rx={2}
            />
          )
        })}

        {/* Linha de consumo (se houver) */}
        {temConsumo && (
          <>
            {/* Área sombreada abaixo da linha de consumo */}
            <polygon
              points={`${padL},${padT + ih} ${pontosConsumo} ${W - padR},${padT + ih}`}
              fill={paleta.consumoFill}
            />
            {/* Linha */}
            <polyline
              points={pontosConsumo}
              fill="none"
              stroke={paleta.consumo}
              strokeWidth={2.5}
              strokeLinejoin="round"
              strokeLinecap="round"
            />
            {/* Marcadores nos meses */}
            {consumoMensal!.map((v, i) => (
              <circle
                key={`c${i}`}
                cx={xCentroBarra(i)}
                cy={yFromValor(v)}
                r={3}
                fill={paleta.consumo}
                stroke={tema === 'dark' ? '#050B16' : '#FFFFFF'}
                strokeWidth={1.5}
              />
            ))}
          </>
        )}

        {/* Eixo X (meses) */}
        <line x1={padL} y1={padT + ih} x2={W - padR} y2={padT + ih}
          stroke={paleta.eixo} strokeWidth={1} />
        {MESES.map((m, i) => (
          <text
            key={`m${i}`}
            x={xCentroBarra(i)}
            y={padT + ih + 16}
            fontSize={10}
            fill={paleta.eixoLabel}
            textAnchor="middle"
            fontFamily="sans-serif"
          >
            {m}
          </text>
        ))}
      </svg>

      {/* Legenda */}
      <div style={{
        display: 'flex', gap: 18, justifyContent: 'center', marginTop: 6,
        fontSize: 11, color: paleta.eixoLabel,
      }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <span style={{ display: 'inline-block', width: 12, height: 12, background: paleta.geracaoFill, borderRadius: 2 }} />
          Geração estimada · {fmt(geracaoAnual)} kWh/ano
        </span>
        {temConsumo && (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <span style={{ display: 'inline-block', width: 14, height: 3, background: paleta.consumo, borderRadius: 1 }} />
            Consumo do cliente · {fmt(consumoAnual)} kWh/ano
          </span>
        )}
      </div>
    </div>
  )
}
