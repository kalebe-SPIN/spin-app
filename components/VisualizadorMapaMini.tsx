// @ts-nocheck
'use client'

/**
 * Visualizador de mapa satélite completo — Kalebe 2026-08-31.
 *
 * Batch 1:
 * - Pino draggable via OverlayView custom (Pointer Events, drag garantido)
 * - Toggle Mapa Satélite ↔ Street View embutido (StreetViewPanorama)
 * - Botão 📷 Print aérea (Static Maps API → download PNG)
 * - Botão 🎥 Print da rua (Static Street View API → download PNG)
 * - Botão 📐 Medir área (DrawingManager POLYGON + computeArea)
 * - Botão 🔬 Vetorizar (Google Solar API → desenha polígonos coloridos)
 *
 * Callbacks pro parent:
 * - onArrastar: pino movido
 * - onAreaMedida: polígono desenhado → { area, pontos }
 * - onSolarPronto: resultado da Solar API
 * - onPrintPronto: PNG gerado (dataURL)
 */

import { useEffect, useRef, useState } from 'react'
import { setOptions, importLibrary } from '@googlemaps/js-api-loader'
import { buscarSolarInsights, type SolarInsights } from '@/lib/googleSolar'

type PontoLatLng = { lat: number; lng: number }

type Props = {
  lat: number
  lng: number
  apiKey?: string
  altura?: number
  zoom?: number
  onArrastar?: (lat: number, lng: number) => void
  onAreaMedida?: (dados: { areaM2: number; pontos: PontoLatLng[] }) => void
  onSolarPronto?: (solar: SolarInsights) => void
  onPrintPronto?: (dados: { tipo: 'aerea' | 'rua'; dataUrl: string }) => void
}

const CORES_SEG = ['#f59e0b', '#3b82f6', '#10b981', '#ef4444', '#a855f7', '#ec4899']

export function VisualizadorMapaMini({
  lat, lng, apiKey, altura = 320, zoom = 20,
  onArrastar, onAreaMedida, onSolarPronto, onPrintPronto,
}: Props) {
  const mapaRef = useRef<HTMLDivElement>(null)
  const streetRef = useRef<HTMLDivElement>(null)
  const overlayRef = useRef<any>(null)
  const mapRef = useRef<any>(null)
  const drawManRef = useRef<any>(null)
  const polySolarRef = useRef<any[]>([])
  const polyMedidoRef = useRef<any>(null)
  const streetViewRef = useRef<any>(null)
  const posicaoRef = useRef({ lat, lng })
  const onArrastarRef = useRef(onArrastar)
  useEffect(() => { onArrastarRef.current = onArrastar }, [onArrastar])

  const [erro, setErro] = useState<string | null>(null)
  const [carregando, setCarregando] = useState(true)
  const [modo, setModo] = useState<'mapa' | 'rua'>('mapa')
  const [medindo, setMedindo] = useState(false)
  const [areaMedida, setAreaMedida] = useState<number | null>(null)
  const [buscandoSolar, setBuscandoSolar] = useState(false)
  const [solar, setSolar] = useState<SolarInsights | null>(null)
  const [msgAcao, setMsgAcao] = useState<string | null>(null)

  const KEY =
    apiKey ||
    process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ||
    'AIzaSyDAHavsflEo_Ju2JdT_hHG0u663vOJMzts'

  useEffect(() => {
    if (!mapaRef.current) return
    if (!KEY) { setErro('Chave Google Maps não configurada'); setCarregando(false); return }
    let cancelado = false

    setOptions({ key: KEY, v: 'weekly', language: 'pt-BR', region: 'BR' })

    Promise.all([
      importLibrary('maps'),
      importLibrary('drawing'),
      importLibrary('geometry'),
      importLibrary('streetView'),
    ]).then(() => {
      if (cancelado || !mapaRef.current) return
      const google = (window as any).google
      const map = new google.maps.Map(mapaRef.current, {
        center: { lat, lng },
        zoom,
        mapTypeId: 'satellite',
        tilt: 0,
        streetViewControl: false, // temos nosso próprio toggle
        mapTypeControl: false,
        zoomControl: true,
        fullscreenControl: true,
        gestureHandling: 'greedy',
        clickableIcons: false,
      })
      mapRef.current = map

      // ============ PINO DIV CUSTOM COM DRAG ============
      class PinoOverlay extends google.maps.OverlayView {
        pos: any; div: HTMLDivElement | null = null
        arrastando = false; pointerId: number | null = null
        offsetX = 0; offsetY = 0
        constructor(pos: any) { super(); this.pos = pos }
        onAdd() {
          const div = document.createElement('div')
          div.style.cssText = `position:absolute;cursor:${onArrastar ? 'grab' : 'pointer'};user-select:none;touch-action:none;z-index:9999;transform:translate(-50%,-100%);pointer-events:auto`
          div.title = onArrastar ? 'Arraste pra ajustar' : ''
          div.innerHTML = `<svg width="36" height="48" viewBox="0 0 36 48" xmlns="http://www.w3.org/2000/svg" style="filter:drop-shadow(0 2px 4px rgba(0,0,0,.5))"><path d="M18 0C8 0 0 8 0 18c0 12 18 30 18 30s18-18 18-30C36 8 28 0 18 0z" fill="#ef4444" stroke="#7f1d1d" stroke-width="2"/><circle cx="18" cy="18" r="6" fill="#fff"/></svg>`
          this.div = div
          if (onArrastar) {
            div.addEventListener('pointerdown', (e) => {
              e.preventDefault(); e.stopPropagation()
              this.arrastando = true; this.pointerId = e.pointerId
              div.setPointerCapture(e.pointerId)
              div.style.cursor = 'grabbing'
              const r = div.getBoundingClientRect()
              this.offsetX = e.clientX - (r.left + r.width / 2)
              this.offsetY = e.clientY - (r.top + r.height)
            })
            div.addEventListener('pointermove', (e) => {
              if (!this.arrastando) return
              e.preventDefault(); e.stopPropagation()
              const proj = this.getProjection(); if (!proj) return
              const mr = map.getDiv().getBoundingClientRect()
              const p = proj.fromContainerPixelToLatLng(new google.maps.Point(
                e.clientX - mr.left - this.offsetX,
                e.clientY - mr.top - this.offsetY,
              ))
              if (!p) return
              this.pos = p
              posicaoRef.current = { lat: p.lat(), lng: p.lng() }
              this.draw()
            })
            const soltar = (e: PointerEvent) => {
              if (!this.arrastando) return
              this.arrastando = false
              try { div.releasePointerCapture(e.pointerId) } catch {}
              div.style.cursor = 'grab'
              const p = posicaoRef.current
              if (onArrastarRef.current) onArrastarRef.current(p.lat, p.lng)
            }
            div.addEventListener('pointerup', soltar)
            div.addEventListener('pointercancel', soltar)
          }
          this.getPanes().overlayMouseTarget.appendChild(div)
        }
        draw() {
          const proj = this.getProjection(); if (!proj || !this.div) return
          const p = proj.fromLatLngToDivPixel(this.pos); if (!p) return
          this.div.style.left = p.x + 'px'; this.div.style.top = p.y + 'px'
        }
        onRemove() { if (this.div?.parentNode) this.div.parentNode.removeChild(this.div); this.div = null }
        setPosicaoExterna(pos: any) {
          this.pos = pos
          posicaoRef.current = { lat: pos.lat(), lng: pos.lng() }
          this.draw()
        }
        estaArrastando() { return this.arrastando }
      }
      const overlay = new PinoOverlay(new google.maps.LatLng(lat, lng))
      overlay.setMap(map)
      overlayRef.current = overlay

      if (onArrastar) {
        map.addListener('click', (e: any) => {
          if (medindo) return // click no modo medir vai pro DrawingManager
          const p = e.latLng; if (!p) return
          overlay.setPosicaoExterna(p); map.panTo(p)
          if (onArrastarRef.current) onArrastarRef.current(p.lat(), p.lng())
        })
      }

      // Street View panorama (criado uma vez, escondido)
      if (streetRef.current) {
        const sv = new google.maps.StreetViewPanorama(streetRef.current, {
          position: { lat, lng },
          pov: { heading: 0, pitch: 0 },
          zoom: 1,
          motionTracking: false,
          motionTrackingControl: false,
          addressControl: false,
          linksControl: true,
          panControl: true,
          fullscreenControl: false,
          enableCloseButton: false,
        })
        streetViewRef.current = sv
      }

      setCarregando(false)
    }).catch((e: any) => {
      if (!cancelado) { setErro(e?.message || 'Falha ao carregar'); setCarregando(false) }
    })

    return () => {
      cancelado = true
      if (overlayRef.current) { try { overlayRef.current.setMap(null) } catch {} }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [KEY, zoom, !!onArrastar])

  // Sincroniza pino com props externas (guard anti-teleporte durante drag)
  useEffect(() => {
    const o = overlayRef.current
    if (!o || o.estaArrastando?.()) return
    const cur = posicaoRef.current
    if (Math.abs(cur.lat - lat) > 1e-7 || Math.abs(cur.lng - lng) > 1e-7) {
      const google = (window as any).google
      if (google?.maps?.LatLng) o.setPosicaoExterna(new google.maps.LatLng(lat, lng))
    }
    // Street View também
    if (streetViewRef.current) {
      streetViewRef.current.setPosition({ lat, lng })
    }
  }, [lat, lng])

  // ============ AÇÕES ============
  function baixarPNG(url: string, nome: string) {
    const a = document.createElement('a')
    a.href = url; a.download = nome
    document.body.appendChild(a); a.click(); a.remove()
  }

  function printAerea() {
    const url =
      `https://maps.googleapis.com/maps/api/staticmap?center=${lat},${lng}` +
      `&zoom=${zoom}&size=640x480&scale=2&maptype=satellite` +
      `&markers=color:red%7C${lat},${lng}&key=${KEY}`
    baixarPNG(url, `telhado-aerea-${lat.toFixed(5)}-${lng.toFixed(5)}.png`)
    if (onPrintPronto) onPrintPronto({ tipo: 'aerea', dataUrl: url })
    setMsgAcao('📷 Print aéreo baixado')
    setTimeout(() => setMsgAcao(null), 3000)
  }

  function printRua() {
    // Se está na vista Street View, pega heading atual; senão, olha pro pino
    let heading = 0, pitch = 0
    if (streetViewRef.current) {
      const pov = streetViewRef.current.getPov()
      heading = pov?.heading || 0
      pitch = pov?.pitch || 0
    }
    const url =
      `https://maps.googleapis.com/maps/api/streetview?location=${lat},${lng}` +
      `&size=640x480&heading=${heading}&pitch=${pitch}&fov=90&key=${KEY}`
    baixarPNG(url, `telhado-rua-${lat.toFixed(5)}-${lng.toFixed(5)}.png`)
    if (onPrintPronto) onPrintPronto({ tipo: 'rua', dataUrl: url })
    setMsgAcao('🎥 Print da rua baixado')
    setTimeout(() => setMsgAcao(null), 3000)
  }

  async function iniciarMedir() {
    const google = (window as any).google
    if (!google || !mapRef.current) return
    // Limpa polígono anterior
    if (polyMedidoRef.current) { polyMedidoRef.current.setMap(null); polyMedidoRef.current = null }
    setAreaMedida(null)
    setMedindo(true)
    setMsgAcao('Clica os cantos do telhado, duplo-clique no último pra fechar.')

    const dm = new google.maps.drawing.DrawingManager({
      drawingMode: google.maps.drawing.OverlayType.POLYGON,
      drawingControl: false,
      polygonOptions: {
        fillColor: '#f59e0b', fillOpacity: 0.35,
        strokeColor: '#f59e0b', strokeWeight: 2,
        clickable: false, editable: true, draggable: false, zIndex: 5000,
      },
    })
    dm.setMap(mapRef.current)
    drawManRef.current = dm

    google.maps.event.addListenerOnce(dm, 'polygoncomplete', (poly: any) => {
      dm.setMap(null); drawManRef.current = null
      polyMedidoRef.current = poly
      const path = poly.getPath()
      const area = google.maps.geometry.spherical.computeArea(path)
      const pontos: PontoLatLng[] = []
      for (let i = 0; i < path.getLength(); i++) {
        const p = path.getAt(i); pontos.push({ lat: p.lat(), lng: p.lng() })
      }
      setAreaMedida(area)
      setMedindo(false)
      setMsgAcao(null)
      if (onAreaMedida) onAreaMedida({ areaM2: Number(area.toFixed(2)), pontos })
      // Listener pra recalcular se editar
      path.addListener('set_at', () => recalcAreaMedida())
      path.addListener('insert_at', () => recalcAreaMedida())
    })
  }

  function recalcAreaMedida() {
    const google = (window as any).google
    if (!polyMedidoRef.current) return
    const path = polyMedidoRef.current.getPath()
    const area = google.maps.geometry.spherical.computeArea(path)
    setAreaMedida(area)
    const pontos: PontoLatLng[] = []
    for (let i = 0; i < path.getLength(); i++) {
      const p = path.getAt(i); pontos.push({ lat: p.lat(), lng: p.lng() })
    }
    if (onAreaMedida) onAreaMedida({ areaM2: Number(area.toFixed(2)), pontos })
  }

  function limparMedicao() {
    if (polyMedidoRef.current) { polyMedidoRef.current.setMap(null); polyMedidoRef.current = null }
    if (drawManRef.current) { drawManRef.current.setMap(null); drawManRef.current = null }
    setAreaMedida(null); setMedindo(false)
  }

  async function vetorizarComSolar() {
    setBuscandoSolar(true); setMsgAcao('🔬 Consultando Google Solar…')
    try {
      const s = await buscarSolarInsights(lat, lng)
      if (!s) {
        setMsgAcao('❌ Google Solar não tem cobertura desta área. Use a régua manual.')
        setTimeout(() => setMsgAcao(null), 5000)
        return
      }
      setSolar(s)
      desenharSegmentosSolar(s)
      setMsgAcao(`✓ ${s.segmentos?.length || 0} face(s) detectada(s) · qualidade ${s.qualidade}`)
      if (onSolarPronto) onSolarPronto(s)
    } catch (e: any) {
      setMsgAcao(`❌ Erro Solar: ${e?.message || 'desconhecido'}`)
      setTimeout(() => setMsgAcao(null), 5000)
    } finally {
      setBuscandoSolar(false)
    }
  }

  function desenharSegmentosSolar(s: SolarInsights) {
    const google = (window as any).google
    if (!google || !mapRef.current) return
    // Limpa desenhos anteriores
    polySolarRef.current.forEach((p) => p.setMap(null))
    polySolarRef.current = []
    ;(s.segmentos || []).forEach((seg, idx) => {
      if (!seg.boundingBox) return
      const cor = CORES_SEG[idx % CORES_SEG.length]
      const rect = new google.maps.Rectangle({
        bounds: {
          south: seg.boundingBox.sw.lat, west: seg.boundingBox.sw.lng,
          north: seg.boundingBox.ne.lat, east: seg.boundingBox.ne.lng,
        },
        fillColor: cor, fillOpacity: 0.35,
        strokeColor: cor, strokeWeight: 2,
        map: mapRef.current, zIndex: 4000, clickable: true,
      })
      const info = new google.maps.InfoWindow({
        content: `<div style="font-family:sans-serif;font-size:12px;color:#000">
          <b>Face ${idx + 1}</b><br>
          Área: ${seg.areaM2} m²<br>
          Inclinação: ${seg.inclinacaoGraus}°<br>
          Orientação: ${seg.orientacaoGraus}° (${orientacaoNome(seg.orientacaoGraus)})
        </div>`,
      })
      rect.addListener('click', (e: any) => {
        info.setPosition(e.latLng); info.open(mapRef.current)
      })
      polySolarRef.current.push(rect)
    })
  }

  function limparSolar() {
    polySolarRef.current.forEach((p) => p.setMap(null))
    polySolarRef.current = []
    setSolar(null)
  }

  // Fallback iframe se sem chave
  if (erro && !KEY) {
    return (
      <iframe title="Mapa" className="w-full rounded border border-white/10"
        style={{ height: altura }} loading="lazy"
        src={`https://www.google.com/maps?q=${lat},${lng}&hl=pt-BR&z=${zoom}&output=embed`} />
    )
  }

  return (
    <div className="space-y-2">
      {/* TOOLBAR */}
      <div className="flex flex-wrap items-center gap-2 p-2 bg-noite/40 border border-white/10 rounded">
        <div className="flex rounded overflow-hidden border border-white/10">
          <button type="button" onClick={() => setModo('mapa')}
            className={`px-3 py-1.5 text-[11px] font-bold ${modo === 'mapa' ? 'bg-sol text-noite' : 'bg-transparent text-white/60 hover:bg-white/5'}`}>
            🛰 Aérea
          </button>
          <button type="button" onClick={() => setModo('rua')}
            className={`px-3 py-1.5 text-[11px] font-bold ${modo === 'rua' ? 'bg-verde text-noite' : 'bg-transparent text-white/60 hover:bg-white/5'}`}>
            🎥 Rua
          </button>
        </div>

        <button type="button" onClick={modo === 'mapa' ? printAerea : printRua}
          className="px-3 py-1.5 text-[11px] font-bold bg-white/5 border border-white/10 rounded text-white hover:bg-white/10">
          📷 Print {modo === 'mapa' ? 'aérea' : 'da rua'}
        </button>

        {modo === 'mapa' && (
          <>
            <button type="button" onClick={medindo ? limparMedicao : iniciarMedir}
              className={`px-3 py-1.5 text-[11px] font-bold rounded border ${medindo ? 'bg-coral/20 border-coral/40 text-coral' : 'bg-sol/10 border-sol/40 text-sol hover:bg-sol/20'}`}>
              {medindo ? '✕ Cancelar' : '📐 Medir área'}
            </button>

            <button type="button" onClick={buscandoSolar ? undefined : vetorizarComSolar}
              disabled={buscandoSolar}
              className="px-3 py-1.5 text-[11px] font-bold bg-verde/10 border border-verde/40 rounded text-verde hover:bg-verde/20 disabled:opacity-50">
              {buscandoSolar ? '⏳ Analisando…' : '🔬 Vetorizar (Solar)'}
            </button>

            {(areaMedida != null || solar) && (
              <button type="button" onClick={() => { limparMedicao(); limparSolar() }}
                className="ml-auto px-2 py-1 text-[10px] text-white/50 hover:text-white/80">
                Limpar
              </button>
            )}
          </>
        )}
      </div>

      {/* AVISOS */}
      {msgAcao && (
        <p className="text-[11px] px-3 py-1.5 bg-sol/10 border border-sol/30 rounded text-sol">
          {msgAcao}
        </p>
      )}

      {/* Área medida */}
      {areaMedida != null && (
        <div className="px-3 py-2 bg-verde/10 border border-verde/30 rounded text-[11px] text-verde flex items-center gap-3">
          <span className="text-lg">📐</span>
          <div className="flex-1">
            <b>Área medida:</b> {areaMedida.toFixed(1)} m²
            <span className="text-white/50 ml-2">
              (~{Math.floor(areaMedida / 2.5)} placas 550W estimadas)
            </span>
          </div>
          <span className="text-[10px] text-white/40">arraste os cantos pra ajustar</span>
        </div>
      )}

      {/* Solar */}
      {solar && (
        <div className="px-3 py-2 bg-verde/10 border border-verde/30 rounded text-[11px] text-white space-y-1">
          <p className="font-bold text-verde">🔬 Google Solar — {solar.segmentos?.length || 0} face(s) detectada(s)</p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-white/80">
            <div><b className="text-verde">{solar.maxPlacas}</b> placas máx</div>
            <div><b className="text-verde">{solar.potenciaMaxKwp}</b> kWp</div>
            <div><b className="text-verde">{solar.areaUtilM2}</b> m² úteis</div>
            <div><b className="text-verde">{(solar.geracaoAnualKwh / 12).toFixed(0)}</b> kWh/mês</div>
          </div>
          <p className="text-white/40 text-[10px]">Qualidade da imagem aérea: {solar.qualidade} · clique nas faces coloridas pra ver detalhes</p>
        </div>
      )}

      {/* CONTAINERS MAPA + STREET VIEW */}
      <div
        className="relative rounded border border-white/10 overflow-hidden"
        style={{ height: altura, touchAction: 'none' }}
        onMouseDown={(e) => e.stopPropagation()}
        onTouchStart={(e) => e.stopPropagation()}
        onKeyDown={(e) => { if (e.key === 'Enter') e.preventDefault() }}
      >
        <div ref={mapaRef} className="w-full h-full"
          style={{ display: modo === 'mapa' ? 'block' : 'none', touchAction: 'none' }} />
        <div ref={streetRef} className="w-full h-full"
          style={{ display: modo === 'rua' ? 'block' : 'none' }} />
        {carregando && (
          <div className="absolute inset-0 flex items-center justify-center bg-noite/60 text-xs text-white/60">
            🛰 Carregando…
          </div>
        )}
        {erro && !carregando && (
          <div className="absolute inset-0 flex items-center justify-center bg-noite/80 text-xs text-coral p-3 text-center">
            ⚠ {erro}
          </div>
        )}
      </div>
    </div>
  )
}

function orientacaoNome(azimuth: number): string {
  const a = ((azimuth % 360) + 360) % 360
  if (a < 22.5 || a >= 337.5) return 'N'
  if (a < 67.5) return 'NE'
  if (a < 112.5) return 'E'
  if (a < 157.5) return 'SE'
  if (a < 202.5) return 'S'
  if (a < 247.5) return 'SO'
  if (a < 292.5) return 'O'
  return 'NO'
}
