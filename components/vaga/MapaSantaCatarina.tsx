/**
 * Mapa de Santa Catarina (contorno REAL do IBGE, malha estadual 42) em
 * perspectiva 3D (tilt + extrusão), com bandeirinhas nas cidades de atuação.
 * Sem API — SVG puro na identidade escura da Spin. As cidades são projetadas
 * com a MESMA projeção do contorno, então os pinos caem em posições corretas.
 */

// Projeção (equiretangular, proporção corrigida) — mesma usada pra gerar o path
const LAT_MIN = -29.3551, LAT_MAX = -25.9768, LNG_MIN = -53.8371, LNG_MAX = -48.3736
const MX = 60, MY = 50, IW = 900, IH = 628
const VBW = 1020, VBH = 728

function project(lat: number, lng: number): [number, number] {
  const x = MX + ((lng - LNG_MIN) / (LNG_MAX - LNG_MIN)) * IW
  const y = MY + ((LAT_MAX - lat) / (LAT_MAX - LAT_MIN)) * IH
  return [x, y]
}

// Contorno oficial de SC já projetado
const SC_PATH = "M 289.7 135.8 L 286.3 136 L 276.4 128.6 L 270.9 130.1 L 264.5 131.7 L 256.4 125.1 L 250.6 119.9 L 247.2 120.9 L 241.1 117.9 L 237 120 L 223.1 118.3 L 213 121.1 L 208.2 121.6 L 199 118.9 L 193.3 123.1 L 182.5 127.2 L 171.5 119.5 L 170 119 L 154.3 108.1 L 151.2 100 L 147.8 102.3 L 141.5 100.6 L 135.9 99.2 L 127 106.7 L 126.9 106.8 L 116.2 110.6 L 106.1 107.7 L 101.6 102.5 L 92.6 100.9 L 91.7 106.7 L 84.9 116.7 L 81.4 127.8 L 84.4 134 L 84.5 136.7 L 79.1 154.3 L 77.5 166 L 78.7 176.3 L 76.1 192.3 L 80.2 193.9 L 79.7 199.7 L 86.3 211.2 L 86.6 220.3 L 87.2 229.6 L 80.5 233.8 L 77.2 241 L 74.8 246.1 L 66.7 247.5 L 65 260.8 L 66.2 267.5 L 60 271.5 L 62.9 272.9 L 70.1 267.6 L 74.1 275.2 L 79.7 274.1 L 84.9 270.6 L 90.6 273 L 94 279.9 L 99.1 275.4 L 107.7 273 L 112.5 277.8 L 117.5 276.2 L 114.2 268.4 L 119.4 266 L 122.9 269.4 L 131 265.6 L 135.1 257.7 L 139.4 260.9 L 149.1 264.8 L 144.8 279.2 L 159.7 272 L 167 276 L 170 267 L 174.9 272.9 L 186.2 269.4 L 185.3 260.2 L 190 255.8 L 195 257.5 L 191.1 263.4 L 193.6 269.7 L 199.1 266.2 L 200.3 271.9 L 197.9 278.6 L 202.6 280.7 L 205 270.6 L 209.5 278.1 L 222.4 271.9 L 223.3 278.8 L 230.7 278 L 233.2 278.5 L 237.3 279.8 L 236.9 286.5 L 245 284.4 L 248.7 293.1 L 251.2 285.9 L 260.8 289.6 L 272.9 284.9 L 274.3 288.6 L 283.7 289.6 L 283.6 284 L 291.4 280.7 L 289.8 286.8 L 293.6 292.7 L 297.1 294.6 L 304.6 293.9 L 313.2 299.5 L 312.2 289.6 L 319.6 288 L 318.5 292.8 L 325.6 301.7 L 341.8 296.4 L 345 304 L 354.6 304.6 L 365.4 309.9 L 367.8 316.6 L 373.2 319.9 L 378.7 331.6 L 386 328.5 L 389.5 337.3 L 397.5 335.9 L 403.5 330.9 L 409.2 335.3 L 411.8 329.4 L 420.7 336.2 L 423.1 331 L 427.1 340.8 L 432.1 347.5 L 437.1 344.1 L 447.7 344.9 L 452 353.1 L 458.3 361.9 L 465.1 362.9 L 468 366.4 L 475.4 365.7 L 476.5 374 L 482.3 376.9 L 482.5 379.9 L 496.4 384.8 L 505.2 389.6 L 518.6 401.7 L 518 405.1 L 524.1 411.7 L 527.1 419.3 L 530.9 416.5 L 539.9 420.8 L 540 428.3 L 547.9 433.8 L 543.9 442.8 L 547.8 443.8 L 550.6 452.1 L 561.3 451.9 L 566.7 462.3 L 568.7 472.3 L 577.5 476.3 L 582.6 484.2 L 582.5 488.9 L 594.4 497 L 602.4 505.6 L 604.5 501.9 L 614.6 503.2 L 622.1 506.6 L 631.4 504.4 L 636 508.1 L 642.5 507.8 L 647.1 511.1 L 652.2 506.4 L 667.8 509.7 L 676.1 516.1 L 680.8 515.2 L 687.6 514.3 L 696.9 507.9 L 708.5 512.5 L 718.6 518.4 L 722.3 513.3 L 726.5 518.4 L 733.5 517.9 L 733.8 525.6 L 740.2 534.3 L 741 543 L 740.8 543.2 L 732.2 540.6 L 718.6 550 L 718.4 558.7 L 713.6 556.4 L 698.5 569.6 L 698.3 584.8 L 700.2 592.2 L 699.4 602.5 L 703 605.6 L 697.7 616 L 699.1 624.7 L 689.1 642.3 L 674.3 651.2 L 668.1 648.8 L 668.3 662.2 L 673.6 668.5 L 685.3 678 L 686.5 677 L 673.1 660.7 L 690.5 653.9 L 699.1 649.1 L 708.3 652 L 715.6 655.3 L 722.4 665.1 L 726.4 665.1 L 734.6 667.5 L 739.4 672.5 L 750.5 656.3 L 771.8 629.8 L 794.8 603.8 L 809 590.3 L 825.9 575.2 L 861 550.9 L 880.2 540.6 L 885.2 538.9 L 898.6 520 L 895.5 511.6 L 898.6 505.5 L 900.3 496.6 L 905.2 489.6 L 904.7 486.2 L 910.3 473.8 L 914.9 469.7 L 911.6 465.8 L 913.1 457.3 L 917.1 447.1 L 917.5 441.9 L 922.2 432.3 L 917.4 426.1 L 919.3 415.9 L 924.8 408.3 L 923.4 398.4 L 926.6 397.1 L 932.2 394.1 L 933.5 388.1 L 939.5 388 L 942.8 381.8 L 937.9 378.6 L 944.6 361.3 L 952.7 349.7 L 950.8 343.4 L 954.6 334.5 L 960 327.9 L 952.8 311 L 941.9 310.5 L 934.8 316.1 L 932.6 299.6 L 923.6 299 L 920.2 290.7 L 922.3 280.7 L 926.3 279.5 L 932.2 274.1 L 936.8 274.4 L 942.2 268.7 L 936.9 264.6 L 937.9 260.7 L 930.4 269.5 L 925.1 267.1 L 920.4 258.9 L 924.5 251.5 L 927.5 241.9 L 920.4 241.2 L 918 232.8 L 915.8 224 L 919.2 207.9 L 919.4 201.1 L 912.6 197.7 L 909.2 187.9 L 908.2 179.1 L 912 162.3 L 914.4 156.1 L 923.6 138.4 L 922.8 134.7 L 931.5 112 L 938.5 98.4 L 935.1 93.3 L 933.9 84.6 L 927.7 85.5 L 923 78.3 L 921.7 58 L 923.5 50 L 909.2 51.3 L 863.3 50.7 L 865 52.5 L 862 51.8 L 853.5 57.2 L 852 55.2 L 849.7 55.1 L 844.7 54.5 L 829.2 54.4 L 818.2 60 L 807.4 75 L 803.8 74.8 L 797.4 79.9 L 794.1 83.4 L 786.1 85.9 L 776.8 88.7 L 776.6 90.4 L 774.2 95.2 L 766.2 97.7 L 757.5 96.5 L 749.1 89.1 L 746 89.6 L 733.5 77.5 L 721 71.8 L 714.5 64.5 L 713.6 60.5 L 702.9 57.8 L 693.2 56.4 L 671.6 63.8 L 669 59.3 L 660.8 67.3 L 655.5 65.5 L 651.3 60 L 647.9 62.3 L 637.4 70.2 L 639.1 79.2 L 631.8 75.2 L 630.9 69 L 621.3 66 L 616.2 59.2 L 607.5 59.2 L 601.3 61.4 L 600.9 65.4 L 594.1 67.4 L 588.6 66 L 584 73.1 L 585 78.9 L 579.6 82.9 L 577.2 88.1 L 576.2 89.3 L 571.8 92.1 L 574.2 99.8 L 569.2 100.2 L 566.4 95.6 L 560.3 97.3 L 552.6 103.8 L 543.9 108.1 L 542.3 100.7 L 536.6 99.6 L 532.1 102.9 L 528.8 98 L 518 99.7 L 514.6 97.3 L 510.6 105 L 502.9 106.1 L 493.9 109.7 L 485.8 119.7 L 482.8 126.2 L 479.1 135 L 485.6 140.2 L 482.4 146.9 L 489.8 157.4 L 490.8 164.7 L 488 171 L 480.7 175.8 L 470.2 174.9 L 462.9 177.6 L 459.6 187.6 L 452.4 173.4 L 445.7 163.5 L 443 162.4 L 439.1 164.3 L 423.2 163.5 L 418.9 159.4 L 413.2 162.2 L 405.8 160.8 L 398.2 163.6 L 391.6 162.5 L 382.7 165.4 L 379 162 L 361.2 159.6 L 357.8 156 L 349.2 151.9 L 344.2 142.6 L 336.5 141 L 331.9 137.1 L 324.8 141.1 L 317 140 L 312.5 136.2 L 300.1 135.8 L 296.2 133.9 L 289.7 135.8 Z"

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
  'sao miguel do oeste': [-26.7256, -53.518], garopaba: [-28.0257, -48.6142],
  'sombrio': [-29.1094, -49.6316], 'santo amaro da imperatriz': [-27.6885, -48.7787],
}

const norm = (s: string) =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()

export function MapaSantaCatarina({ cidades }: { cidades: string[] }) {
  const marcadas = cidades
    .map((c) => ({ nome: c.trim(), coord: CIDADES[norm(c)] }))
    .filter((c) => c.coord)
    .map((c) => ({ nome: c.nome, xy: project(c.coord![0], c.coord![1]) }))
  const naoMapeadas = cidades.filter((c) => c.trim() && !CIDADES[norm(c)])
  const DEPTH = 26

  return (
    <div className="rounded-2xl border border-white/10 bg-noite-0/50 p-4 md:p-6">
      <div style={{ perspective: '1300px' }}>
        <div style={{ transform: 'rotateX(32deg)', transformOrigin: 'center 58%' }}>
          <svg viewBox={`0 0 ${VBW} ${VBH}`} className="w-full h-auto overflow-visible" role="img" aria-label="Mapa de Santa Catarina com as cidades de atuação">
            <defs>
              <linearGradient id="scTop" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0" stopColor="#22375a" />
                <stop offset="1" stopColor="#101a2b" />
              </linearGradient>
              <filter id="scGlow" x="-20%" y="-20%" width="140%" height="140%">
                <feDropShadow dx="0" dy="8" stdDeviation="10" floodColor="#000" floodOpacity="0.5" />
              </filter>
            </defs>

            {/* Extrusão (faux-3D): cópias deslocadas pra baixo */}
            {Array.from({ length: DEPTH }).map((_, i) => (
              <path key={i} d={SC_PATH} transform={`translate(0 ${DEPTH - i})`} fill={i === 0 ? '#060b14' : '#0a1322'} />
            ))}
            {/* Face superior */}
            <path d={SC_PATH} fill="url(#scTop)" stroke="rgba(245,180,0,0.65)" strokeWidth={2.5} strokeLinejoin="round" filter="url(#scGlow)" />

            {/* Rótulo do estado */}
            <text x={MX + 4} y={VBH - MY + 2} fill="rgba(255,255,255,0.22)" fontSize="30" fontWeight="900" letterSpacing="6">SANTA CATARINA</text>

            {/* Bandeirinhas */}
            {marcadas.map((m, i) => {
              const [x, y] = m.xy
              return (
                <g key={i}>
                  <line x1={x} y1={y} x2={x} y2={y - 30} stroke="#fff" strokeWidth={2.5} />
                  <circle cx={x} cy={y} r={4} fill="#F5B400" stroke="#0F1825" strokeWidth={1} />
                  <path d={`M ${x} ${y - 30} L ${x + 24} ${y - 24} L ${x} ${y - 18} Z`} fill="#F5B400" />
                  <text x={x + 7} y={y + 18} fill="#fff" fontSize="19" fontWeight="800" stroke="#0F1825" strokeWidth={4} paintOrder="stroke">{m.nome}</text>
                </g>
              )
            })}
          </svg>
        </div>
      </div>

      {/* Legenda de cidades */}
      <div className="mt-4 flex flex-wrap gap-2">
        {cidades.filter((c) => c.trim()).map((c, i) => {
          const ok = !!CIDADES[norm(c)]
          return (
            <span key={i} className={`text-xs px-2.5 py-1 rounded-full border ${ok ? 'bg-sol/10 border-sol/30 text-sol' : 'bg-white/5 border-white/10 text-white/50'}`}>🚩 {c.trim()}</span>
          )
        })}
      </div>
      {naoMapeadas.length > 0 && (
        <p className="mt-2 text-[11px] text-white/35">Sem posição no mapa (fora do dicionário): {naoMapeadas.join(', ')}.</p>
      )}
    </div>
  )
}
