'use client'

import { useEffect, useRef, useState } from 'react'
import dynamic from 'next/dynamic'
import type { LatLngExpression } from 'leaflet'

/**
 * Mapa interativo pra desenhar faces do telhado.
 *
 * Fluxo:
 *  1. Recebe endereço/coords iniciais
 *  2. Geocoda (se necessário) via Nominatim (gratuito)
 *  3. Mostra mapa satélite (Esri World Imagery, gratuito)
 *  4. Consultor clica nos cantos da face → fecha duplo-clique
 *  5. Sistema calcula área (geodésica via Turf) + centroide
 *  6. Devolve dados pro form preencher
 *
 * SSR off porque Leaflet acessa window/document direto.
 */

const MapaCliente = dynamic(() => import('./TelhadoMapaCliente'), {
  ssr: false,
  loading: () => (
    <div className="bg-white/5 border border-white/10 rounded-xl h-[500px] flex items-center justify-center">
      <p className="text-white/60 text-sm">Carregando mapa...</p>
    </div>
  ),
})

export type FaceDesenhada = {
  coordenadas: [number, number][]  // [[lat, lng], ...]
  area_m2: number
  centroide: [number, number]
}

export type Props = {
  endereco?: string
  coordenadasIniciais?: [number, number]
  onFaceDesenhada: (face: FaceDesenhada) => void
}

export function TelhadoMapa(props: Props) {
  return <MapaCliente {...props} />
}
