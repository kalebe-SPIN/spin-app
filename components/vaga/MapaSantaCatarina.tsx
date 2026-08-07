/**
 * Mapa ilustrado de Santa Catarina (low-poly, faux-3D) com bandeirinhas nas
 * cidades de atuação. Sem API — SVG puro, na identidade escura da Spin.
 *
 * As cidades vêm por nome; casamos com um dicionário de lat/long e projetamos
 * na mesma caixa do contorno, então os pinos caem em posições coerentes.
 */

// Caixa geográfica aproximada de SC
const LAT_TOP = -25.9, LAT_BOT = -29.45, LNG_LEFT = -53.9, LNG_RIGHT = -48.3
const W = 1000, H = 720, MX = 70, MY = 60
const innerW = W - 2 * MX, innerH = H - 2 * MY

function project(lat: number, lng: number): [number, number] {
  const x = MX + ((lng - LNG_LEFT) / (LNG_RIGHT - LNG_LEFT)) * innerW
  const y = MY + ((LAT_TOP - lat) / (LAT_TOP - LAT_BOT)) * innerH
  return [x, y]
}

// Contorno low-poly de SC (aproximado, estilizado) — sentido horário
const BORDER: [number, number][] = [
  [-25.98, -48.62], [-26.24, -48.58], [-26.62, -48.70], [-26.95, -48.62], [-27.15, -48.55],
  [-27.45, -48.42], [-27.60, -48.50], [-27.85, -48.55], [-28.20, -48.62], [-28.50, -48.78],
  [-28.75, -48.90], [-28.95, -49.30], [-29.20, -49.55], [-29.38, -49.72],
  [-29.00, -50.10], [-28.55, -50.60], [-28.15, -51.30], [-27.75, -51.90], [-27.20, -52.70],
  [-26.85, -53.20], [-26.35, -53.78],
  [-26.10, -53.30], [-26.20, -52.60], [-26.08, -51.80], [-26.22, -51.00], [-26.10, -50.20],
  [-26.00, -49.50], [-25.98, -48.95],
]

// Dicionário de cidades de SC (lat, lng)
const CIDADES: Record<string, [number, number]> = {
  florianopolis: [-27.5954, -48.548], joinville: [-26.3045, -48.8487], blumenau: [-26.9155, -49.0709],
  'sao jose': [-27.6136, -48.6366], chapeco: [-27.1004, -52.6152], itajai: [-26.9078, -48.6619],
  criciuma: [-28.6775, -49.3697], lages: [-27.8158, -50.3259], 'balneario camboriu': [-26.9906, -48.6348],
  'jaragua do sul': [-26.4851, -49.0668], palhoca: [-27.6386, -48.6703], brusque: [-27.098, -48.9176],
  tubarao: [-28.4713, -49.0069], camboriu: [-27.0248, -48.6544], navegantes: [-26.8992, -48.6544],
  concordia: [-27.234, -52.0281], 'rio do sul': [-27.2149, -49.643], ararangua: [-28.9356, -49.4859],
  cacador: [-26.7756, -51.0146], xanxere: [-26.8773, -52.4044], 'sao bento do sul': [-26.2506, -49.3783],
  mafra: [-26.1114, -49.8052], canoinhas: [-26.1774, -50.3903], videira: [-27.0083, -51.1517],
  gaspar: [-26.9319, -48.9586], indaial: [-26.8978, -49.2318], biguacu: [-27.4939, -48.6553],
  tijucas: [-27.2415, -48.6337], imbituba: [-28.2401, -48.6702], laguna: [-28.4829, -48.781],
  'porto uniao': [-26.2385, -51.0776], curitibanos: [-27.2825, -50.5847],
  'sao miguel do oeste': [-26.7256, -53.518],
}

const norm = (s: string) =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()

export function MapaSantaCatarina({ cidades }: { cidades: string[] }) {
  const pontos = BORDER.map(([la, ln]) => project(la, ln))
  const pathD = 'M ' + pontos.map(([x, y]) => `${x.toFixed(1)} ${y.toFixed(1)}`).join(' L ') + ' Z'

  // Casa cidades com o dicionário
  const marcadas = cidades
    .map((c) => ({ nome: c.trim(), coord: CIDADES[norm(c)] }))
    .filter((c) => c.coord)
    .map((c) => ({ nome: c.nome, xy: project(c.coord![0], c.coord![1]) }))

  const naoMapeadas = cidades.filter((c) => !CIDADES[norm(c)] && c.trim())
  const DEPTH = 16

  return (
    <div className="rounded-2xl border border-white/10 bg-noite-0/50 p-4 md:p-6">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" role="img" aria-label="Mapa de Santa Catarina com as cidades de atuação">
        <defs>
          <linearGradient id="scTop" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#1b2b45" />
            <stop offset="1" stopColor="#0f1825" />
          </linearGradient>
        </defs>

        {/* Extrusão (faux-3D): cópias deslocadas pra baixo */}
        {Array.from({ length: DEPTH }).map((_, i) => (
          <path key={i} d={pathD} transform={`translate(0 ${DEPTH - i})`} fill="#0a1220" />
        ))}
        {/* Face superior */}
        <path d={pathD} fill="url(#scTop)" stroke="rgba(245,180,0,0.5)" strokeWidth={2} strokeLinejoin="round" />

        {/* Rótulo do estado */}
        <text x={MX + 6} y={H - MY + 6} fill="rgba(255,255,255,0.28)" fontSize="26" fontWeight="800" letterSpacing="4">
          SANTA CATARINA
        </text>

        {/* Bandeirinhas */}
        {marcadas.map((m, i) => {
          const [x, y] = m.xy
          return (
            <g key={i}>
              {/* haste */}
              <line x1={x} y1={y} x2={x} y2={y - 26} stroke="#fff" strokeWidth={2} />
              {/* base */}
              <circle cx={x} cy={y} r={3.5} fill="#F5B400" />
              {/* bandeira */}
              <path d={`M ${x} ${y - 26} L ${x + 20} ${y - 21} L ${x} ${y - 15} Z`} fill="#F5B400" />
              {/* rótulo */}
              <text x={x + 6} y={y + 16} fill="#fff" fontSize="17" fontWeight="700"
                stroke="#0F1825" strokeWidth={3} paintOrder="stroke">
                {m.nome}
              </text>
            </g>
          )
        })}
      </svg>

      {/* Legenda de cidades */}
      <div className="mt-3 flex flex-wrap gap-2">
        {cidades.filter((c) => c.trim()).map((c, i) => {
          const ok = !!CIDADES[norm(c)]
          return (
            <span key={i} className={`text-xs px-2.5 py-1 rounded-full border ${
              ok ? 'bg-sol/10 border-sol/30 text-sol' : 'bg-white/5 border-white/10 text-white/50'
            }`}>
              🚩 {c.trim()}
            </span>
          )
        })}
      </div>
      {naoMapeadas.length > 0 && (
        <p className="mt-2 text-[11px] text-white/35">
          Sem posição no mapa (fora do dicionário): {naoMapeadas.join(', ')}. As demais aparecem com bandeira.
        </p>
      )}
    </div>
  )
}
