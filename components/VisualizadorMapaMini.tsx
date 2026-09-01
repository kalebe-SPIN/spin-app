// @ts-nocheck
'use client'

/**
 * Visualizador de mapa satélite (Google Maps JS API).
 *
 * Kalebe 2026-08-31 (5ª iteração — pino DIV custom via OverlayView):
 * O drag do google.maps.Marker se recusou a funcionar (cursor sentia
 * mas gesto não completava) em várias combinações de opts. Reescrevi
 * o pino como um DIV HTML puro montado num OverlayView, com pointer
 * events nativos do browser. Sem depender de nada peculiar do Maps.
 *
 * Vantagens:
 * - onPointerDown/Move/Up unificado (mouse + touch)
 * - setPointerCapture segura o gesto mesmo se o cursor sair do pino
 * - Nenhum ancestral consegue roubar o evento (stopPropagation +
 *   pointer capture)
 * - Visual customizável — pino vermelho grande e óbvio
 *
 * Click no mapa também move o pino (fallback duplicado).
 */

import { useEffect, useRef, useState } from 'react'
import { Loader } from '@googlemaps/js-api-loader'

type Props = {
  lat: number
  lng: number
  apiKey?: string
  altura?: number
  zoom?: number
  onArrastar?: (lat: number, lng: number) => void
}

export function VisualizadorMapaMini({ lat, lng, apiKey, altura = 260, zoom = 20, onArrastar }: Props) {
  const mapaRef = useRef<HTMLDivElement>(null)
  const overlayRef = useRef<any>(null)
  const posicaoRef = useRef({ lat, lng })
  const onArrastarRef = useRef(onArrastar)
  useEffect(() => { onArrastarRef.current = onArrastar }, [onArrastar])
  const [erro, setErro] = useState<string | null>(null)
  const [carregando, setCarregando] = useState(true)

  useEffect(() => {
    if (!mapaRef.current) return
    const key = apiKey || process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY
    if (!key) {
      setErro('Chave Google Maps não configurada')
      setCarregando(false)
      return
    }
    let cancelado = false

    const loader = new Loader({ apiKey: key, version: 'weekly', libraries: [] })

    loader.load().then(() => {
      if (cancelado || !mapaRef.current) return
      const google = (window as any).google
      const map = new google.maps.Map(mapaRef.current, {
        center: { lat, lng },
        zoom,
        mapTypeId: 'satellite',
        tilt: 0,
        disableDefaultUI: false,
        fullscreenControl: true,
        streetViewControl: true,
        mapTypeControl: true,
        zoomControl: true,
        gestureHandling: 'greedy',
        clickableIcons: false,
      })

      // ============================================================
      // OVERLAY CUSTOM — pino DIV HTML com drag manual (pointer events)
      // ============================================================
      class PinoOverlay extends google.maps.OverlayView {
        pos: any
        div: HTMLDivElement | null = null
        arrastando = false
        pointerId: number | null = null
        offsetX = 0
        offsetY = 0

        constructor(pos: any) {
          super()
          this.pos = pos
        }

        onAdd() {
          const div = document.createElement('div')
          div.style.position = 'absolute'
          div.style.cursor = onArrastar ? 'grab' : 'pointer'
          div.style.userSelect = 'none'
          div.style.touchAction = 'none'
          div.style.zIndex = '9999'
          div.style.transform = 'translate(-50%, -100%)'
          div.style.pointerEvents = 'auto'
          div.title = onArrastar ? 'Arraste pra ajustar o ponto exato' : ''
          // Pino SVG grande e sólido (fácil de agarrar em zoom 20)
          div.innerHTML = `
            <svg width="36" height="48" viewBox="0 0 36 48" xmlns="http://www.w3.org/2000/svg" style="filter: drop-shadow(0 2px 4px rgba(0,0,0,0.5))">
              <path d="M18 0 C8 0 0 8 0 18 C0 30 18 48 18 48 C18 48 36 30 36 18 C36 8 28 0 18 0 Z" fill="#ef4444" stroke="#7f1d1d" stroke-width="2"/>
              <circle cx="18" cy="18" r="6" fill="#ffffff"/>
            </svg>
          `
          this.div = div

          if (onArrastar) {
            // ============ DRAG MANUAL VIA POINTER EVENTS ============
            div.addEventListener('pointerdown', (e: PointerEvent) => {
              e.preventDefault()
              e.stopPropagation()
              this.arrastando = true
              this.pointerId = e.pointerId
              div.setPointerCapture(e.pointerId)
              div.style.cursor = 'grabbing'
              // Guarda offset dentro do pino pra o drag não "pular"
              const rect = div.getBoundingClientRect()
              this.offsetX = e.clientX - (rect.left + rect.width / 2)
              this.offsetY = e.clientY - (rect.top + rect.height) // âncora na ponta
            })

            div.addEventListener('pointermove', (e: PointerEvent) => {
              if (!this.arrastando) return
              e.preventDefault()
              e.stopPropagation()
              // Traduz pixel do mouse → LatLng usando a projeção do overlay
              const proj = this.getProjection()
              if (!proj) return
              // Container do mapa (referência pra pixel absoluto)
              const mapDiv = map.getDiv()
              const mapRect = mapDiv.getBoundingClientRect()
              const pxX = e.clientX - mapRect.left - this.offsetX
              const pxY = e.clientY - mapRect.top - this.offsetY
              // fromContainerPixelToLatLng usa origem do container do mapa
              const latLng = proj.fromContainerPixelToLatLng(new google.maps.Point(pxX, pxY))
              if (!latLng) return
              this.pos = latLng
              posicaoRef.current = { lat: latLng.lat(), lng: latLng.lng() }
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

          // overlayMouseTarget é o pane que RECEBE eventos de mouse
          const panes = this.getPanes()
          panes.overlayMouseTarget.appendChild(div)
        }

        draw() {
          const proj = this.getProjection()
          if (!proj || !this.div) return
          const pos = proj.fromLatLngToDivPixel(this.pos)
          if (!pos) return
          this.div.style.left = pos.x + 'px'
          this.div.style.top = pos.y + 'px'
        }

        onRemove() {
          if (this.div?.parentNode) this.div.parentNode.removeChild(this.div)
          this.div = null
        }

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

      // Click no mapa também move o pino — fallback confiável.
      if (onArrastar) {
        map.addListener('click', (e: any) => {
          const p = e.latLng
          if (!p) return
          overlay.setPosicaoExterna(p)
          map.panTo(p)
          if (onArrastarRef.current) onArrastarRef.current(p.lat(), p.lng())
        })
      }

      setCarregando(false)
    }).catch((e: any) => {
      if (!cancelado) {
        setErro(e?.message || 'Falha ao carregar Google Maps')
        setCarregando(false)
      }
    })

    return () => {
      cancelado = true
      if (overlayRef.current) { try { overlayRef.current.setMap(null) } catch {} }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apiKey, zoom, !!onArrastar])

  // Sincroniza pino com mudanças externas — MAS só quando não está
  // arrastando (guard anti-teleporte).
  useEffect(() => {
    const o = overlayRef.current
    if (!o || o.estaArrastando?.()) return
    const cur = posicaoRef.current
    if (Math.abs(cur.lat - lat) > 1e-7 || Math.abs(cur.lng - lng) > 1e-7) {
      const google = (window as any).google
      if (google?.maps?.LatLng) o.setPosicaoExterna(new google.maps.LatLng(lat, lng))
    }
  }, [lat, lng])

  if (erro && !apiKey && !process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY) {
    return (
      <iframe
        title="Mapa"
        className="w-full rounded border border-white/10"
        style={{ height: altura }}
        loading="lazy"
        referrerPolicy="no-referrer-when-downgrade"
        src={`https://www.google.com/maps?q=${lat},${lng}&hl=pt-BR&z=${zoom}&output=embed`}
      />
    )
  }

  return (
    <div
      className="relative rounded border border-white/10 overflow-hidden"
      style={{ height: altura, touchAction: 'none' }}
      onMouseDown={(e) => e.stopPropagation()}
      onTouchStart={(e) => e.stopPropagation()}
      onKeyDown={(e) => { if (e.key === 'Enter') e.preventDefault() }}
    >
      <div ref={mapaRef} className="w-full h-full" style={{ touchAction: 'none' }} />
      {carregando && (
        <div className="absolute inset-0 flex items-center justify-center bg-noite/60 text-xs text-white/60">
          🛰 Carregando satélite…
        </div>
      )}
      {erro && !carregando && (
        <div className="absolute inset-0 flex items-center justify-center bg-noite/80 text-xs text-coral p-3 text-center">
          ⚠ {erro}
        </div>
      )}
    </div>
  )
}
