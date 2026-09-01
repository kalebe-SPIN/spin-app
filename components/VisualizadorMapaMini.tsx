// @ts-nocheck
'use client'

/**
 * Visualizador de mapa satélite (Google Maps JS API v2 importLibrary).
 *
 * Kalebe 2026-08-31 (3ª iteração):
 * - Usa AdvancedMarkerElement (v2) que é draggable-first por design,
 *   em vez do Marker legado que dava problemas de arraste.
 * - useEffect que sincroniza lat/lng com o marker agora tem GUARD: só
 *   reposiciona se a diferença real for > 1e-7, evitando teleportar
 *   o pino DURANTE um drag quando o parent re-renderiza (era esse o
 *   bug — parent atualiza state por outro motivo → setPosition volta
 *   o marker pra origem no meio do gesto).
 * - Click no mapa também move o marker (fallback duplo).
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
  const markerRef = useRef<any>(null)
  const arrastandoRef = useRef(false)
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

    const loader = new Loader({
      apiKey: key,
      version: 'weekly',
      libraries: ['marker'], // AdvancedMarkerElement vive aqui
    })

    loader.load().then(async () => {
      if (cancelado || !mapaRef.current) return
      const google = (window as any).google

      // AdvancedMarker exige mapId. DEMO_MAP_ID é público do Google
      // pra testes/dev; em prod real cria-se um no Cloud Console.
      const map = new google.maps.Map(mapaRef.current, {
        center: { lat, lng },
        zoom,
        mapTypeId: 'satellite',
        mapId: 'DEMO_MAP_ID',
        tilt: 0,
        disableDefaultUI: false,
        fullscreenControl: true,
        streetViewControl: true,
        mapTypeControl: true,
        zoomControl: true,
        gestureHandling: 'greedy',
        clickableIcons: false,
      })

      // AdvancedMarkerElement — draggable-first, sem os quirks do Marker legado.
      const { AdvancedMarkerElement, PinElement } = await google.maps.importLibrary('marker')

      // Pin vermelho grande e sólido pra ser fácil de agarrar
      const pin = new PinElement({
        background: '#ef4444',
        borderColor: '#7f1d1d',
        glyphColor: '#ffffff',
        scale: 1.4,
      })

      const marker = new AdvancedMarkerElement({
        map,
        position: { lat, lng },
        gmpDraggable: !!onArrastar,
        title: onArrastar ? '✋ Arraste ou clique no mapa pra ajustar' : '',
        content: pin.element,
        zIndex: 9999,
      })
      markerRef.current = marker

      if (onArrastar) {
        // AdvancedMarkerElement usa gmp-dragend (não 'dragend' do Marker legado)
        marker.addListener('dragstart', () => { arrastandoRef.current = true })
        marker.addListener('dragend', () => {
          arrastandoRef.current = false
          const p = marker.position
          if (!p) return
          const la = typeof p.lat === 'function' ? p.lat() : p.lat
          const lo = typeof p.lng === 'function' ? p.lng() : p.lng
          if (onArrastarRef.current) onArrastarRef.current(la, lo)
        })

        // Clique no mapa também move o marker — fallback confiável.
        map.addListener('click', (e: any) => {
          const p = e.latLng
          if (!p) return
          const novoLat = p.lat()
          const novoLng = p.lng()
          marker.position = { lat: novoLat, lng: novoLng }
          if (onArrastarRef.current) onArrastarRef.current(novoLat, novoLng)
        })
      }
      setCarregando(false)
    }).catch((e: any) => {
      if (!cancelado) {
        setErro(e?.message || 'Falha ao carregar Google Maps')
        setCarregando(false)
      }
    })

    return () => { cancelado = true }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apiKey, zoom, !!onArrastar])

  // GUARD: só reposiciona quando a mudança de lat/lng vem realmente
  // de fora e é diferente da posição atual — evita teleportar o
  // marker de volta pra props no meio de um drag.
  useEffect(() => {
    const m = markerRef.current
    if (!m || arrastandoRef.current) return
    const p = m.position
    if (!p) { m.position = { lat, lng }; return }
    const la = typeof p.lat === 'function' ? p.lat() : p.lat
    const lo = typeof p.lng === 'function' ? p.lng() : p.lng
    if (Math.abs(la - lat) > 1e-7 || Math.abs(lo - lng) > 1e-7) {
      m.position = { lat, lng }
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
    <div className="relative rounded border border-white/10 overflow-hidden" style={{ height: altura }}>
      <div ref={mapaRef} className="w-full h-full" />
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
