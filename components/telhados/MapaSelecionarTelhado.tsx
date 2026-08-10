// @ts-nocheck  — @googlemaps/js-api-loader v2 tira o load() do type mas ele
// ainda existe em runtime; o outro consumidor (MapaTelhadoEditor) usa o mesmo
// bypass. Trocar por importLibrary() quando migrarmos tudo.
'use client'

import { useEffect, useRef, useState } from 'react'
import { Loader } from '@googlemaps/js-api-loader'

export type PontoTelhado = {
  latitude: number
  longitude: number
  endereco: string
  bairro: string | null
  cidade: string | null
  uf: string | null
  cep: string | null
}

/**
 * Mapa fullscreen (modal) pra selecionar um telhado clicando no satélite.
 * Reverse-geocoding automático preenche endereço/cidade/UF ao clicar.
 * Retorna PontoTelhado via onSelecionar quando o usuário confirma.
 */
export function MapaSelecionarTelhado({
  onSelecionar,
  onFechar,
  centroInicial = { lat: -27.5949, lng: -48.5482 }, // Florianópolis
}: {
  onSelecionar: (ponto: PontoTelhado) => void
  onFechar: () => void
  centroInicial?: { lat: number; lng: number }
}) {
  const divMapa = useRef<HTMLDivElement>(null)
  const [ponto, setPonto] = useState<PontoTelhado | null>(null)
  const [busca, setBusca] = useState('')
  const [erro, setErro] = useState<string | null>(null)
  const [carregando, setCarregando] = useState(true)
  const mapRef = useRef<any>(null)
  const markerRef = useRef<any>(null)
  const geocoderRef = useRef<any>(null)

  useEffect(() => {
    const key = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY
    if (!key) {
      setErro('NEXT_PUBLIC_GOOGLE_MAPS_API_KEY não configurada.')
      setCarregando(false)
      return
    }

    const loader = new Loader({ apiKey: key, version: 'weekly', libraries: ['places'] })
    loader.load().then((google) => {
      if (!divMapa.current) return

      geocoderRef.current = new google.maps.Geocoder()
      mapRef.current = new google.maps.Map(divMapa.current, {
        center: centroInicial,
        zoom: 18,
        mapTypeId: 'hybrid', // satélite com rótulos de rua
        mapTypeControl: true,
        streetViewControl: true,
        fullscreenControl: false,
        tilt: 0,
      })

      mapRef.current.addListener('click', async (e: any) => {
        const lat = e.latLng.lat()
        const lng = e.latLng.lng()

        if (markerRef.current) markerRef.current.setMap(null)
        markerRef.current = new google.maps.Marker({
          position: { lat, lng },
          map: mapRef.current,
          animation: google.maps.Animation.DROP,
        })

        const p = await reverseGeocode(geocoderRef.current, lat, lng)
        setPonto(p)
      })

      setCarregando(false)
    }).catch((err) => {
      setErro(`Falha ao carregar mapa: ${err.message}`)
      setCarregando(false)
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function pesquisar() {
    if (!busca.trim() || !geocoderRef.current || !mapRef.current) return
    setErro(null)
    geocoderRef.current.geocode({ address: busca }, (results: any[], status: string) => {
      if (status !== 'OK' || !results?.[0]) {
        setErro('Endereço não encontrado. Tente ser mais específico ou clique no mapa.')
        return
      }
      const loc = results[0].geometry.location
      mapRef.current.setCenter(loc)
      mapRef.current.setZoom(19)
    })
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-noite">
      {/* Barra superior */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-white/10 bg-white/[0.03]">
        <button onClick={onFechar} className="text-white/60 hover:text-white text-xl leading-none">×</button>
        <p className="text-white font-bold text-sm shrink-0">Selecionar telhado</p>
        <div className="flex-1 flex gap-2 max-w-xl">
          <input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), pesquisar())}
            placeholder="Pesquisar rua, bairro ou cidade..."
            className="flex-1 px-3 py-1.5 bg-white/5 border border-white/15 rounded text-sm text-white"
          />
          <button
            onClick={pesquisar}
            className="px-3 py-1.5 bg-sol/20 border border-sol/40 text-sol text-sm font-bold rounded hover:bg-sol/30"
          >
            🔍
          </button>
        </div>
      </div>

      {/* Instrução */}
      <div className="px-4 py-2 bg-weg-azul/10 border-b border-weg-azul/30 text-xs text-weg-azul">
        💡 Navegue pelo satélite e <strong>clique em cima do telhado</strong> que quer prospectar. O endereço é preenchido automaticamente.
      </div>

      {/* Mapa */}
      <div className="flex-1 relative">
        <div ref={divMapa} className="absolute inset-0" />
        {carregando && (
          <div className="absolute inset-0 flex items-center justify-center bg-noite/80">
            <p className="text-white/60">Carregando mapa...</p>
          </div>
        )}
        {erro && (
          <div className="absolute top-4 left-1/2 -translate-x-1/2 px-4 py-2 bg-coral/20 border border-coral/40 text-coral text-sm rounded-lg z-10">
            {erro}
          </div>
        )}
      </div>

      {/* Rodapé — preview do ponto + confirmação */}
      {ponto && (
        <div className="p-4 border-t border-white/10 bg-white/[0.03] flex items-center gap-4">
          <div className="flex-1 min-w-0">
            <p className="text-white font-bold text-sm truncate">{ponto.endereco || 'Endereço não localizado'}</p>
            <p className="text-white/50 text-xs">
              {ponto.bairro && `${ponto.bairro} · `}
              {ponto.cidade && `${ponto.cidade}${ponto.uf ? '/' + ponto.uf : ''}`}
              {' · '}
              <span className="font-mono">{ponto.latitude.toFixed(5)}, {ponto.longitude.toFixed(5)}</span>
            </p>
          </div>
          <button
            onClick={() => onSelecionar(ponto)}
            className="shrink-0 px-4 py-2 bg-sol text-noite-0 font-bold rounded-lg hover:bg-sol-claro"
          >
            Usar este ponto →
          </button>
        </div>
      )}
    </div>
  )
}

async function reverseGeocode(geocoder: any, lat: number, lng: number): Promise<PontoTelhado> {
  return new Promise((resolve) => {
    geocoder.geocode({ location: { lat, lng } }, (results: any[], status: string) => {
      if (status !== 'OK' || !results?.[0]) {
        resolve({ latitude: lat, longitude: lng, endereco: '', bairro: null, cidade: null, uf: null, cep: null })
        return
      }
      const r = results[0]
      const comp = (tipo: string) => r.address_components.find((c: any) => c.types.includes(tipo))?.long_name || null
      const compShort = (tipo: string) => r.address_components.find((c: any) => c.types.includes(tipo))?.short_name || null
      resolve({
        latitude: lat,
        longitude: lng,
        endereco: r.formatted_address || '',
        bairro: comp('sublocality') || comp('sublocality_level_1') || comp('neighborhood'),
        cidade: comp('administrative_area_level_2') || comp('locality'),
        uf: compShort('administrative_area_level_1'),
        cep: comp('postal_code'),
      })
    })
  })
}
