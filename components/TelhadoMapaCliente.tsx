'use client'

import { useEffect, useRef, useState } from 'react'
import { MapContainer, TileLayer, useMapEvents, Marker, Polygon, Popup, useMap } from 'react-leaflet'
import L from 'leaflet'
import type { LatLngExpression } from 'leaflet'
import area from '@turf/area'
import centroid from '@turf/centroid'
import { polygon as turfPolygon, point as turfPoint } from '@turf/helpers'
import 'leaflet/dist/leaflet.css'
import type { Props, FaceDesenhada } from './TelhadoMapa'

// Fix do ícone padrão do Leaflet em bundlers
if (typeof window !== 'undefined') {
  // @ts-ignore
  delete L.Icon.Default.prototype._getIconUrl
  L.Icon.Default.mergeOptions({
    iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
    iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
    shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
  })
}

const DEFAULT_CENTER: [number, number] = [-27.2406, -48.6359] // Tijucas/SC fallback
const DEFAULT_ZOOM = 17

/**
 * Gera variações progressivas da query pra tentar encontrar endereço no OSM.
 * Vai do mais específico ao mais genérico.
 */
function gerarVariacoesQuery(original: string): string[] {
  const s = original.replace(/\s+/g, ' ').trim()
  const variacoes = new Set<string>()

  // 1. Original + Brasil
  variacoes.add(`${s}, Brasil`)

  // 2. Só a parte "rua/av + número + cidade" (sem bairro no meio, se detectar)
  const partes = s.split(',').map(p => p.trim()).filter(Boolean)
  if (partes.length > 1) {
    variacoes.add(`${partes[0]}, ${partes[partes.length - 1]}, Brasil`)
  }

  // 3. Trocar acentos (algumas bases indexam sem)
  const semAcento = s.normalize('NFD').replace(/[̀-ͯ]/g, '')
  variacoes.add(`${semAcento}, Brasil`)

  // 4. Só cidade + UF (última tentativa, cai perto do endereço)
  const lastPart = partes[partes.length - 1] || s
  variacoes.add(`${lastPart}, Brasil`)

  return Array.from(variacoes)
}

export default function TelhadoMapaCliente({
  endereco,
  coordenadasIniciais,
  onFaceDesenhada,
}: Props) {
  const [centro, setCentro] = useState<[number, number]>(
    coordenadasIniciais || DEFAULT_CENTER
  )
  const [buscandoEndereco, setBuscandoEndereco] = useState(false)
  const [erroEndereco, setErroEndereco] = useState<string | null>(null)
  const [pontos, setPontos] = useState<[number, number][]>([])
  const [areaCalculada, setAreaCalculada] = useState<number | null>(null)
  const [centroide, setCentroide] = useState<[number, number] | null>(null)

  // Geocoda endereço inicial via Nominatim (gratuito)
  useEffect(() => {
    if (!endereco || coordenadasIniciais) return
    let cancelado = false
    setBuscandoEndereco(true)
    setErroEndereco(null)

    fetch(
      `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(endereco)}`,
      { headers: { 'User-Agent': 'spin-solar-portal/1.0' } }
    )
      .then((r) => r.json())
      .then((data: any[]) => {
        if (cancelado) return
        if (data && data.length > 0) {
          const lat = parseFloat(data[0].lat)
          const lon = parseFloat(data[0].lon)
          setCentro([lat, lon])
        } else {
          setErroEndereco('Endereço não encontrado. Use o zoom/arraste pra ajustar o mapa.')
        }
      })
      .catch(() => {
        if (!cancelado) setErroEndereco('Falha ao buscar endereço. Use o mapa manualmente.')
      })
      .finally(() => {
        if (!cancelado) setBuscandoEndereco(false)
      })

    return () => { cancelado = true }
  }, [endereco, coordenadasIniciais])

  // Recalcula área quando pontos mudam (precisa ≥3)
  useEffect(() => {
    if (pontos.length < 3) {
      setAreaCalculada(null)
      setCentroide(null)
      return
    }
    // Fecha polígono (último ponto = primeiro)
    const coords = [...pontos, pontos[0]].map(([lat, lng]) => [lng, lat])
    try {
      const poly = turfPolygon([coords])
      const areaM2 = area(poly)
      const c = centroid(poly)
      const [lng, lat] = c.geometry.coordinates
      setAreaCalculada(Math.round(areaM2 * 100) / 100)
      setCentroide([lat, lng])
    } catch {
      setAreaCalculada(null)
    }
  }, [pontos])

  function handleClickMapa(latlng: { lat: number; lng: number }) {
    setPontos((prev) => [...prev, [latlng.lat, latlng.lng]])
  }

  function desfazerUltimoPonto() {
    setPontos((prev) => prev.slice(0, -1))
  }

  function limparTudo() {
    setPontos([])
  }

  function confirmarFace() {
    if (pontos.length < 3 || !areaCalculada || !centroide) return
    onFaceDesenhada({
      coordenadas: pontos,
      area_m2: areaCalculada,
      centroide,
    })
    setPontos([]) // Reset pra próxima face
  }

  // Busca manual de endereço (quando o auto-preenchimento não funciona)
  const [buscaManual, setBuscaManual] = useState('')
  const [enderecoIdentificado, setEnderecoIdentificado] = useState<string | null>(null)
  const [tentativasFalhadas, setTentativasFalhadas] = useState<string[]>([])

  async function buscarComQuery(query: string): Promise<any> {
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=br&q=${encodeURIComponent(query)}`,
        { headers: { 'User-Agent': 'spin-solar-portal/1.0' } }
      )
      const data = await res.json()
      return data && data.length > 0 ? data[0] : null
    } catch {
      return null
    }
  }

  async function buscarEnderecoManual(e: React.FormEvent) {
    e.preventDefault()
    if (!buscaManual.trim()) return
    setBuscandoEndereco(true)
    setErroEndereco(null)
    setEnderecoIdentificado(null)
    setTentativasFalhadas([])

    const original = buscaManual.trim()

    // Gera variações da query pra tentar em ordem (mais específica → menos)
    const variacoes = gerarVariacoesQuery(original)
    const tentadas: string[] = []

    for (const query of variacoes) {
      tentadas.push(query)
      const resultado = await buscarComQuery(query)
      if (resultado) {
        const lat = parseFloat(resultado.lat)
        const lon = parseFloat(resultado.lon)
        setCentro([lat, lon])
        setEnderecoIdentificado(resultado.display_name)
        setBuscandoEndereco(false)
        return
      }
      // Espera 200ms entre tentativas pra não abusar da API
      await new Promise(r => setTimeout(r, 200))
    }

    setTentativasFalhadas(tentadas)
    setErroEndereco(
      'Endereço não encontrado no OpenStreetMap. A base é limitada em endereços brasileiros específicos. ' +
      'Tente: (1) trocar acento; (2) adicionar CEP; (3) usar apenas bairro + cidade + UF; ' +
      '(4) buscar só a cidade e navegar manualmente no mapa.'
    )
    setBuscandoEndereco(false)
  }

  return (
    <div className="space-y-3">
      {/* Busca de endereço (fatura CELESC costuma vir abreviada) */}
      <div className="bg-white/[0.03] border border-white/10 rounded-lg p-4">
        <label className="text-xs uppercase tracking-wider text-white/60 font-bold block mb-2">
          🔍 Buscar endereço no mapa
        </label>
        <form onSubmit={buscarEnderecoManual} className="flex flex-col md:flex-row gap-2">
          <input
            type="text"
            value={buscaManual}
            onChange={e => setBuscaManual(e.target.value)}
            placeholder={endereco || 'Ex: Rua das Flores, 123, Ilhota, SC'}
            className="flex-1 px-3 py-2 bg-noite/40 border border-white/10 rounded-lg text-sm text-white placeholder:text-white/30 focus:outline-none focus:border-sol/50"
          />
          <button
            type="submit"
            disabled={buscandoEndereco || !buscaManual.trim()}
            className="px-4 py-2 bg-sol text-noite font-bold text-sm rounded-lg disabled:opacity-40 whitespace-nowrap"
          >
            {buscandoEndereco ? '⏳ Buscando...' : 'Buscar no mapa →'}
          </button>
        </form>
        {enderecoIdentificado && (
          <div className="mt-3 bg-verde/10 border border-verde/30 rounded p-2.5 text-xs">
            <p className="text-verde font-bold mb-0.5">✓ Endereço encontrado:</p>
            <p className="text-white/80">{enderecoIdentificado}</p>
          </div>
        )}
        {tentativasFalhadas.length > 0 && (
          <details className="mt-3 bg-coral/5 border border-coral/20 rounded p-2.5 text-[10px]">
            <summary className="cursor-pointer text-coral font-bold">
              Tentativas de busca ({tentativasFalhadas.length})
            </summary>
            <ul className="mt-1 space-y-0.5 text-white/60">
              {tentativasFalhadas.map((t, i) => <li key={i}>• {t}</li>)}
            </ul>
          </details>
        )}
        <p className="text-[10px] text-white/40 mt-2 leading-relaxed">
          💡 A CELESC costuma abreviar endereço na fatura. Se não achar, tente formatos como:
          <br />
          <span className="text-white/60">
            "Rua Coronel Marcos, Ilhota, SC" · "Centro, Tijucas, SC" · "88760-000" · "Ilhota, SC"
          </span>
        </p>
      </div>

      {/* Instruções */}
      <div className="bg-weg-azul/10 border border-weg-azul/30 rounded-lg p-3 text-sm text-white/80">
        <strong className="text-white">Como usar:</strong> Use o zoom (scroll do mouse) pra
        chegar perto do telhado.{' '}
        <strong className="text-white">Clique em cada canto</strong> da face do telhado em ordem.
        Mínimo 3 pontos pra formar área. Depois clica em "Confirmar face".
      </div>

      {/* Mapa */}
      <div className="relative rounded-xl overflow-hidden border border-white/10">
        <MapContainer
          center={centro as LatLngExpression}
          zoom={DEFAULT_ZOOM}
          maxZoom={22}
          style={{ height: '500px', width: '100%' }}
          scrollWheelZoom
        >
          <RecentralizarMapa centro={centro} />
          <TileLayer
            url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
            attribution="© Esri World Imagery"
            maxNativeZoom={19}
            maxZoom={22}
          />
          <ClickHandler onClick={handleClickMapa} />

          {/* Polígono em construção */}
          {pontos.length >= 2 && (
            <Polygon
              positions={pontos as LatLngExpression[]}
              pathOptions={{
                color: '#F5B400',
                fillColor: '#F5B400',
                fillOpacity: 0.3,
                weight: 3,
              }}
            />
          )}

          {/* Marcadores dos pontos */}
          {pontos.map((p, i) => (
            <Marker key={i} position={p as LatLngExpression}>
              <Popup>Ponto {i + 1}</Popup>
            </Marker>
          ))}
        </MapContainer>

        {buscandoEndereco && (
          <div className="absolute top-2 right-2 bg-black/70 text-white text-xs px-3 py-1.5 rounded">
            🔍 Localizando endereço...
          </div>
        )}
      </div>

      {erroEndereco && (
        <div className="bg-coral/10 border border-coral/30 rounded-lg p-3 text-xs text-coral">
          {erroEndereco}
        </div>
      )}

      {/* Painel de status */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div className="bg-white/5 border border-white/10 rounded-lg p-3">
          <div className="text-xs text-white/40 uppercase tracking-wider">Pontos marcados</div>
          <div className="text-xl font-bold text-white">{pontos.length}</div>
        </div>
        <div className="bg-white/5 border border-white/10 rounded-lg p-3">
          <div className="text-xs text-white/40 uppercase tracking-wider">Área calculada</div>
          <div className="text-xl font-bold text-sol">
            {areaCalculada != null ? `${areaCalculada} m²` : '—'}
          </div>
        </div>
        <div className="bg-white/5 border border-white/10 rounded-lg p-3">
          <div className="text-xs text-white/40 uppercase tracking-wider">Status</div>
          <div className="text-sm font-bold text-white">
            {pontos.length < 3 ? `Faltam ${3 - pontos.length} pontos` : 'Pronto pra confirmar ✓'}
          </div>
        </div>
      </div>

      {/* Botões */}
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={desfazerUltimoPonto}
          disabled={pontos.length === 0}
          className="px-4 py-2 bg-white/5 border border-white/10 rounded-lg text-sm font-semibold text-white hover:bg-white/10 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          ↶ Desfazer último ponto
        </button>
        <button
          type="button"
          onClick={limparTudo}
          disabled={pontos.length === 0}
          className="px-4 py-2 bg-white/5 border border-white/10 rounded-lg text-sm font-semibold text-white hover:bg-white/10 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          ✕ Limpar tudo
        </button>
        <button
          type="button"
          onClick={confirmarFace}
          disabled={pontos.length < 3 || !areaCalculada}
          className="ml-auto px-6 py-2 bg-sol text-noite font-bold rounded-lg hover:bg-sol/90 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          ✓ Confirmar esta face
        </button>
      </div>
    </div>
  )
}

function ClickHandler({ onClick }: { onClick: (latlng: { lat: number; lng: number }) => void }) {
  useMapEvents({
    click(e) {
      onClick(e.latlng)
    },
  })
  return null
}

function RecentralizarMapa({ centro }: { centro: [number, number] }) {
  const map = useMap()
  useEffect(() => {
    map.setView(centro, DEFAULT_ZOOM)
  }, [centro, map])
  return null
}
