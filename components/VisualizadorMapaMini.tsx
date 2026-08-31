// @ts-nocheck
// TODO: migrar de @googlemaps/js-api-loader v1 API pra v2 (importLibrary).
// Mesmo motivo do MapaTelhadoEditor — v2 mudou loader.load() → importLibrary.
'use client'

/**
 * Visualizador de mapa satélite (Google Maps JS API) — mesma tech do
 * MapaTelhadoEditor mas só pra visualização (sem desenho).
 *
 * Kalebe 2026-08-31: usado no modal do ColarLinkMapaBotao pra o
 * consultor conferir se o pino caiu no imóvel certo, com zoom
 * agressivo pra ver telhado do prédio.
 */

import { useEffect, useRef, useState } from 'react'
import { Loader } from '@googlemaps/js-api-loader'

type Props = {
  lat: number
  lng: number
  apiKey?: string
  altura?: number     // em px, default 260
  zoom?: number       // default 20
  /** Kalebe 2026-08-31: marker arrastável — ao soltar, callback com
   *  nova lat/lng. Se ausente, marker fica fixo. */
  onArrastar?: (lat: number, lng: number) => void
}

export function VisualizadorMapaMini({ lat, lng, apiKey, altura = 260, zoom = 20, onArrastar }: Props) {
  const mapaRef = useRef<HTMLDivElement>(null)
  const markerRef = useRef<any>(null)
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
        streetViewControl: true,   // habilita pegman pra street view
        mapTypeControl: true,
      })
      const marker = new google.maps.Marker({
        position: { lat, lng },
        map,
        draggable: !!onArrastar,
        cursor: onArrastar ? 'move' : 'pointer',
        icon: {
          path: google.maps.SymbolPath.CIRCLE,
          scale: 10,
          fillColor: '#f4d000',
          fillOpacity: 0.95,
          strokeColor: '#000',
          strokeWeight: 2,
        },
        title: onArrastar ? 'Arraste pra ajustar o ponto exato do imóvel' : '',
      })
      markerRef.current = marker
      if (onArrastar) {
        marker.addListener('dragend', () => {
          const p = marker.getPosition()
          if (p) onArrastar(p.lat(), p.lng())
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
  // Recarrega SÓ quando apiKey/zoom mudam. lat/lng dinâmico é tratado
  // via marker.setPosition abaixo pra não recriar o mapa a cada arraste.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apiKey, zoom, !!onArrastar])

  // Atualiza marker quando lat/lng mudam externamente (ex: parent alterou)
  useEffect(() => {
    if (markerRef.current) {
      markerRef.current.setPosition({ lat, lng })
    }
  }, [lat, lng])

  // Fallback: se não tem chave (ou falhou), usa iframe embed simples
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
