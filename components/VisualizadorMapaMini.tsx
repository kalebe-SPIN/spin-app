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
  // Guarda o polígono medido pra o Vetorizar usar como referência
  const [poligonoMedido, setPoligonoMedido] = useState<PontoLatLng[] | null>(null)
  // Contador de vértices durante desenho — feedback visual pro consultor
  const [verticesTemp, setVerticesTemp] = useState<PontoLatLng[]>([])
  // Tela cheia — CSS fixed em vez de Fullscreen API (mais confiável)
  const [ampliado, setAmpliado] = useState(false)

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
    if (!google.maps?.drawing?.DrawingManager) {
      setMsgAcao('❌ Biblioteca "drawing" não carregou — recarregue a página')
      setTimeout(() => setMsgAcao(null), 5000)
      return
    }
    // Limpa polígono anterior
    if (polyMedidoRef.current) { polyMedidoRef.current.setMap(null); polyMedidoRef.current = null }
    setAreaMedida(null); setVerticesTemp([])
    setMedindo(true)
    medindoRef.current = true
    setMsgAcao('📐 Clique nos cantos do telhado. Quando terminar, clique de novo no PRIMEIRO ponto pra fechar (ou duplo-click no último).')

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

    // Listener no click do mapa DURANTE o modo desenho — conta vértices.
    // O DrawingManager consome os cliques mas o listener adicional roda
    // antes, dando feedback ao vivo do progresso.
    const listenerClicksTemp = mapRef.current.addListener('click', (e: any) => {
      if (!medindoRef.current) return
      const p = e.latLng
      if (p) setVerticesTemp((prev) => [...prev, { lat: p.lat(), lng: p.lng() }])
    })
    ;(dm as any).__listenerTemp = listenerClicksTemp

    google.maps.event.addListenerOnce(dm, 'polygoncomplete', (poly: any) => {
      // Limpa listener temporário de vértices
      if ((dm as any).__listenerTemp) {
        try { google.maps.event.removeListener((dm as any).__listenerTemp) } catch {}
      }
      setVerticesTemp([])
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
      setPoligonoMedido(pontos)
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
    if (drawManRef.current) {
      const google = (window as any).google
      if ((drawManRef.current as any).__listenerTemp) {
        try { google.maps.event.removeListener((drawManRef.current as any).__listenerTemp) } catch {}
      }
      drawManRef.current.setMap(null); drawManRef.current = null
    }
    setAreaMedida(null); setMedindo(false); setPoligonoMedido(null); setVerticesTemp([])
    medindoRef.current = false
  }

  // Finaliza manualmente o polígono usando os vértices clicados até agora
  // (fallback pra quem não sabe fazer duplo-click)
  function finalizarMedicaoManual() {
    const google = (window as any).google
    if (!google || !mapRef.current || verticesTemp.length < 3) return
    // Cancela o DrawingManager (não vamos deixá-lo fechar)
    if (drawManRef.current) {
      if ((drawManRef.current as any).__listenerTemp) {
        try { google.maps.event.removeListener((drawManRef.current as any).__listenerTemp) } catch {}
      }
      drawManRef.current.setMap(null); drawManRef.current = null
    }
    // Cria o polígono manualmente com os vértices
    const poly = new google.maps.Polygon({
      paths: verticesTemp,
      fillColor: '#f59e0b', fillOpacity: 0.35,
      strokeColor: '#f59e0b', strokeWeight: 2,
      editable: true, draggable: false, zIndex: 5000,
      map: mapRef.current,
    })
    polyMedidoRef.current = poly
    medindoRef.current = false; setMedindo(false)
    const path = poly.getPath()
    const area = google.maps.geometry.spherical.computeArea(path)
    setAreaMedida(area); setPoligonoMedido([...verticesTemp])
    setVerticesTemp([])
    setMsgAcao(null)
    if (onAreaMedida) onAreaMedida({ areaM2: Number(area.toFixed(2)), pontos: verticesTemp })
    path.addListener('set_at', () => recalcAreaMedida())
    path.addListener('insert_at', () => recalcAreaMedida())
  }

  async function vetorizarComSolar() {
    setBuscandoSolar(true); setMsgAcao('🔬 Consultando Google Solar…')
    try {
      // Se o consultor MEDIU o telhado primeiro, usa o CENTROIDE do
      // polígono como referência — mais preciso que o pino, que pode
      // estar num canto ou fora do telhado. Kalebe 2026-08-31.
      let refLat = lat, refLng = lng
      if (poligonoMedido && poligonoMedido.length >= 3) {
        const sum = poligonoMedido.reduce(
          (acc, p) => ({ lat: acc.lat + p.lat, lng: acc.lng + p.lng }),
          { lat: 0, lng: 0 },
        )
        refLat = sum.lat / poligonoMedido.length
        refLng = sum.lng / poligonoMedido.length
        setMsgAcao('🔬 Consultando Solar no centro do polígono medido…')
      }
      const s = await buscarSolarInsights(refLat, refLng)
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

  // Quando amplia/minimiza, força o Google Maps a re-renderizar
  // (senão fica com pedaços em cinza porque o container mudou)
  useEffect(() => {
    if (!mapRef.current) return
    const google = (window as any).google
    setTimeout(() => {
      try {
        google?.maps?.event?.trigger(mapRef.current, 'resize')
        mapRef.current.setCenter({ lat, lng })
      } catch {}
    }, 100)
  }, [ampliado])

  return (
    <div className={ampliado
      ? 'fixed inset-0 z-[9999] bg-noite p-4 overflow-auto space-y-2'
      : 'space-y-2'}>
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
              title={poligonoMedido
                ? 'Solar vai usar o CENTRO do polígono que você mediu como referência'
                : '💡 Meça a área primeiro pra Solar ser mais preciso'}
              className="px-3 py-1.5 text-[11px] font-bold bg-verde/10 border border-verde/40 rounded text-verde hover:bg-verde/20 disabled:opacity-50">
              {buscandoSolar ? '⏳ Analisando…' : poligonoMedido ? '🔬 Vetorizar (do polígono)' : '🔬 Vetorizar (Solar)'}
            </button>

            {(areaMedida != null || solar) && (
              <button type="button" onClick={() => { limparMedicao(); limparSolar() }}
                className="px-2 py-1 text-[10px] text-white/50 hover:text-white/80">
                Limpar
              </button>
            )}
          </>
        )}

        {/* Ampliar tela — importante pra medir/vetorizar com precisão */}
        <button type="button" onClick={() => setAmpliado((v) => !v)}
          className="ml-auto px-3 py-1.5 text-[11px] font-bold bg-noite/40 border border-white/20 rounded text-white hover:bg-white/10"
          title={ampliado ? 'Voltar ao tamanho normal' : 'Ampliar pra tela cheia (melhor pra medir/vetorizar)'}>
          {ampliado ? '↙ Minimizar' : '⛶ Ampliar tela'}
        </button>
      </div>

      {/* AVISOS */}
      {msgAcao && (
        <p className="text-[11px] px-3 py-1.5 bg-sol/10 border border-sol/30 rounded text-sol">
          {msgAcao}
        </p>
      )}

      {/* Contador de vértices + botão finalizar (durante desenho) */}
      {medindo && (
        <div className="flex items-center gap-3 px-3 py-2 bg-sol/10 border border-sol/40 rounded">
          <div className="flex-1 text-[11px] text-sol">
            <b>Vértices clicados: {verticesTemp.length}</b>
            {verticesTemp.length < 3 && ' — clique em pelo menos 3 cantos'}
            {verticesTemp.length >= 3 && ' — pode finalizar quando quiser'}
          </div>
          <button type="button" onClick={finalizarMedicaoManual}
            disabled={verticesTemp.length < 3}
            className="px-3 py-1 text-[11px] font-bold bg-verde text-noite rounded disabled:opacity-30 disabled:cursor-not-allowed hover:bg-verde/90">
            ✓ Finalizar polígono
          </button>
          <button type="button" onClick={limparMedicao}
            className="px-2 py-1 text-[11px] text-coral hover:text-coral/80">
            ✕ Cancelar
          </button>
        </div>
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
        style={{
          height: ampliado ? 'calc(100vh - 220px)' : altura,
          touchAction: 'none',
        }}
        onMouseDown={(e) => e.stopPropagation()}
        onTouchStart={(e) => e.stopPropagation()}
        onKeyDown={(e) => { if (e.key === 'Enter') e.preventDefault() }}
      >
        <div ref={mapaRef} className="w-full h-full"
          style={{ display: modo === 'mapa' ? 'block' : 'none', touchAction: 'none' }} />
        <div ref={streetRef} className="w-full h-full"
          style={{ display: modo === 'rua' ? 'block' : 'none' }} />

        {/* Badge de bússola + coordenadas — canto superior esquerdo do
            mapa aéreo. Kalebe 2026-08-31: a Street View já tem bússola
            nativa; na aérea o Google não coloca (norte sempre pra cima).
            Este badge dá a mesma referência visual + coord ao vivo. */}
        {modo === 'mapa' && !carregando && (
          <div className="absolute top-2 left-2 flex items-center gap-2 px-2.5 py-2 bg-gradient-to-br from-noite/95 to-black/95 border border-sol/30 rounded-lg shadow-xl pointer-events-none z-10">
            <RosaDosVentos size={40} />
            <div className="text-[10px] font-mono text-white leading-tight">
              <div className="text-sol font-bold text-[9px] uppercase tracking-wider mb-0.5">Coord</div>
              <div>{lat.toFixed(6)}</div>
              <div className="text-white/70">{lng.toFixed(6)}</div>
            </div>
          </div>
        )}
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
 * Kalebe 2026-08-31: primeira versão usava <img crossOrigin='anonymous'>
 * mas alguns CDNs do Google removem CORS headers no cache — imagem carregava,
 * canvas ficava TAINTED em silêncio, toBlob passava null e overlays sumiam.
 *
 * Fix: fetch → blob → createImageBitmap. O bitmap vem de um blob LOCAL,
 * nunca tainta o canvas. Funciona sempre, em qualquer edge do CDN.
 */
async function desenharOverlaysNaImagem(
  url: string,
  opts: {
    coordLabel: string
    mostrarBussola?: boolean
    headingBussola?: number
    legenda?: string
  },
): Promise<Blob> {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Google respondeu ${res.status}`)
  const blob = await res.blob()
  const bitmap = await createImageBitmap(blob)
  const canvas = document.createElement('canvas')
  canvas.width = bitmap.width
  canvas.height = bitmap.height
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('canvas 2d indisponível')
  ctx.drawImage(bitmap, 0, 0)

  // Wrapper pra manter a estrutura original com opts.mostrarBussola etc
  await Promise.resolve()  // no-op só pra manter fluxo async
  ;(() => {
    // (código dos overlays roda a seguir)

      // ============ ROSA DOS VENTOS PREMIUM (top-right, 100px) ============
      // Estrela de 8 pontas estilo náutico. Kalebe 2026-08-31: 'caprichar
      // no design'. Mesma lógica do <RosaDosVentos> SVG do widget.
      if (opts.mostrarBussola) {
        const size = 100
        const cx = canvas.width - size / 2 - 12
        const cy = size / 2 + 12
        const r1 = size * 0.46
        const r2 = size * 0.16
        const heading = opts.headingBussola || 0

        // Fundo circular com gradiente radial
        const grad = ctx.createRadialGradient(cx, cy, 4, cx, cy, size * 0.48)
        grad.addColorStop(0, 'rgba(251,191,36,0.25)')
        grad.addColorStop(1, 'rgba(0,0,0,0.85)')
        ctx.beginPath()
        ctx.arc(cx, cy, size * 0.48, 0, Math.PI * 2)
        ctx.fillStyle = grad
        ctx.fill()
        ctx.strokeStyle = '#fbbf24'
        ctx.lineWidth = 2
        ctx.stroke()

        // Estrela — 8 triângulos (4 intercardeais brancos + N vermelho + E/S/W brancos)
        ctx.save()
        ctx.translate(cx, cy)
        ctx.rotate((heading * Math.PI) / 180)
        const angulos = [0, 45, 90, 135, 180, 225, 270, 315]
        angulos.forEach((angDeg, idx) => {
          const isCardinal = idx % 2 === 0
          const isN = idx === 0
          const angRad = (angDeg - 90) * Math.PI / 180
          const angRadA = (angDeg - 90 - 22.5) * Math.PI / 180
          const angRadB = (angDeg - 90 + 22.5) * Math.PI / 180
          const x1 = Math.cos(angRad) * r1, y1 = Math.sin(angRad) * r1
          const xa = Math.cos(angRadA) * r2, ya = Math.sin(angRadA) * r2
          const xb = Math.cos(angRadB) * r2, yb = Math.sin(angRadB) * r2
          ctx.beginPath()
          ctx.moveTo(x1, y1); ctx.lineTo(xa, ya); ctx.lineTo(0, 0); ctx.lineTo(xb, yb)
          ctx.closePath()
          if (isN) {
            const gN = ctx.createLinearGradient(0, -r1, 0, 0)
            gN.addColorStop(0, '#dc2626'); gN.addColorStop(1, '#7f1d1d')
            ctx.fillStyle = gN
          } else if (isCardinal) {
            ctx.fillStyle = '#e5e7eb'
          } else {
            const gI = ctx.createLinearGradient(0, y1, 0, 0)
            gI.addColorStop(0, '#fff'); gI.addColorStop(1, '#d1d5db')
            ctx.fillStyle = gI
          }
          ctx.strokeStyle = '#0f172a'
          ctx.lineWidth = 0.6
          ctx.fill(); ctx.stroke()
        })
        ctx.restore()

        // Letras N/S/L/O fixas (sempre indicam norte REAL, não giram)
        ctx.font = 'bold 16px serif'
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        // N vermelho com contorno branco
        ctx.lineWidth = 3
        ctx.strokeStyle = '#fff'
        ctx.strokeText('N', cx, cy - size * 0.42)
        ctx.fillStyle = '#dc2626'
        ctx.fillText('N', cx, cy - size * 0.42)
        // S/L/O brancos
        ctx.fillStyle = '#fff'
        ctx.font = 'bold 12px serif'
        ctx.fillText('S', cx, cy + size * 0.42)
        ctx.fillText('L', cx + size * 0.42, cy)
        ctx.fillText('O', cx - size * 0.42, cy)
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

  })()

  return new Promise((resolve, reject) => {
    canvas.toBlob((b) => {
      if (b) resolve(b); else reject(new Error('toBlob falhou'))
    }, 'image/png', 0.95)
  })
}

/**
 * Rosa dos ventos estilo náutico — estrela de 8 pontas com N destacado.
 * Kalebe 2026-08-31: 'caprichar no design'.
 */
function RosaDosVentos({ size = 40, headingGraus = 0 }: { size?: number; headingGraus?: number }) {
  const c = size / 2
  const r1 = size * 0.46  // raio externo
  const r2 = size * 0.16  // raio interno (ponta curta da estrela)
  // 8 pontas alternando externa/interna
  const pts: string[] = []
  for (let i = 0; i < 16; i++) {
    const ang = (i * 22.5 - 90) * Math.PI / 180  // -90 = topo
    const r = i % 2 === 0 ? r1 : r2
    pts.push(`${(c + Math.cos(ang) * r).toFixed(2)},${(c + Math.sin(ang) * r).toFixed(2)}`)
  }
  const estrelaPath = pts.join(' ')
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} xmlns="http://www.w3.org/2000/svg">
      <defs>
        <radialGradient id="rvBg" cx="0.5" cy="0.5" r="0.5">
          <stop offset="0%" stopColor="#fbbf24" stopOpacity="0.15" />
          <stop offset="100%" stopColor="#000" stopOpacity="0.5" />
        </radialGradient>
        <linearGradient id="rvClaro" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#fff" />
          <stop offset="100%" stopColor="#d1d5db" />
        </linearGradient>
        <linearGradient id="rvEscuro" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#dc2626" />
          <stop offset="100%" stopColor="#7f1d1d" />
        </linearGradient>
      </defs>
      {/* Círculo de fundo */}
      <circle cx={c} cy={c} r={size * 0.48} fill="url(#rvBg)" stroke="#fbbf24" strokeWidth="1"/>
      {/* Rosa gira quando heading != 0 (Street View) */}
      <g transform={`rotate(${headingGraus} ${c} ${c})`}>
        {/* 4 triângulos vazados (branco/prata) NE, SE, SO, NO */}
        {[45, 135, 225, 315].map((ang) => {
          const rad = (ang - 90) * Math.PI / 180
          const x1 = c + Math.cos(rad) * r1
          const y1 = c + Math.sin(rad) * r1
          const rad2a = (ang - 90 - 22.5) * Math.PI / 180
          const rad2b = (ang - 90 + 22.5) * Math.PI / 180
          const xa = c + Math.cos(rad2a) * r2
          const ya = c + Math.sin(rad2a) * r2
          const xb = c + Math.cos(rad2b) * r2
          const yb = c + Math.sin(rad2b) * r2
          return <polygon key={ang} points={`${x1},${y1} ${xa},${ya} ${c},${c} ${xb},${yb}`}
            fill="url(#rvClaro)" stroke="#0f172a" strokeWidth="0.4"/>
        })}
        {/* 4 triângulos cardinais N (vermelho), E/S/W (branco fosco) */}
        {[
          { ang: 0, fill: 'url(#rvEscuro)' },   // N vermelho
          { ang: 90, fill: '#e5e7eb' },         // E
          { ang: 180, fill: '#e5e7eb' },        // S
          { ang: 270, fill: '#e5e7eb' },        // O
        ].map(({ ang, fill }) => {
          const rad = (ang - 90) * Math.PI / 180
          const x1 = c + Math.cos(rad) * r1
          const y1 = c + Math.sin(rad) * r1
          const rad2a = (ang - 90 - 22.5) * Math.PI / 180
          const rad2b = (ang - 90 + 22.5) * Math.PI / 180
          const xa = c + Math.cos(rad2a) * r2
          const ya = c + Math.sin(rad2a) * r2
          const xb = c + Math.cos(rad2b) * r2
          const yb = c + Math.sin(rad2b) * r2
          return <polygon key={ang} points={`${x1},${y1} ${xa},${ya} ${c},${c} ${xb},${yb}`}
            fill={fill} stroke="#0f172a" strokeWidth="0.4"/>
        })}
      </g>
      {/* Letras N/S/L/O fixas (não giram) */}
      <text x={c} y={size * 0.14} textAnchor="middle" fontSize={size * 0.18}
        fill="#dc2626" fontWeight="900" fontFamily="serif" style={{ paintOrder: 'stroke' }}
        stroke="#fff" strokeWidth="0.8">N</text>
      <text x={c} y={size * 0.98} textAnchor="middle" fontSize={size * 0.14}
        fill="#fff" fontWeight="bold" fontFamily="serif">S</text>
      <text x={size * 0.96} y={c + size * 0.05} textAnchor="middle" fontSize={size * 0.14}
        fill="#fff" fontWeight="bold" fontFamily="serif">L</text>
      <text x={size * 0.04} y={c + size * 0.05} textAnchor="middle" fontSize={size * 0.14}
        fill="#fff" fontWeight="bold" fontFamily="serif">O</text>
    </svg>
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
