'use client'

/**
 * Gráficos de impacto do sistema híbrido:
 *   A. ENERGIA (kWh, 24h) — consumo × geração × acumulação × despacho
 *   B. POTÊNCIA (kW, 24h) — carga total × sistema paralelo à rede × simulação queda
 *   C. Backup — timeline com autonomia real limitada pela potência do banco
 *
 * SVG puro pra máxima leveza + exportação em PDF.
 */

import {
  simularDiaHibrido,
  simularMesHibrido,
  simularQuedaEnergia,
  type PerfilCliente,
} from '@/lib/hibrido/perfil-consumo'

export type ImpactoHibridoProps = {
  perfil?: PerfilCliente
  consumoMensalKwh: number
  geracaoMensalEstimadaKwh: number
  capacidadeBateriaKwh: number
  potenciaBateriaKw: number          // NOVO: potência instantânea do banco (limita despacho)
  potenciaInversorKw: number          // NOVO: potência CA do inversor
  cargaCriticaKw: number
  autonomiaHoras: number
  percDespachoMax?: number            // NOVO: % max do banco pra despacho (default 50)
  percBackupReservado?: number        // NOVO: % reservado pra queda de energia (default 20)
  usarPeakShaving?: boolean
  horaInicioPonta?: number
  horaFimPonta?: number
  horaSimularQueda?: number           // NOVO: hora que simula queda pra gráfico B (default 18h)
}

export function GraficoImpactoHibrido(props: ImpactoHibridoProps) {
  const {
    perfil = 'residencial',
    consumoMensalKwh,
    geracaoMensalEstimadaKwh,
    capacidadeBateriaKwh,
    potenciaBateriaKw,
    potenciaInversorKw,
    cargaCriticaKw,
    autonomiaHoras,
    percDespachoMax = 50,
    percBackupReservado = 20,
    usarPeakShaving = false,
    horaInicioPonta = 18,
    horaFimPonta = 21,
    horaSimularQueda = 18,
  } = props

  const consumoDiarioKwh = consumoMensalKwh / 30
  const geracaoDiariaKwh = geracaoMensalEstimadaKwh / 30

  const pontos24h = simularDiaHibrido({
    perfil,
    consumoDiarioKwh,
    geracaoDiariaKwh,
    capacidadeBateriaKwh,
    potenciaBateriaKw,
    potenciaInversorKw,
    usarPeakShaving,
    horaInicioPonta,
    horaFimPonta,
    percDespachoMax,
    percBackupReservado,
  })

  const pontosMes = simularMesHibrido({
    perfil,
    consumoMensalKwh,
    geracaoMensalKwh: geracaoMensalEstimadaKwh,
  })

  const quedaSim = simularQuedaEnergia({
    perfil,
    consumoDiarioKwh,
    cargaCriticaKw,
    capacidadeBateriaKwh,
    potenciaBateriaKw,
    potenciaInversorKw,
    horaQueda: horaSimularQueda,
    duracaoQuedaHoras: Math.max(8, Math.ceil(autonomiaHoras + 2)),
  })

  const economiaMensalKwh = pontosMes.reduce((s, p) => s + p.economiaKwh, 0)
  const consumoDaRedeMensal = pontosMes.reduce((s, p) => s + p.consumoDaRedeKwh, 0)
  const percentualCoberto = (economiaMensalKwh / consumoMensalKwh) * 100

  return (
    <div className="space-y-6">
      <GraficoEnergia24h
        pontos={pontos24h}
        capacidadeBateriaKwh={capacidadeBateriaKwh}
        percDespachoMax={percDespachoMax}
        percBackupReservado={percBackupReservado}
        usarPeakShaving={usarPeakShaving}
        horaInicioPonta={horaInicioPonta}
        horaFimPonta={horaFimPonta}
      />
      <GraficoPotencia24h
        pontos={pontos24h}
        quedaSim={quedaSim}
        potenciaInversorKw={potenciaInversorKw}
        potenciaBateriaKw={potenciaBateriaKw}
        cargaCriticaKw={cargaCriticaKw}
        horaSimularQueda={horaSimularQueda}
      />
      <BalancoMensal
        pontos={pontosMes}
        economiaMensalKwh={economiaMensalKwh}
        consumoDaRedeMensal={consumoDaRedeMensal}
        percentualCoberto={percentualCoberto}
      />
    </div>
  )
}

// ══════════════════════════════════════════════════════════════════════
// A. GRÁFICO DE ENERGIA (kWh) — 24h — consumo × geração × acumulação × despacho
// ══════════════════════════════════════════════════════════════════════
function GraficoEnergia24h({
  pontos, capacidadeBateriaKwh, percDespachoMax, percBackupReservado,
  usarPeakShaving, horaInicioPonta, horaFimPonta,
}: {
  pontos: ReturnType<typeof simularDiaHibrido>
  capacidadeBateriaKwh: number
  percDespachoMax: number
  percBackupReservado: number
  usarPeakShaving: boolean
  horaInicioPonta: number
  horaFimPonta: number
}) {
  const W = 700, H = 300
  const MARGIN = { top: 20, right: 20, bottom: 40, left: 50 }
  const innerW = W - MARGIN.left - MARGIN.right
  const innerH = H - MARGIN.top - MARGIN.bottom

  const maxKw = Math.max(...pontos.map((p) => Math.max(p.consumoKw, p.geracaoKw, p.cargaBateriaKw, p.descargaBateriaKw)), 0.1)
  const escalaY = (v: number) => innerH - (v / maxKw) * innerH
  const escalaX = (h: number) => (h / 23) * innerW

  const pathConsumo = pontos.map((p, i) => `${i === 0 ? 'M' : 'L'} ${escalaX(p.hora)} ${escalaY(p.consumoKw)}`).join(' ')
  const pathGeracao = pontos.map((p, i) => `${i === 0 ? 'M' : 'L'} ${escalaX(p.hora)} ${escalaY(p.geracaoKw)}`).join(' ')
  const pathSOC = pontos.map((p, i) => `${i === 0 ? 'M' : 'L'} ${escalaX(p.hora)} ${innerH - (p.socBateriaPerc / 100) * innerH}`).join(' ')

  return (
    <div className="p-5 bg-noite/60 border border-white/10 rounded-xl">
      <div className="flex items-start justify-between mb-3 flex-wrap gap-2">
        <div>
          <h3 className="text-sm font-bold text-white">
            📊 A. Energia (24h) — consumo × geração × acumulação × despacho
          </h3>
          <p className="text-[10px] text-white/50 mt-0.5">
            Curva de estado da bateria (linha branca) mostra quando acumula (solar+rede) vs despacha
          </p>
        </div>
        <div className="flex flex-wrap gap-2 text-[10px]">
          <Legenda cor="#f59e0b" label="Consumo" />
          <Legenda cor="#22c55e" label="Geração solar" />
          <Legenda cor="#3b82f6" label="Acumulação (bat carregando)" area />
          <Legenda cor="#a855f7" label="Despacho (bat descarregando)" area />
          <Legenda cor="#fff" label="SOC bateria (%)" dashed />
        </div>
      </div>

      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" style={{ maxHeight: 300 }}>
        <g transform={`translate(${MARGIN.left},${MARGIN.top})`}>
          {[0, 0.25, 0.5, 0.75, 1].map((f) => (
            <g key={f}>
              <line x1={0} y1={innerH * f} x2={innerW} y2={innerH * f} stroke="rgba(255,255,255,0.06)" />
              <text x={-6} y={innerH * f + 3} fontSize={9} fill="rgba(255,255,255,0.5)" textAnchor="end">
                {(maxKw * (1 - f)).toFixed(1)}
              </text>
            </g>
          ))}
          <text x={-38} y={innerH / 2} fontSize={9} fill="rgba(255,255,255,0.6)"
            textAnchor="middle" transform={`rotate(-90 -38 ${innerH / 2})`}>kW</text>
          <text x={innerW + 8} y={innerH / 2} fontSize={9} fill="rgba(255,255,255,0.6)"
            textAnchor="middle" transform={`rotate(90 ${innerW + 8} ${innerH / 2})`}>SOC %</text>

          {/* Faixa horário ponta */}
          {usarPeakShaving && (
            <rect x={escalaX(horaInicioPonta)} y={0}
              width={escalaX(horaFimPonta) - escalaX(horaInicioPonta)}
              height={innerH} fill="rgba(168,85,247,0.10)" stroke="rgba(168,85,247,0.3)" strokeDasharray="3 3" />
          )}

          {/* Barras de acumulação (azul) e despacho (roxo) */}
          {pontos.map((p) => {
            const x = escalaX(p.hora)
            const barW = innerW / 24 * 0.6
            return (
              <g key={p.hora}>
                {p.cargaBateriaKw > 0 && (
                  <rect x={x - barW / 2} y={escalaY(p.cargaBateriaKw)}
                    width={barW} height={innerH - escalaY(p.cargaBateriaKw)}
                    fill="rgba(59,130,246,0.55)" />
                )}
                {p.descargaBateriaKw > 0 && (
                  <rect x={x - barW / 2} y={escalaY(p.descargaBateriaKw)}
                    width={barW} height={innerH - escalaY(p.descargaBateriaKw)}
                    fill="rgba(168,85,247,0.65)" />
                )}
              </g>
            )
          })}

          {/* Linha SOC (%) - escala 0-100 mapeada em innerH invertido */}
          <path d={pathSOC} fill="none" stroke="#ffffff" strokeWidth={1.5} strokeDasharray="4 3" opacity={0.7} />

          {/* Linha geração (verde) */}
          <path d={pathGeracao} fill="none" stroke="#22c55e" strokeWidth={2.5} strokeLinejoin="round" />

          {/* Linha consumo (amarelo) */}
          <path d={pathConsumo} fill="none" stroke="#f59e0b" strokeWidth={2.5} strokeLinejoin="round" />

          {/* Eixo X */}
          {[0, 6, 12, 18, 23].map((h) => (
            <g key={h}>
              <line x1={escalaX(h)} y1={innerH} x2={escalaX(h)} y2={innerH + 4} stroke="rgba(255,255,255,0.3)" />
              <text x={escalaX(h)} y={innerH + 16} fontSize={10} fill="rgba(255,255,255,0.6)" textAnchor="middle">
                {h.toString().padStart(2, '0')}h
              </text>
            </g>
          ))}
        </g>
      </svg>

      <div className="mt-3 grid grid-cols-2 md:grid-cols-4 gap-2 text-[10px]">
        <MiniInfo label="Capacidade banco" valor={`${capacidadeBateriaKwh.toFixed(1)} kWh`} cor="text-verde" />
        <MiniInfo label="% Despacho max" valor={`${percDespachoMax}%`} cor="text-purple-400" />
        <MiniInfo label="% Reservado backup" valor={`${percBackupReservado}%`} cor="text-coral" />
        <MiniInfo label="Peak shaving" valor={usarPeakShaving ? `${horaInicioPonta}h-${horaFimPonta}h` : 'off'} cor="text-white/70" />
      </div>
    </div>
  )
}

// ══════════════════════════════════════════════════════════════════════
// B. GRÁFICO DE POTÊNCIA (kW) — 24h — carga × sistema paralelo × queda
// ══════════════════════════════════════════════════════════════════════
function GraficoPotencia24h({
  pontos, quedaSim, potenciaInversorKw, potenciaBateriaKw, cargaCriticaKw, horaSimularQueda,
}: {
  pontos: ReturnType<typeof simularDiaHibrido>
  quedaSim: ReturnType<typeof simularQuedaEnergia>
  potenciaInversorKw: number
  potenciaBateriaKw: number
  cargaCriticaKw: number
  horaSimularQueda: number
}) {
  const W = 700, H = 260
  const MARGIN = { top: 20, right: 20, bottom: 40, left: 50 }
  const innerW = W - MARGIN.left - MARGIN.right
  const innerH = H - MARGIN.top - MARGIN.bottom

  const maxKw = Math.max(...pontos.map((p) => p.consumoKw), potenciaInversorKw, potenciaBateriaKw, cargaCriticaKw) * 1.1
  const escalaY = (v: number) => innerH - (v / maxKw) * innerH
  const escalaX = (h: number) => (h / 23) * innerW

  const pathCarga = pontos.map((p, i) => `${i === 0 ? 'M' : 'L'} ${escalaX(p.hora)} ${escalaY(p.consumoKw)}`).join(' ')

  // Potência disponível REAL no backup = min(inversor, potência banco)
  const potenciaBackupKw = Math.min(potenciaInversorKw, potenciaBateriaKw)

  return (
    <div className="p-5 bg-noite/60 border border-white/10 rounded-xl">
      <div className="flex items-start justify-between mb-3 flex-wrap gap-2">
        <div>
          <h3 className="text-sm font-bold text-white">
            ⚡ B. Potência (24h) — carga × sistema paralelo × queda
          </h3>
          <p className="text-[10px] text-white/50 mt-0.5">
            Simula queda às {horaSimularQueda}h: potência disponível cai pra <strong className="text-coral">{potenciaBackupKw.toFixed(1)}kW</strong> (limitado por {potenciaInversorKw < potenciaBateriaKw ? 'inversor' : 'banco'})
          </p>
        </div>
        <div className="flex flex-wrap gap-2 text-[10px]">
          <Legenda cor="#f59e0b" label="Carga real" />
          <Legenda cor="#22c55e" label="Sistema+rede (∞ pot.)" area />
          <Legenda cor="#ef4444" label="Só backup (limitado)" area />
          <Legenda cor="#a855f7" label="Simulação queda" />
        </div>
      </div>

      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" style={{ maxHeight: 260 }}>
        <g transform={`translate(${MARGIN.left},${MARGIN.top})`}>
          {[0, 0.25, 0.5, 0.75, 1].map((f) => (
            <g key={f}>
              <line x1={0} y1={innerH * f} x2={innerW} y2={innerH * f} stroke="rgba(255,255,255,0.06)" />
              <text x={-6} y={innerH * f + 3} fontSize={9} fill="rgba(255,255,255,0.5)" textAnchor="end">
                {(maxKw * (1 - f)).toFixed(1)}
              </text>
            </g>
          ))}
          <text x={-38} y={innerH / 2} fontSize={9} fill="rgba(255,255,255,0.6)"
            textAnchor="middle" transform={`rotate(-90 -38 ${innerH / 2})`}>kW</text>

          {/* Área "Sistema+rede" (verde) — cobre TUDO até maxKw pré-queda */}
          <rect x={0} y={escalaY(maxKw)}
            width={escalaX(horaSimularQueda)} height={innerH - escalaY(maxKw)}
            fill="rgba(34,197,94,0.10)" />

          {/* Área "Só backup" após a queda (vermelha) — limitada em potenciaBackupKw */}
          <rect x={escalaX(horaSimularQueda)} y={escalaY(potenciaBackupKw)}
            width={innerW - escalaX(horaSimularQueda)} height={innerH - escalaY(potenciaBackupKw)}
            fill="rgba(239,68,68,0.15)" />

          {/* Linha limite inversor (verde tracejada) */}
          <line x1={0} y1={escalaY(potenciaInversorKw)} x2={innerW} y2={escalaY(potenciaInversorKw)}
            stroke="#22c55e" strokeWidth={1} strokeDasharray="4 3" opacity={0.6} />
          <text x={innerW - 4} y={escalaY(potenciaInversorKw) - 3} fontSize={9} fill="#22c55e" textAnchor="end">
            Pinversor {potenciaInversorKw.toFixed(1)}kW
          </text>

          {/* Linha limite banco (vermelha tracejada) */}
          <line x1={0} y1={escalaY(potenciaBateriaKw)} x2={innerW} y2={escalaY(potenciaBateriaKw)}
            stroke="#ef4444" strokeWidth={1} strokeDasharray="4 3" opacity={0.6} />
          <text x={innerW - 4} y={escalaY(potenciaBateriaKw) - 3} fontSize={9} fill="#ef4444" textAnchor="end">
            Pbanco {potenciaBateriaKw.toFixed(1)}kW
          </text>

          {/* Momento da queda */}
          <line x1={escalaX(horaSimularQueda)} y1={0} x2={escalaX(horaSimularQueda)} y2={innerH}
            stroke="#a855f7" strokeWidth={2} strokeDasharray="4 3" />
          <text x={escalaX(horaSimularQueda) + 4} y={12} fontSize={10} fill="#a855f7" fontWeight="bold">
            ⚡ QUEDA
          </text>

          {/* Curva simulação queda: potência entregue (roxa) */}
          {quedaSim.pontos.map((p, i) => {
            if (i === 0) return null
            const prev = quedaSim.pontos[i - 1]
            const xPrev = escalaX((horaSimularQueda + (i - 1)) % 24)
            const xCur = escalaX((horaSimularQueda + i) % 24)
            // Se cruzou meia-noite, evita linha atravessando o gráfico
            if (xCur < xPrev) return null
            return (
              <line key={i} x1={xPrev} y1={escalaY(prev.potenciaEntregueKw)}
                x2={xCur} y2={escalaY(p.potenciaEntregueKw)}
                stroke="#a855f7" strokeWidth={2.5} strokeLinejoin="round" />
            )
          })}

          {/* Linha carga total (amarelo) — em cima de tudo */}
          <path d={pathCarga} fill="none" stroke="#f59e0b" strokeWidth={2.5} strokeLinejoin="round" />

          {/* Eixo X */}
          {[0, 6, 12, 18, 23].map((h) => (
            <g key={h}>
              <line x1={escalaX(h)} y1={innerH} x2={escalaX(h)} y2={innerH + 4} stroke="rgba(255,255,255,0.3)" />
              <text x={escalaX(h)} y={innerH + 16} fontSize={10} fill="rgba(255,255,255,0.6)" textAnchor="middle">
                {h.toString().padStart(2, '0')}h
              </text>
            </g>
          ))}
        </g>
      </svg>

      <div className="mt-3 grid grid-cols-2 md:grid-cols-4 gap-2 text-[10px]">
        <MiniInfo label="Autonomia atendendo carga" valor={`${quedaSim.autonomiaHoras.toFixed(1)}h`} cor="text-verde" />
        <MiniInfo label="Carga crítica" valor={`${cargaCriticaKw.toFixed(1)} kW`} cor="text-sol" />
        <MiniInfo label="Pot. inversor" valor={`${potenciaInversorKw.toFixed(1)} kW`} cor="text-verde" />
        <MiniInfo label="Pot. banco (soma)" valor={`${potenciaBateriaKw.toFixed(1)} kW`} cor="text-coral" />
      </div>

      <p className="mt-2 text-[10px] text-white/50 leading-relaxed">
        💡 <strong>Regra técnica:</strong> potência disponível no backup =
        min(inversor, banco). Se banco &lt; inversor, adicionar baterias em paralelo
        aumenta a potência de despacho instantâneo.
      </p>
    </div>
  )
}

// ══════════════════════════════════════════════════════════════════════
// C. BALANÇO MENSAL 30 DIAS
// ══════════════════════════════════════════════════════════════════════
function BalancoMensal({ pontos, economiaMensalKwh, consumoDaRedeMensal, percentualCoberto }: {
  pontos: ReturnType<typeof simularMesHibrido>
  economiaMensalKwh: number
  consumoDaRedeMensal: number
  percentualCoberto: number
}) {
  const W = 700, H = 200
  const MARGIN = { top: 20, right: 20, bottom: 40, left: 45 }
  const innerW = W - MARGIN.left - MARGIN.right
  const innerH = H - MARGIN.top - MARGIN.bottom
  const maxKwh = Math.max(...pontos.map((p) => Math.max(p.consumoKwh, p.geracaoKwh)), 1)
  const escalaY = (v: number) => innerH - (v / maxKwh) * innerH
  const barW = innerW / 30 - 2

  return (
    <div className="p-5 bg-noite/60 border border-white/10 rounded-xl">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-bold text-white">📅 C. Balanço mensal (30 dias)</h3>
        <div className="flex gap-3 text-[10px]">
          <Legenda cor="#22c55e" label="Geração" bar />
          <Legenda cor="#94a3b8" label="Consumo" bar />
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2 mb-3">
        <KpiCard label="Solar cobre" valor={`${percentualCoberto.toFixed(0)}%`} sub="do consumo total" cor="text-verde" />
        <KpiCard label="Economia mensal" valor={`${economiaMensalKwh.toFixed(0)} kWh`} sub="não vem da rede" cor="text-sol" />
        <KpiCard label="Resta da rede" valor={`${consumoDaRedeMensal.toFixed(0)} kWh`} sub="para cobrar CELESC" cor="text-white/60" />
      </div>

      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" style={{ maxHeight: 200 }}>
        <g transform={`translate(${MARGIN.left},${MARGIN.top})`}>
          {[0, 0.25, 0.5, 0.75, 1].map((f) => (
            <g key={f}>
              <line x1={0} y1={innerH * f} x2={innerW} y2={innerH * f} stroke="rgba(255,255,255,0.06)" />
              <text x={-6} y={innerH * f + 3} fontSize={9} fill="rgba(255,255,255,0.5)" textAnchor="end">
                {(maxKwh * (1 - f)).toFixed(0)}
              </text>
            </g>
          ))}
          <text x={-33} y={innerH / 2} fontSize={9} fill="rgba(255,255,255,0.6)"
            textAnchor="middle" transform={`rotate(-90 -33 ${innerH / 2})`}>kWh</text>

          {pontos.map((p, i) => {
            const x = i * (innerW / 30) + 1
            return (
              <g key={i}>
                <rect x={x} y={escalaY(p.consumoKwh)} width={barW / 2 - 0.5} height={innerH - escalaY(p.consumoKwh)}
                  fill="rgba(148,163,184,0.6)" />
                <rect x={x + barW / 2 + 0.5} y={escalaY(p.geracaoKwh)} width={barW / 2 - 0.5} height={innerH - escalaY(p.geracaoKwh)}
                  fill="#22c55e" />
              </g>
            )
          })}

          {[1, 8, 15, 22, 30].map((d) => (
            <text key={d} x={(d - 1) * (innerW / 30) + barW / 2} y={innerH + 16}
              fontSize={10} fill="rgba(255,255,255,0.6)" textAnchor="middle">dia {d}</text>
          ))}
        </g>
      </svg>
    </div>
  )
}

// ══════════════════════════════════════════════════════════════════════
// Helpers
// ══════════════════════════════════════════════════════════════════════
function Legenda({ cor, label, area, bar, dashed }: {
  cor: string; label: string; area?: boolean; bar?: boolean; dashed?: boolean
}) {
  return (
    <div className="flex items-center gap-1.5">
      {area ? (
        <div style={{ backgroundColor: cor, width: 10, height: 10, opacity: 0.4 }} className="rounded" />
      ) : bar ? (
        <div style={{ backgroundColor: cor, width: 10, height: 10 }} className="rounded-sm" />
      ) : dashed ? (
        <div style={{ borderTop: `2px dashed ${cor}`, width: 14 }} />
      ) : (
        <div style={{ backgroundColor: cor, width: 12, height: 2 }} />
      )}
      <span className="text-white/70">{label}</span>
    </div>
  )
}
function KpiCard({ label, valor, sub, cor }: { label: string; valor: string; sub: string; cor: string }) {
  return (
    <div className="p-2 bg-white/[0.03] border border-white/10 rounded text-center">
      <p className="text-[9px] uppercase text-white/50">{label}</p>
      <p className={`text-lg font-black ${cor}`}>{valor}</p>
      <p className="text-[9px] text-white/40">{sub}</p>
    </div>
  )
}
function MiniInfo({ label, valor, cor }: { label: string; valor: string; cor: string }) {
  return (
    <div className="p-2 bg-white/[0.03] border border-white/10 rounded text-center">
      <p className="text-[9px] uppercase text-white/50 leading-tight">{label}</p>
      <p className={`text-sm font-black ${cor}`}>{valor}</p>
    </div>
  )
}
