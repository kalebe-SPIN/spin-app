'use client'

/**
 * Gráfico de impacto do sistema híbrido — 3 visualizações:
 *   1. Perfil diário 24h (consumo × geração × bateria)
 *   2. Balanço mensal 30 dias (geração × consumo × economia)
 *   3. Autonomia de backup (linha do tempo em caso de queda de energia)
 *
 * SVG puro pra máxima leveza + exportação em PDF.
 */

import {
  simularDiaHibrido,
  simularMesHibrido,
  type PerfilCliente,
} from '@/lib/hibrido/perfil-consumo'

export type ImpactoHibridoProps = {
  perfil?: PerfilCliente               // residencial/comercial/industrial
  consumoMensalKwh: number             // total do cliente
  geracaoMensalEstimadaKwh: number     // do dimensionamento solar
  capacidadeBateriaKwh: number         // do dimensionamento híbrido
  cargaCriticaKw: number               // do backup
  autonomiaHoras: number               // do backup
  usarPeakShaving?: boolean
  horaInicioPonta?: number
  horaFimPonta?: number
}

export function GraficoImpactoHibrido(props: ImpactoHibridoProps) {
  const {
    perfil = 'residencial',
    consumoMensalKwh,
    geracaoMensalEstimadaKwh,
    capacidadeBateriaKwh,
    cargaCriticaKw,
    autonomiaHoras,
    usarPeakShaving = false,
    horaInicioPonta = 18,
    horaFimPonta = 21,
  } = props

  const consumoDiarioKwh = consumoMensalKwh / 30
  const geracaoDiariaKwh = geracaoMensalEstimadaKwh / 30

  const pontos24h = simularDiaHibrido({
    perfil,
    consumoDiarioKwh,
    geracaoDiariaKwh,
    capacidadeBateriaKwh,
    usarPeakShaving,
    horaInicioPonta,
    horaFimPonta,
  })

  const pontosMes = simularMesHibrido({
    perfil,
    consumoMensalKwh,
    geracaoMensalKwh: geracaoMensalEstimadaKwh,
  })

  const economiaMensalKwh = pontosMes.reduce((s, p) => s + p.economiaKwh, 0)
  const consumoDaRedeMensal = pontosMes.reduce((s, p) => s + p.consumoDaRedeKwh, 0)
  const percentualCoberto = (economiaMensalKwh / consumoMensalKwh) * 100

  return (
    <div className="space-y-6">
      <PerfilDiarioGrafico
        pontos={pontos24h}
        usarPeakShaving={usarPeakShaving}
        horaInicioPonta={horaInicioPonta}
        horaFimPonta={horaFimPonta}
      />
      <BalancoMensalGrafico
        pontos={pontosMes}
        economiaMensalKwh={economiaMensalKwh}
        consumoDaRedeMensal={consumoDaRedeMensal}
        percentualCoberto={percentualCoberto}
      />
      <AutonomiaBackupGrafico
        cargaCriticaKw={cargaCriticaKw}
        capacidadeBateriaKwh={capacidadeBateriaKwh}
        autonomiaHoras={autonomiaHoras}
      />
    </div>
  )
}

// ══════════════════════════════════════════════════════════════════════
// 1. PERFIL DIÁRIO 24h
// ══════════════════════════════════════════════════════════════════════
function PerfilDiarioGrafico({ pontos, usarPeakShaving, horaInicioPonta, horaFimPonta }: {
  pontos: ReturnType<typeof simularDiaHibrido>
  usarPeakShaving: boolean
  horaInicioPonta: number
  horaFimPonta: number
}) {
  const W = 700
  const H = 260
  const MARGIN = { top: 20, right: 20, bottom: 40, left: 45 }
  const innerW = W - MARGIN.left - MARGIN.right
  const innerH = H - MARGIN.top - MARGIN.bottom

  const maxPot = Math.max(
    ...pontos.map((p) => Math.max(p.consumoKw, p.geracaoKw)),
    0.1,
  )
  const escalaY = (kw: number) => innerH - (kw / maxPot) * innerH
  const escalaX = (h: number) => (h / 23) * innerW

  const pathConsumo = pontos.map((p, i) =>
    `${i === 0 ? 'M' : 'L'} ${escalaX(p.hora)} ${escalaY(p.consumoKw)}`).join(' ')

  const pathGeracao = pontos.map((p, i) =>
    `${i === 0 ? 'M' : 'L'} ${escalaX(p.hora)} ${escalaY(p.geracaoKw)}`).join(' ')

  const areaConsumoRede = [
    `M ${escalaX(0)} ${escalaY(0)}`,
    ...pontos.map((p) => `L ${escalaX(p.hora)} ${escalaY(p.consumoDaRedeKw)}`),
    `L ${escalaX(23)} ${escalaY(0)} Z`,
  ].join(' ')

  return (
    <div className="p-5 bg-noite/60 border border-white/10 rounded-xl">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-bold text-white">
          📊 Perfil diário (24h) — consumo × geração × bateria
        </h3>
        <div className="flex gap-3 text-[10px]">
          <Legenda cor="#f59e0b" label="Consumo" />
          <Legenda cor="#22c55e" label="Geração solar" />
          <Legenda cor="#94a3b8" label="Consumo da rede" area />
          {usarPeakShaving && <Legenda cor="#3b82f6" label="Peak shaving" area />}
        </div>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" style={{ maxHeight: 260 }}>
        <g transform={`translate(${MARGIN.left},${MARGIN.top})`}>
          {/* Grid horizontal */}
          {[0, 0.25, 0.5, 0.75, 1].map((f) => (
            <g key={f}>
              <line x1={0} y1={innerH * f} x2={innerW} y2={innerH * f}
                stroke="rgba(255,255,255,0.06)" strokeWidth={1} />
              <text x={-6} y={innerH * f + 3} fontSize={9} fill="rgba(255,255,255,0.5)" textAnchor="end">
                {(maxPot * (1 - f)).toFixed(1)}
              </text>
            </g>
          ))}
          <text x={-33} y={innerH / 2} fontSize={9} fill="rgba(255,255,255,0.6)"
            textAnchor="middle" transform={`rotate(-90 -33 ${innerH / 2})`}>
            kW
          </text>

          {/* Faixa de horário de ponta */}
          {usarPeakShaving && (
            <rect
              x={escalaX(horaInicioPonta)}
              y={0}
              width={escalaX(horaFimPonta) - escalaX(horaInicioPonta)}
              height={innerH}
              fill="rgba(59,130,246,0.10)"
              stroke="rgba(59,130,246,0.30)"
              strokeDasharray="3 3"
            />
          )}

          {/* Área do consumo da rede (cinza) */}
          <path d={areaConsumoRede} fill="rgba(148,163,184,0.35)" />

          {/* Linha de geração solar (verde) */}
          <path d={pathGeracao} fill="none" stroke="#22c55e" strokeWidth={2.5}
            strokeLinejoin="round" strokeLinecap="round" />

          {/* Linha de consumo (amarelo) */}
          <path d={pathConsumo} fill="none" stroke="#f59e0b" strokeWidth={2.5}
            strokeLinejoin="round" strokeLinecap="round" />

          {/* Descarga da bateria (peak shaving) — pequenas barras azuis */}
          {usarPeakShaving && pontos.map((p) => (
            p.descargaBateriaKw > 0 ? (
              <rect key={p.hora}
                x={escalaX(p.hora) - 5}
                y={escalaY(p.descargaBateriaKw + p.consumoDaRedeKw)}
                width={10}
                height={escalaY(p.consumoDaRedeKw) - escalaY(p.descargaBateriaKw + p.consumoDaRedeKw)}
                fill="rgba(59,130,246,0.7)"
              />
            ) : null
          ))}

          {/* Eixo X (horas) */}
          {[0, 6, 12, 18, 23].map((h) => (
            <g key={h}>
              <line x1={escalaX(h)} y1={innerH} x2={escalaX(h)} y2={innerH + 4}
                stroke="rgba(255,255,255,0.3)" />
              <text x={escalaX(h)} y={innerH + 16} fontSize={10}
                fill="rgba(255,255,255,0.6)" textAnchor="middle">
                {h.toString().padStart(2, '0')}h
              </text>
            </g>
          ))}
        </g>
      </svg>
      <p className="text-[10px] text-white/50 mt-2 leading-relaxed">
        <strong className="text-verde">Verde</strong> = quando a solar tá gerando (dia).
        A <strong className="text-white/70">área cinza</strong> mostra o que ainda precisa vir da rede — quanto menor, melhor.
        {usarPeakShaving && (
          <> As <strong style={{ color: '#3b82f6' }}>barras azuis</strong> nas <strong>{horaInicioPonta}h-{horaFimPonta}h</strong> mostram a bateria descarregando pra evitar o horário caro da CELESC.</>
        )}
      </p>
    </div>
  )
}

// ══════════════════════════════════════════════════════════════════════
// 2. BALANÇO MENSAL 30 DIAS
// ══════════════════════════════════════════════════════════════════════
function BalancoMensalGrafico({ pontos, economiaMensalKwh, consumoDaRedeMensal, percentualCoberto }: {
  pontos: ReturnType<typeof simularMesHibrido>
  economiaMensalKwh: number
  consumoDaRedeMensal: number
  percentualCoberto: number
}) {
  const W = 700
  const H = 240
  const MARGIN = { top: 20, right: 20, bottom: 40, left: 45 }
  const innerW = W - MARGIN.left - MARGIN.right
  const innerH = H - MARGIN.top - MARGIN.bottom

  const maxKwh = Math.max(...pontos.map((p) => Math.max(p.consumoKwh, p.geracaoKwh)), 1)
  const escalaY = (v: number) => innerH - (v / maxKwh) * innerH
  const barW = innerW / 30 - 2

  return (
    <div className="p-5 bg-noite/60 border border-white/10 rounded-xl">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-bold text-white">
          📅 Balanço mensal (30 dias) — geração × consumo
        </h3>
        <div className="flex gap-3 text-[10px]">
          <Legenda cor="#22c55e" label="Geração" bar />
          <Legenda cor="#94a3b8" label="Consumo" bar />
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-3 gap-2 mb-3">
        <KpiCard label="Solar cobre" valor={`${percentualCoberto.toFixed(0)}%`}
          sub="do consumo total" cor="text-verde" />
        <KpiCard label="Economia mensal" valor={`${economiaMensalKwh.toFixed(0)} kWh`}
          sub="não vem da rede" cor="text-sol" />
        <KpiCard label="Resta da rede" valor={`${consumoDaRedeMensal.toFixed(0)} kWh`}
          sub="para cobrar CELESC" cor="text-white/60" />
      </div>

      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" style={{ maxHeight: 240 }}>
        <g transform={`translate(${MARGIN.left},${MARGIN.top})`}>
          {[0, 0.25, 0.5, 0.75, 1].map((f) => (
            <g key={f}>
              <line x1={0} y1={innerH * f} x2={innerW} y2={innerH * f}
                stroke="rgba(255,255,255,0.06)" />
              <text x={-6} y={innerH * f + 3} fontSize={9} fill="rgba(255,255,255,0.5)" textAnchor="end">
                {(maxKwh * (1 - f)).toFixed(0)}
              </text>
            </g>
          ))}
          <text x={-33} y={innerH / 2} fontSize={9} fill="rgba(255,255,255,0.6)"
            textAnchor="middle" transform={`rotate(-90 -33 ${innerH / 2})`}>
            kWh
          </text>

          {/* Barras duplas */}
          {pontos.map((p, i) => {
            const x = i * (innerW / 30) + 1
            return (
              <g key={i}>
                <rect x={x} y={escalaY(p.consumoKwh)}
                  width={barW / 2 - 0.5} height={innerH - escalaY(p.consumoKwh)}
                  fill="rgba(148,163,184,0.6)" />
                <rect x={x + barW / 2 + 0.5} y={escalaY(p.geracaoKwh)}
                  width={barW / 2 - 0.5} height={innerH - escalaY(p.geracaoKwh)}
                  fill="#22c55e" />
              </g>
            )
          })}

          {/* Eixo X */}
          {[1, 8, 15, 22, 30].map((d) => (
            <text key={d} x={(d - 1) * (innerW / 30) + barW / 2}
              y={innerH + 16} fontSize={10} fill="rgba(255,255,255,0.6)" textAnchor="middle">
              dia {d}
            </text>
          ))}
        </g>
      </svg>
    </div>
  )
}

// ══════════════════════════════════════════════════════════════════════
// 3. AUTONOMIA DE BACKUP
// ══════════════════════════════════════════════════════════════════════
function AutonomiaBackupGrafico({ cargaCriticaKw, capacidadeBateriaKwh, autonomiaHoras }: {
  cargaCriticaKw: number
  capacidadeBateriaKwh: number
  autonomiaHoras: number
}) {
  const W = 700
  const H = 180
  const MARGIN = { top: 20, right: 20, bottom: 40, left: 45 }
  const innerW = W - MARGIN.left - MARGIN.right
  const innerH = H - MARGIN.top - MARGIN.bottom
  const horasEixo = Math.ceil(autonomiaHoras + 2)
  const escalaX = (h: number) => (h / horasEixo) * innerW

  return (
    <div className="p-5 bg-coral/5 border border-coral/20 rounded-xl">
      <div className="flex items-center justify-between mb-3">
        <div>
          <h3 className="text-sm font-bold text-white">
            🔋 Autonomia em caso de queda de energia
          </h3>
          <p className="text-[10px] text-white/50 mt-0.5">
            Descarga do banco de {capacidadeBateriaKwh.toFixed(1)}kWh alimentando {cargaCriticaKw.toFixed(1)}kW de carga crítica
          </p>
        </div>
        <div className="text-right">
          <p className="text-2xl font-black text-coral">{autonomiaHoras.toFixed(1)}h</p>
          <p className="text-[9px] uppercase text-white/40">autonomia real</p>
        </div>
      </div>

      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" style={{ maxHeight: 180 }}>
        <g transform={`translate(${MARGIN.left},${MARGIN.top})`}>
          {/* Marca do momento da queda */}
          <line x1={0} y1={0} x2={0} y2={innerH} stroke="#ef4444" strokeWidth={2}
            strokeDasharray="4 3" />
          <text x={2} y={-6} fontSize={10} fill="#ef4444" fontWeight="bold">
            ⚡ QUEDA
          </text>

          {/* Área da carga sustentada */}
          <rect x={0} y={innerH * 0.2}
            width={escalaX(autonomiaHoras)} height={innerH * 0.5}
            fill="url(#gradBateria)" />

          {/* Gradiente da bateria diminuindo */}
          <defs>
            <linearGradient id="gradBateria" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor="#22c55e" stopOpacity="0.7" />
              <stop offset="70%" stopColor="#f59e0b" stopOpacity="0.6" />
              <stop offset="100%" stopColor="#ef4444" stopOpacity="0.5" />
            </linearGradient>
          </defs>

          {/* Fim da autonomia */}
          <line
            x1={escalaX(autonomiaHoras)} y1={0}
            x2={escalaX(autonomiaHoras)} y2={innerH}
            stroke="#ef4444" strokeWidth={2} strokeDasharray="2 2" />
          <text x={escalaX(autonomiaHoras) + 4} y={12} fontSize={10} fill="#ef4444" fontWeight="bold">
            ⚠️ BATERIA VAZIA
          </text>

          {/* Ícones dentro da faixa */}
          <text x={escalaX(0.5)} y={innerH * 0.5} fontSize={16}>🔋</text>
          <text x={escalaX(autonomiaHoras / 2)} y={innerH * 0.5} fontSize={16}>🏠</text>
          <text x={escalaX(autonomiaHoras) - 24} y={innerH * 0.5} fontSize={16}>⏰</text>

          {/* Eixo horas */}
          {Array.from({ length: horasEixo + 1 }, (_, i) => i).map((h) => (
            <g key={h}>
              <line x1={escalaX(h)} y1={innerH} x2={escalaX(h)} y2={innerH + 4}
                stroke="rgba(255,255,255,0.3)" />
              <text x={escalaX(h)} y={innerH + 16} fontSize={10}
                fill="rgba(255,255,255,0.6)" textAnchor="middle">
                {h}h
              </text>
            </g>
          ))}
        </g>
      </svg>

      <div className="grid grid-cols-3 gap-2 mt-3 text-[10px]">
        <div className="p-2 bg-noite/40 border border-white/10 rounded text-center">
          <p className="text-white/50">Início</p>
          <p className="text-verde font-bold">100% SOC</p>
        </div>
        <div className="p-2 bg-noite/40 border border-white/10 rounded text-center">
          <p className="text-white/50">Meia autonomia</p>
          <p className="text-sol font-bold">50% SOC · {(autonomiaHoras / 2).toFixed(1)}h</p>
        </div>
        <div className="p-2 bg-noite/40 border border-white/10 rounded text-center">
          <p className="text-white/50">Corte automático</p>
          <p className="text-coral font-bold">10% SOC (LiFePO4)</p>
        </div>
      </div>
    </div>
  )
}

// ══════════════════════════════════════════════════════════════════════
// Helpers de UI
// ══════════════════════════════════════════════════════════════════════
function Legenda({ cor, label, area, bar }: { cor: string; label: string; area?: boolean; bar?: boolean }) {
  return (
    <div className="flex items-center gap-1.5">
      {area ? (
        <div style={{ backgroundColor: cor, width: 10, height: 10, opacity: 0.4 }} className="rounded" />
      ) : bar ? (
        <div style={{ backgroundColor: cor, width: 10, height: 10 }} className="rounded-sm" />
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
