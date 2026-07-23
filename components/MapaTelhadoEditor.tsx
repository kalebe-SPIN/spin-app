'use client'

import { useState, useEffect, useRef, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Loader } from '@googlemaps/js-api-loader'
import { salvarSecoesMapaAction } from '@/app/projetos/[id]/telhado/mapa/actions'

// Placa WEG padrão pra calcular capacidade estimada (620Wp bifacial)
const PLACA_AREA_M2 = 2.4 * 1.13  // ~2.71 m²
const PLACA_WP = 620
const FATOR_UTILIZACAO = 0.75     // ~75% da área útil após recuos/espaçamento

type Secao = {
  id: string
  identificador: string
  polygon: google.maps.Polygon
  area_m2: number
  azimute_graus: number
  orientacao: string
  qtd_placas_estimada: number
  potencia_kwp: number
  cor: string
}

const CORES = ['#f4d000', '#0f766e', '#1a4f8b', '#c0392b', '#7c3aed', '#e11d48']

export function MapaTelhadoEditor({
  projetoId, enderecoBusca, apiKey,
}: {
  projetoId: string
  enderecoBusca: string
  apiKey: string
}) {
  const router = useRouter()
  const mapaRef = useRef<HTMLDivElement>(null)
  const mapaInstance = useRef<google.maps.Map | null>(null)
  const drawingManager = useRef<google.maps.drawing.DrawingManager | null>(null)
  const [carregandoMaps, setCarregandoMaps] = useState(true)
  const [secoes, setSecoes] = useState<Secao[]>([])
  const [erroCarregar, setErroCarregar] = useState<string | null>(null)
  const [modoDesenho, setModoDesenho] = useState<'ver' | 'polygon'>('ver')
  const [pending, startTransition] = useTransition()
  const [msg, setMsg] = useState<string | null>(null)

  // Inicializa o mapa
  useEffect(() => {
    if (!mapaRef.current) return

    const loader = new Loader({
      apiKey,
      version: 'weekly',
      libraries: ['drawing', 'geometry', 'places'],
    })

    loader.load()
      .then(async () => {
        // Geocoding do endereço pra centralizar
        const geocoder = new google.maps.Geocoder()
        const result = await geocoder.geocode({ address: enderecoBusca })
        const centro = result.results[0]?.geometry.location || { lat: -27.09, lng: -48.63 } // Tijucas fallback

        const map = new google.maps.Map(mapaRef.current!, {
          center: centro,
          zoom: 20,
          mapTypeId: 'satellite',
          tilt: 0,     // vista topo (padrão pra desenho)
          disableDefaultUI: false,
          fullscreenControl: true,
          streetViewControl: false,
        })
        mapaInstance.current = map

        // Marcador do endereço
        new google.maps.Marker({
          position: centro,
          map,
          label: '🏠',
        })

        // Drawing Manager
        const dm = new google.maps.drawing.DrawingManager({
          drawingMode: null,
          drawingControl: false,  // vamos usar botões próprios
          polygonOptions: {
            fillColor: CORES[0],
            fillOpacity: 0.35,
            strokeColor: CORES[0],
            strokeWeight: 3,
            editable: true,
            draggable: false,
          },
        })
        dm.setMap(map)
        drawingManager.current = dm

        // Quando polígono desenhado, cria seção
        google.maps.event.addListener(dm, 'polygoncomplete', (polygon: google.maps.Polygon) => {
          adicionarSecaoFromPolygon(polygon)
          dm.setDrawingMode(null)
          setModoDesenho('ver')
        })

        setCarregandoMaps(false)
      })
      .catch((err) => {
        setErroCarregar(err?.message || 'Falha ao carregar Google Maps')
        setCarregandoMaps(false)
      })
  }, [apiKey, enderecoBusca])

  function adicionarSecaoFromPolygon(polygon: google.maps.Polygon) {
    const path = polygon.getPath()
    const area = google.maps.geometry.spherical.computeArea(path)  // metros²
    const azimute = calcularAzimuteMedio(path)
    const orientacao = azimuteParaOrientacao(azimute)
    const qtdPlacas = Math.floor((area * FATOR_UTILIZACAO) / PLACA_AREA_M2)
    const cor = CORES[secoes.length % CORES.length]

    // Aplica cor específica desse polígono
    polygon.setOptions({ fillColor: cor, strokeColor: cor })

    setSecoes((prev) => [
      ...prev,
      {
        id: `sec_${Date.now()}`,
        identificador: `Água ${prev.length + 1}`,
        polygon,
        area_m2: area,
        azimute_graus: azimute,
        orientacao,
        qtd_placas_estimada: qtdPlacas,
        potencia_kwp: (qtdPlacas * PLACA_WP) / 1000,
        cor,
      },
    ])
  }

  function iniciarDesenho() {
    if (!drawingManager.current) return
    drawingManager.current.setOptions({
      polygonOptions: {
        fillColor: CORES[secoes.length % CORES.length],
        fillOpacity: 0.35,
        strokeColor: CORES[secoes.length % CORES.length],
        strokeWeight: 3,
        editable: true,
      },
    })
    drawingManager.current.setDrawingMode(google.maps.drawing.OverlayType.POLYGON)
    setModoDesenho('polygon')
  }

  function cancelarDesenho() {
    if (drawingManager.current) drawingManager.current.setDrawingMode(null)
    setModoDesenho('ver')
  }

  function removerSecao(id: string) {
    const s = secoes.find((x) => x.id === id)
    if (s) s.polygon.setMap(null)
    setSecoes((prev) => prev.filter((x) => x.id !== id))
  }

  function renomearSecao(id: string, novo: string) {
    setSecoes((prev) => prev.map((s) => s.id === id ? { ...s, identificador: novo } : s))
  }

  async function salvarTudo() {
    if (secoes.length === 0) {
      setMsg('Desenhe pelo menos uma água antes de salvar.')
      return
    }
    setMsg(null)
    startTransition(async () => {
      const payload = secoes.map((s) => ({
        identificador: s.identificador,
        area_m2: Math.round(s.area_m2 * 100) / 100,
        orientacao: s.orientacao,
        azimute_graus: s.azimute_graus,
        coordenadas: s.polygon.getPath().getArray().map((p) => ({ lat: p.lat(), lng: p.lng() })),
      }))
      const res = await salvarSecoesMapaAction(projetoId, payload as any)
      if ('erro' in res && res.erro) setMsg(`⚠️ ${res.erro}`)
      else {
        setMsg(`✓ ${res.qtd_secoes} água(s) salva(s). Volte pro projeto pra continuar.`)
        setTimeout(() => router.push(`/projetos/${projetoId}`), 1500)
      }
    })
  }

  const areaTotal = secoes.reduce((s, x) => s + x.area_m2, 0)
  const placasTotal = secoes.reduce((s, x) => s + x.qtd_placas_estimada, 0)
  const kwpTotal = (placasTotal * PLACA_WP) / 1000

  return (
    <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
      {/* Mapa (3 colunas) */}
      <div className="lg:col-span-3 space-y-3">
        <div className="flex items-center gap-2 flex-wrap">
          {modoDesenho === 'ver' ? (
            <button
              onClick={iniciarDesenho}
              className="px-4 py-2 bg-sol text-noite font-bold text-sm rounded-lg hover:bg-sol/90"
            >
              ✏️ Desenhar água
            </button>
          ) : (
            <button
              onClick={cancelarDesenho}
              className="px-4 py-2 bg-white/10 border border-white/20 text-white text-sm rounded-lg hover:bg-white/15"
            >
              ✕ Cancelar desenho
            </button>
          )}
          {modoDesenho === 'polygon' && (
            <span className="text-xs text-sol animate-pulse">
              💡 Clique nos cantos da água — duplo-clique pra fechar
            </span>
          )}
        </div>

        {erroCarregar && (
          <div className="bg-coral/10 border border-coral/30 rounded p-3 text-xs text-coral">
            ⚠️ {erroCarregar}
          </div>
        )}

        <div
          ref={mapaRef}
          className="w-full h-[600px] rounded-xl border border-white/10 bg-noite"
          style={{ minHeight: '600px' }}
        >
          {carregandoMaps && (
            <div className="flex items-center justify-center h-full text-white/50 text-sm">
              ⏳ Carregando mapa satelite...
            </div>
          )}
        </div>
      </div>

      {/* Painel de seções (1 coluna sticky) */}
      <div className="lg:sticky lg:top-4 lg:self-start space-y-4">
        <div className="bg-white/[0.03] border border-white/10 rounded-xl p-4">
          <p className="text-xs uppercase tracking-wider font-bold text-sol mb-3">
            📐 Águas do telhado ({secoes.length})
          </p>

          {secoes.length === 0 ? (
            <p className="text-xs text-white/40 italic text-center py-4">
              Clique em "Desenhar água" e marque os cantos no mapa.
            </p>
          ) : (
            <div className="space-y-2 mb-3">
              {secoes.map((s) => (
                <div
                  key={s.id}
                  className="p-2 rounded border-l-4 bg-noite/40"
                  style={{ borderLeftColor: s.cor }}
                >
                  <div className="flex items-center justify-between mb-1 gap-2">
                    <input
                      type="text"
                      value={s.identificador}
                      onChange={(e) => renomearSecao(s.id, e.target.value)}
                      className="flex-1 px-1.5 py-0.5 bg-transparent border-b border-white/10 text-white text-xs font-bold focus:outline-none focus:border-sol"
                    />
                    <button
                      onClick={() => removerSecao(s.id)}
                      className="text-coral/70 hover:text-coral text-xs"
                      title="Remover"
                    >
                      🗑
                    </button>
                  </div>
                  <div className="grid grid-cols-2 gap-1 text-[10px] text-white/70 mt-1">
                    <span>Área: <strong>{s.area_m2.toFixed(1)} m²</strong></span>
                    <span>Face: <strong>{s.orientacao}</strong></span>
                    <span>Azimute: <strong>{s.azimute_graus.toFixed(0)}°</strong></span>
                    <span className="text-sol">~{s.qtd_placas_estimada} placas</span>
                  </div>
                </div>
              ))}
            </div>
          )}

          {secoes.length > 0 && (
            <div className="pt-3 border-t border-white/10 space-y-1 text-xs text-white/70">
              <div className="flex justify-between">
                <span>Área total</span>
                <strong className="text-white">{areaTotal.toFixed(1)} m²</strong>
              </div>
              <div className="flex justify-between">
                <span>Placas estimadas</span>
                <strong className="text-sol">{placasTotal} un</strong>
              </div>
              <div className="flex justify-between">
                <span>Potência estimada</span>
                <strong className="text-verde">{kwpTotal.toFixed(2)} kWp</strong>
              </div>
            </div>
          )}

          <button
            onClick={salvarTudo}
            disabled={pending || secoes.length === 0}
            className="w-full mt-4 px-4 py-2.5 bg-verde text-noite font-bold text-sm rounded-lg disabled:opacity-40"
          >
            {pending ? '⏳ Salvando...' : '✅ Salvar águas no projeto'}
          </button>
          {msg && <p className="text-[10px] mt-2 text-center text-white/70">{msg}</p>}
        </div>

        <div className="bg-weg-azul/5 border border-weg-azul/20 rounded-xl p-3 text-[10px] text-white/70">
          <p className="font-bold text-weg-azul mb-1">💡 Como usar</p>
          <ol className="space-y-1 pl-4 list-decimal">
            <li>Zoom no imóvel do cliente</li>
            <li>"Desenhar água" → clica cantos → duplo-clique fecha</li>
            <li>Repete pra cada água (norte, sul, leste...)</li>
            <li>Ajusta arrastando cantos se precisar</li>
            <li>Salva → volta pro projeto com dados prontos</li>
          </ol>
          <p className="mt-2 text-white/50">
            Estimativa: placa 620Wp WEG, ~75% de aproveitamento.
          </p>
        </div>
      </div>
    </div>
  )
}

// Norte = 0°, Leste = 90°, Sul = 180°, Oeste = 270°
function calcularAzimuteMedio(path: google.maps.MVCArray<google.maps.LatLng>): number {
  // Calcula centro do polígono
  const bounds = new google.maps.LatLngBounds()
  const pontos: google.maps.LatLng[] = []
  path.forEach((p) => { bounds.extend(p); pontos.push(p) })
  const centro = bounds.getCenter()

  // Pega o ponto mais distante do centro no eixo N-S (aproximação da direção de descida da água)
  let maxDist = 0
  let pontoExtremo = pontos[0]
  for (const p of pontos) {
    const d = google.maps.geometry.spherical.computeDistanceBetween(centro, p)
    if (d > maxDist) { maxDist = d; pontoExtremo = p }
  }

  // Azimute do centro até o ponto extremo (aproxima direção "pra onde desce a água")
  return google.maps.geometry.spherical.computeHeading(centro, pontoExtremo)
}

function azimuteParaOrientacao(azimuteGraus: number): string {
  // Normaliza pra 0-360
  const az = ((azimuteGraus % 360) + 360) % 360
  const direcoes = ['N', 'NE', 'E', 'SE', 'S', 'SO', 'O', 'NO']
  const idx = Math.round(az / 45) % 8
  return direcoes[idx]
}
