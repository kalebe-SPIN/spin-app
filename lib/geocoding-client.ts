// @ts-nocheck
/**
 * Geocoding client-side usando google.maps.Geocoder do SDK JS.
 *
 * Kalebe 2026-08-31 (fix definitivo): o Google mudou a política em
 * 2024 — chamadas REST diretas ao endpoint Geocoding recusam chaves
 * com restrição de HTTP referrer ('API keys with referer restrictions
 * cannot be used with this API'). SÓ chaves sem restrição funcionam
 * pro endpoint REST.
 *
 * Solução: usar google.maps.Geocoder do SDK JavaScript. Esse cliente
 * roda dentro do contexto autenticado do Maps JS, e aceita chaves
 * restritas por referrer (mesma chave que já carrega o mapa).
 *
 * O SDK é carregado sob demanda via Loader — na primeira chamada,
 * baixa (~40kb, cache do browser depois). Reusa a instância do
 * Geocoder entre chamadas subsequentes.
 */

import { Loader } from '@googlemaps/js-api-loader'

export type EnderecoResolvido = {
  lat: number
  lng: number
  logradouro?: string
  numero?: string
  bairro?: string
  cidade?: string
  uf?: string
  cep?: string
  descricao_completa?: string
}

const KEY =
  process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ||
  'AIzaSyDAHavsflEo_Ju2JdT_hHG0u663vOJMzts'

let geocoderPromise: Promise<any> | null = null

/** Garante que o SDK Maps está carregado e retorna um Geocoder. */
async function pegarGeocoder(): Promise<any> {
  if (!geocoderPromise) {
    geocoderPromise = (async () => {
      // Se o Maps JS já foi carregado por outro componente (mapa),
      // reusa direto sem baixar de novo.
      const g = (window as any).google
      if (g?.maps?.Geocoder) return new g.maps.Geocoder()
      const loader = new Loader({ apiKey: KEY, version: 'weekly', libraries: [] })
      await loader.load()
      return new (window as any).google.maps.Geocoder()
    })()
  }
  return geocoderPromise
}

function parseComponents(comps: any[]): Partial<EnderecoResolvido> {
  const get = (t: string) => comps.find((c) => c.types?.includes(t))?.long_name || ''
  const shortOf = (t: string) => comps.find((c) => c.types?.includes(t))?.short_name || ''
  return {
    logradouro: get('route') || undefined,
    numero: get('street_number') || undefined,
    bairro: get('sublocality_level_1') || get('sublocality') || get('neighborhood') || undefined,
    cidade: get('administrative_area_level_2') || get('locality') || undefined,
    uf: shortOf('administrative_area_level_1') || undefined,
    cep: get('postal_code') || undefined,
  }
}

/** Texto livre → coord + endereço estruturado (via SDK). */
export async function geocodificarEnderecoCliente(query: string): Promise<
  { ok: true; endereco: EnderecoResolvido } | { ok: false; erro: string }
> {
  const q = (query || '').trim()
  if (!q) return { ok: false, erro: 'Digite um endereço' }

  try {
    const geocoder = await pegarGeocoder()
    const resp: any = await geocoder.geocode({
      address: q,
      region: 'br',
      // language é config do Loader, aqui só region importa
    })
    const results = resp?.results || []
    if (results.length === 0) {
      return { ok: false, erro: 'Endereço não localizado. Tente ser mais específico (rua + cidade + UF).' }
    }
    const r = results[0]
    const loc = r.geometry?.location
    const lat = typeof loc?.lat === 'function' ? loc.lat() : loc?.lat
    const lng = typeof loc?.lng === 'function' ? loc.lng() : loc?.lng
    if (typeof lat !== 'number' || typeof lng !== 'number') {
      return { ok: false, erro: 'Coordenada inválida no retorno' }
    }
    return {
      ok: true,
      endereco: {
        lat, lng,
        ...parseComponents(r.address_components || []),
        descricao_completa: r.formatted_address,
      },
    }
  } catch (e: any) {
    const status = e?.code || e?.status || ''
    if (status === 'ZERO_RESULTS') return { ok: false, erro: 'Endereço não localizado' }
    if (status === 'OVER_QUERY_LIMIT') return { ok: false, erro: 'Cota do Google Maps atingida' }
    if (status === 'REQUEST_DENIED') return { ok: false, erro: `Google Maps recusou: ${e?.message || 'chave sem permissão'}` }
    return { ok: false, erro: e?.message || 'Falha na geocodificação' }
  }
}

/** Coord → endereço estruturado (via SDK). */
export async function reverseGeocodeCliente(lat: number, lng: number): Promise<Partial<EnderecoResolvido>> {
  try {
    const geocoder = await pegarGeocoder()
    const resp: any = await geocoder.geocode({ location: { lat, lng } })
    const r = resp?.results?.[0]
    if (!r) return {}
    return {
      ...parseComponents(r.address_components || []),
      descricao_completa: r.formatted_address,
    }
  } catch {
    return {}
  }
}
