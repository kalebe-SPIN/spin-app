// @ts-nocheck
'use client'

/**
 * Visualizador de mapa satélite (Google Maps JS API).
 *
 * Kalebe 2026-08-31 (4ª iteração):
 * - Volta pro Marker legado (AdvancedMarker precisa de mapId
 *   registrado no billing e o DEMO_MAP_ID nem sempre funciona).
 * - MANTÉM o fix crítico: guard anti-teleporte no useEffect [lat,lng]
 *   + arrastandoRef bloqueia setPosition durante drag. Era isso que
 *   estava impedindo o arraste na verdade — o parent re-renderizava
 *   a cada tecla e o hook cancelava o gesto.
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
      setErro('Chave Google Maps não configurada — mostrando embed simples')
      setCarregando(false)
      return
    }
    let cancelado = false

    const loader = new Loader({
      apiKey: key,
      version: 'weekly',
      libraries: [],
    })

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

      const marker = new google.maps.Marker({
        position: { lat, lng },
        map,
        draggable: !!onArrastar,
        cursor: onArrastar ? 'move' : 'pointer',
        optimized: false,
        zIndex: 9999,
        title: onArrastar ? '✋ Arraste ou clique no mapa pra ajustar' : '',
        animation: google.maps.Animation.DROP,
      })
      markerRef.current = marker

      if (onArrastar) {
        // arrastandoRef bloqueia setPosition externo enquanto o drag rola.
        marker.addListener('dragstart', () => { arrastandoRef.current = true })
        marker.addListener('dragend', () => {
          arrastandoRef.current = false
          const p = marker.getPosition()
          if (p && onArrastarRef.current) onArrastarRef.current(p.lat(), p.lng())
        })

        // Clique no mapa também move o marker — fallback confiável.
        map.addListener('click', (e: any) => {
          const p = e.latLng
          if (!p) return
          const novoLat = p.lat()
          const novoLng = p.lng()
          marker.setPosition({ lat: novoLat, lng: novoLng })
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

  // GUARD anti-teleporte — era o bug real. Sem isto, a cada re-render
  // do parent (uma tecla no CEP já basta), o marker voltava pra
  // posição das props e cancelava o gesto de arraste em curso.
  useEffect(() => {
    const m = markerRef.current
    if (!m || arrastandoRef.current) return
    const p = m.getPosition && m.getPosition()
    if (!p) { m.setPosition && m.setPosition({ lat, lng }); return }
    if (Math.abs(p.lat() - lat) > 1e-7 || Math.abs(p.lng() - lng) > 1e-7) {
      m.setPosition({ lat, lng })
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
