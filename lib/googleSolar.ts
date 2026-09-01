/**
 * Wrapper da Google Solar API — buildingInsights.findClosest.
 *
 * Retorna dados calculados por foto aérea: quantidade máxima de placas que
 * cabem no telhado, área útil, geração anual estimada e qualidade da imagem
 * usada. Se o local estiver fora da cobertura da API (comum em áreas rurais
 * do Brasil), retorna null e o fluxo cai pra estimativa manual.
 *
 * Chamado do browser — usa NEXT_PUBLIC_GOOGLE_MAPS_API_KEY (mesma chave do
 * Maps JS, restrita por HTTP referrer). A Solar API precisa estar habilitada
 * no projeto Google Cloud (fizemos isso).
 *
 * Custo: ~US$ 0,005 por consulta (US$ 5 por 1.000).
 */

export type SolarInsights = {
  maxPlacas: number
  areaUtilM2: number
  geracaoAnualKwh: number
  qualidade: 'HIGH' | 'MEDIUM' | 'LOW'
  panelCapacityWatts: number
  potenciaMaxKwp: number
  // Bounding box do prédio inteiro — [{lat,lng}, {lat,lng}]
  centroPredio?: { lat: number; lng: number } | null
  // Segmentos por face do telhado — pra vetorizar visualmente
  segmentos?: Array<{
    areaM2: number
    inclinacaoGraus: number
    orientacaoGraus: number  // 0=N, 90=E, 180=S, 270=W
    centro: { lat: number; lng: number }
    // Caixa aproximada do segmento (Solar API não devolve polígono exato,
    // mas devolve a bounding box que a gente pode desenhar como retângulo)
    boundingBox?: {
      sw: { lat: number; lng: number }
      ne: { lat: number; lng: number }
    }
  }>
}

export async function buscarSolarInsights(
  latitude: number,
  longitude: number,
): Promise<SolarInsights | null> {
  const key =
    process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ||
    'AIzaSyDAHavsflEo_Ju2JdT_hHG0u663vOJMzts'
  if (!key) return null

  const url =
    `https://solar.googleapis.com/v1/buildingInsights:findClosest` +
    `?location.latitude=${latitude}` +
    `&location.longitude=${longitude}` +
    `&requiredQuality=LOW` + // aceita qualquer nível — se HIGH não existe, tenta MEDIUM/LOW
    `&key=${key}`

  try {
    const res = await fetch(url)
    if (!res.ok) return null // 404 = fora da cobertura; 400 = coords inválidas; etc.

    const data = await res.json()
    const sp = data?.solarPotential
    if (!sp) return null

    // Pega a configuração de painéis MÁXIMA (última do array) — a que usa
    // todos os painéis possíveis. É a nossa "capacidade teto" do telhado.
    const configs = sp.solarPanelConfigs as Array<{
      panelsCount: number
      yearlyEnergyDcKwh: number
    }> | undefined

    const configMax = configs?.[configs.length - 1]
    const geracaoAnualKwh = configMax?.yearlyEnergyDcKwh ?? 0

    const maxPlacas = sp.maxArrayPanelsCount ?? 0
    const areaUtilM2 = sp.maxArrayAreaMeters2 ?? 0
    const panelCapacityWatts = sp.panelCapacityWatts ?? 400
    const potenciaMaxKwp = (maxPlacas * panelCapacityWatts) / 1000

    const qualidade = (data.imageryQuality || 'LOW') as SolarInsights['qualidade']

    if (!maxPlacas) return null

    // Extrai segmentos do telhado — cada face vira um retângulo colorido.
    const rawSegs = (sp.roofSegmentStats || []) as any[]
    const segmentos = rawSegs.map((s) => {
      const bb = s.boundingBox
      const centro = s.center || {}
      return {
        areaM2: Number((s.stats?.areaMeters2 || 0).toFixed(2)),
        inclinacaoGraus: Number((s.pitchDegrees || 0).toFixed(1)),
        orientacaoGraus: Number((s.azimuthDegrees || 0).toFixed(1)),
        centro: {
          lat: Number(centro.latitude ?? 0),
          lng: Number(centro.longitude ?? 0),
        },
        boundingBox: bb ? {
          sw: { lat: Number(bb.sw?.latitude ?? 0), lng: Number(bb.sw?.longitude ?? 0) },
          ne: { lat: Number(bb.ne?.latitude ?? 0), lng: Number(bb.ne?.longitude ?? 0) },
        } : undefined,
      }
    }).filter((s) => s.areaM2 > 0)

    const centroPredio = data.center ? {
      lat: Number(data.center.latitude),
      lng: Number(data.center.longitude),
    } : null

    return {
      maxPlacas,
      areaUtilM2: Number(areaUtilM2.toFixed(2)),
      geracaoAnualKwh: Number(geracaoAnualKwh.toFixed(0)),
      qualidade,
      panelCapacityWatts,
      potenciaMaxKwp: Number(potenciaMaxKwp.toFixed(2)),
      centroPredio,
      segmentos,
    }
  } catch {
    return null
  }
}
