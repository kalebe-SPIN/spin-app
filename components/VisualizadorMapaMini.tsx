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
  // Ref pra o listener do click do mapa NÃO ficar com closure stale
  const medindoRef = useRef(false)
  useEffect(() => { medindoRef.current = medindo }, [medindo])
  const [areaMedida, setAreaMedida] = useState<number | null>(null)
  const [buscandoSolar, setBuscandoSolar] = useState(false)
  const [solar, setSolar] = useState<SolarInsights | null>(null)
  const [msgAcao, setMsgAcao] = useState<string | null>(null)
  // Prints capturados — preview embutido em vez de abrir em nova aba
  const [printsFeitos, setPrintsFeitos] = useState<Array<{
    tipo: 'aerea' | 'rua'; blobUrl: string; nome: string
  }>>([])

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
          // Usa ref (não a var do closure) — sem isso o listener nunca
          // via o estado atualizado e sempre movia o pino.
          if (medindoRef.current) return
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
  // Download REAL via fetch+blob — sem passar pelo browser abrir a URL
  // (isso evita extensões tipo Adobe Express interceptarem a imagem).
  async function baixarComoBlob(url: string, nome: string): Promise<string | null> {
    try {
      const res = await fetch(url)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const blob = await res.blob()
      const blobUrl = URL.createObjectURL(blob)
      // Trigger download local
      const a = document.createElement('a')
      a.href = blobUrl; a.download = nome
      document.body.appendChild(a); a.click(); a.remove()
      return blobUrl
    } catch (e: any) {
      setMsgAcao(`❌ Falha ao baixar: ${e?.message || 'erro'}`)
      setTimeout(() => setMsgAcao(null), 5000)
      return null
    }
  }

  async function printAerea() {
    const url =
      `https://maps.googleapis.com/maps/api/staticmap?center=${lat},${lng}` +
      `&zoom=${zoom}&size=640x480&scale=2&maptype=satellite` +
      `&markers=color:red%7C${lat},${lng}&key=${KEY}`
    const nome = `telhado-aerea-${lat.toFixed(5)}-${lng.toFixed(5)}.png`
    setMsgAcao('📷 Capturando aérea…')
    try {
      // Baixa a imagem crua e desenha overlays (coord + rosa dos ventos)
      // via canvas antes de salvar. Static Maps SEMPRE retorna com
      // norte pra cima — a bússola fica fixa apontando ↑.
      const imgFinal = await desenharOverlaysNaImagem(url, {
        coordLabel: `${lat.toFixed(6)}, ${lng.toFixed(6)}`,
        mostrarBussola: true,
        legenda: `Zoom ${zoom} · ${new Date().toLocaleString('pt-BR')}`,
      })
      const blobUrl = URL.createObjectURL(imgFinal)
      const a = document.createElement('a')
      a.href = blobUrl; a.download = nome
      document.body.appendChild(a); a.click(); a.remove()
      setPrintsFeitos((prev) => [...prev, { tipo: 'aerea', blobUrl, nome }])
      if (onPrintPronto) onPrintPronto({ tipo: 'aerea', dataUrl: blobUrl })
      setMsgAcao('✓ Print aéreo capturado com coordenadas + bússola')
      setTimeout(() => setMsgAcao(null), 3000)
    } catch (e: any) {
      setMsgAcao(`❌ Falha ao capturar: ${e?.message || 'erro'}`)
      setTimeout(() => setMsgAcao(null), 5000)
    }
  }

  async function printRua() {
    let heading = 0, pitch = 0
    if (streetViewRef.current) {
      const pov = streetViewRef.current.getPov()
      heading = pov?.heading || 0
      pitch = pov?.pitch || 0
    }
    const url =
      `https://maps.googleapis.com/maps/api/streetview?location=${lat},${lng}` +
      `&size=640x480&heading=${heading}&pitch=${pitch}&fov=90&key=${KEY}`
    const nome = `telhado-rua-${lat.toFixed(5)}-${lng.toFixed(5)}.png`
    setMsgAcao('🎥 Capturando rua…')
    try {
      // Overlays: coord + bússola girada com o heading atual (setinha
      // aponta pra direção da vista, pra o consultor entender pra onde
      // está olhando).
      const imgFinal = await desenharOverlaysNaImagem(url, {
        coordLabel: `${lat.toFixed(6)}, ${lng.toFixed(6)}`,
        mostrarBussola: true,
        headingBussola: heading, // seta gira; N sempre fixo
        legenda: `Vista ${orientacaoNome(heading)} (${Math.round(heading)}°) · ${new Date().toLocaleString('pt-BR')}`,
      })
      const blobUrl = URL.createObjectURL(imgFinal)
      const a = document.createElement('a')
      a.href = blobUrl; a.download = nome
      document.body.appendChild(a); a.click(); a.remove()
      setPrintsFeitos((prev) => [...prev, { tipo: 'rua', blobUrl, nome }])
      if (onPrintPronto) onPrintPronto({ tipo: 'rua', dataUrl: blobUrl })
      setMsgAcao(`✓ Print da rua (${orientacaoNome(heading)}) capturado`)
      setTimeout(() => setMsgAcao(null), 3000)
    } catch (e: any) {
      setMsgAcao(`❌ Falha ao capturar: ${e?.message || 'erro'}`)
      setTimeout(() => setMsgAcao(null), 5000)
    }
  }

  function rebaixarPrint(p: { blobUrl: string; nome: string }) {
    const a = document.createElement('a')
    a.href = p.blobUrl; a.download = p.nome
    document.body.appendChild(a); a.click(); a.remove()
  }

  function descartarPrint(idx: number) {
    setPrintsFeitos((prev) => {
      const alvo = prev[idx]
      if (alvo) URL.revokeObjectURL(alvo.blobUrl)
      return prev.filter((_, i) => i !== idx)
    })
  }

  async function iniciarMedir() {
    const google = (window as any).google
    if (!google || !mapRef.current) return
    // Limpa polígono anterior
    if (polyMedidoRef.current) { polyMedidoRef.current.setMap(null); polyMedidoRef.current = null }
    setAreaMedida(null)
    setMedindo(true)
    // IMPORTANTE: atualiza o ref sincronamente porque o setState só
    // reflete no listener após o re-render (e o próximo click pode
    // chegar antes disso).
    medindoRef.current = true
    setMsgAcao('📐 Clique nos cantos do telhado. Duplo-clique no último ponto pra fechar o polígono.')

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
      medindoRef.current = false  // libera o click do mapa de volta
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
    medindoRef.current = false
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
      const avisoQualidade = s.qualidade === 'LOW'
        ? ' ⚠ imagem baixa qualidade — retângulos são aproximados, prefira medir manual'
        : s.qualidade === 'MEDIUM'
        ? ' — qualidade média'
        : ' — qualidade alta'
      setMsgAcao(`✓ ${s.segmentos?.length || 0} face(s) detectada(s)${avisoQualidade}`)
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

      {/* GALERIA DE PRINTS CAPTURADOS — preview embutido, com opção
          de baixar de novo ou descartar. Batch 2 salva no cliente. */}
      {printsFeitos.length > 0 && (
        <div className="p-3 bg-noite/40 border border-white/10 rounded space-y-2">
          <p className="text-[11px] uppercase tracking-wider font-bold text-white/60">
            📸 Prints capturados ({printsFeitos.length}) — já baixados na pasta Downloads
          </p>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
            {printsFeitos.map((p, i) => (
              <div key={i} className="relative rounded overflow-hidden border border-white/10 bg-black/30">
                <img src={p.blobUrl} alt={p.nome}
                  className="w-full h-32 object-cover" />
                <div className="absolute top-1 left-1 px-1.5 py-0.5 rounded bg-noite/80 text-[10px] font-bold text-white">
                  {p.tipo === 'aerea' ? '🛰 Aérea' : '🎥 Rua'}
                </div>
                <div className="absolute top-1 right-1 flex gap-1">
                  <button type="button" onClick={() => rebaixarPrint(p)}
                    title="Baixar de novo"
                    className="w-6 h-6 rounded bg-noite/80 hover:bg-noite text-white/90 text-[11px] flex items-center justify-center">
                    ⬇
                  </button>
                  <button type="button" onClick={() => descartarPrint(i)}
                    title="Descartar"
                    className="w-6 h-6 rounded bg-noite/80 hover:bg-coral/80 text-white/90 text-[11px] flex items-center justify-center">
                    ✕
                  </button>
                </div>
              </div>
            ))}
          </div>
          <p className="text-[10px] text-white/40">
            💡 No próximo passo (Batch 2) esses prints ficam salvos no perfil do cliente automaticamente.
          </p>
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

/**
 * Baixa uma imagem do Google Static/Street View e desenha overlays em cima
 * (coordenadas, rosa dos ventos, legenda) via Canvas 2D. Retorna um Blob PNG.
 *
 * Google Static Maps envia CORS aberto, então crossOrigin='anonymous' funciona
 * e o canvas não fica 'tainted'.
 */
async function desenharOverlaysNaImagem(
  url: string,
  opts: {
    coordLabel: string
    mostrarBussola?: boolean
    headingBussola?: number  // 0 = norte pra cima (aérea); N em Street View gira
    legenda?: string
  },
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => {
      const canvas = document.createElement('canvas')
      canvas.width = img.width
      canvas.height = img.height
      const ctx = canvas.getContext('2d')
      if (!ctx) { reject(new Error('canvas 2d indisponível')); return }
      ctx.drawImage(img, 0, 0)

      // ============ BÚSSULA (top-right, 90px) ============
      if (opts.mostrarBussola) {
        const cx = canvas.width - 70
        const cy = 70
        const r = 40
        // Círculo de fundo (branco semi-transparente)
        ctx.beginPath()
        ctx.arc(cx, cy, r + 8, 0, Math.PI * 2)
        ctx.fillStyle = 'rgba(255,255,255,0.85)'
        ctx.fill()
        ctx.strokeStyle = '#0f172a'
        ctx.lineWidth = 2
        ctx.stroke()

        // Rotaciona só a seta interna pelo heading (se dado)
        const heading = opts.headingBussola || 0
        ctx.save()
        ctx.translate(cx, cy)
        ctx.rotate((heading * Math.PI) / 180)
        // Seta apontando pra cima (vermelha)
        ctx.beginPath()
        ctx.moveTo(0, -r + 4)
        ctx.lineTo(-10, r - 12)
        ctx.lineTo(0, r - 20)
        ctx.lineTo(10, r - 12)
        ctx.closePath()
        ctx.fillStyle = '#dc2626'
        ctx.fill()
        ctx.restore()

        // Letra N fixa em cima (sempre indica norte real)
        ctx.font = 'bold 16px sans-serif'
        ctx.fillStyle = '#0f172a'
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        ctx.fillText('N', cx, cy - r - 2)
        ctx.fillText('S', cx, cy + r + 2)
        ctx.fillText('L', cx + r + 4, cy)
        ctx.fillText('O', cx - r - 4, cy)
      }

      // ============ COORDENADAS (bottom-left) ============
      const pad = 12
      const y0 = canvas.height - pad
      ctx.font = 'bold 14px monospace'
      const cw = ctx.measureText(opts.coordLabel).width
      // Fundo escuro
      ctx.fillStyle = 'rgba(15,23,42,0.85)'
      ctx.fillRect(pad, y0 - 46, cw + 24, 38)
      // Texto branco
      ctx.fillStyle = '#fff'
      ctx.textAlign = 'left'
      ctx.textBaseline = 'top'
      ctx.fillText('📍 ' + opts.coordLabel, pad + 12, y0 - 34)

      // ============ LEGENDA (bottom-right) ============
      if (opts.legenda) {
        ctx.font = '12px sans-serif'
        const lw = ctx.measureText(opts.legenda).width
        ctx.fillStyle = 'rgba(15,23,42,0.75)'
        ctx.fillRect(canvas.width - pad - lw - 16, y0 - 32, lw + 16, 24)
        ctx.fillStyle = '#fff'
        ctx.textAlign = 'left'
        ctx.fillText(opts.legenda, canvas.width - pad - lw - 8, y0 - 26)
      }

      canvas.toBlob((b) => {
        if (b) resolve(b); else reject(new Error('toBlob falhou'))
      }, 'image/png', 0.95)
    }
    img.onerror = () => reject(new Error('falha ao carregar imagem do Google'))
    img.src = url
  })
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
