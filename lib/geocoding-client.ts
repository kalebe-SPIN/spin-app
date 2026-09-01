/**
 * Geocoding client-side (sem depender de env var server).
 *
 * Kalebe 2026-08-31: a GOOGLE_MAPS_SERVER_KEY do Vercel não está
 * configurada — 'CEP OK, mas o mapa não localizou'. Solução: chamar
 * o endpoint Geocoding direto do browser usando a chave pública que
 * já funciona pro carregamento do mapa (mesma key da JS API).
 *
 * A restrição de referrer HTTP da key pública NÃO é problema porque
 * a chamada sai do browser (referrer válido). Só é bloqueada em
 * chamadas server. Bônus: sem hop no Vercel = mais rápido.
 */

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

// Fallback hardcoded: a env var NEXT_PUBLIC_GOOGLE_MAPS_API_KEY não
// está no Vercel. A chave abaixo é restrita a referrer HTTP (funciona
// só de app.spinsolar.com.br, *.vercel.app, localhost:3000). Kalebe.
const KEY =
  process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ||
  'AIzaSyDAHavsflEo_Ju2JdT_hHG0u663vOJMzts'

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

/** Texto livre → coord + endereço estruturado. */
export async function geocodificarEnderecoCliente(query: string): Promise<
  { ok: true; endereco: EnderecoResolvido } | { ok: false; erro: string }
> {
  const q = (query || '').trim()
  if (!q) return { ok: false, erro: 'Digite um endereço' }
  if (!KEY) return { ok: false, erro: 'Chave Google Maps não configurada no ambiente' }

  try {
    const url =
      `https://maps.googleapis.com/maps/api/geocode/json` +
      `?address=${encodeURIComponent(q)}` +
      `&region=br&language=pt-BR&components=country:BR` +
      `&key=${KEY}`
    const res = await fetch(url)
    const json: any = await res.json()

    if (json.status === 'ZERO_RESULTS') {
      return { ok: false, erro: 'Endereço não localizado. Tente ser mais específico (rua + cidade + UF).' }
    }
    if (json.status === 'REQUEST_DENIED') {
      return {
        ok: false,
        erro: `Google Maps recusou a chamada: ${json.error_message || 'chave sem permissão pra Geocoding API'}. Habilite Geocoding no Cloud Console.`,
      }
    }
    if (json.status === 'OVER_QUERY_LIMIT') {
      return { ok: false, erro: 'Cota do Google Maps atingida. Tente daqui a pouco.' }
    }
    if (json.status !== 'OK') {
      return { ok: false, erro: `Google Maps: ${json.status}` }
    }
    const r = json.results?.[0]
    if (!r) return { ok: false, erro: 'Sem resultados' }
    const loc = r.geometry?.location
    if (!loc?.lat || !loc?.lng) return { ok: false, erro: 'Coordenada inválida' }

    return {
      ok: true,
      endereco: {
        lat: loc.lat,
        lng: loc.lng,
        ...parseComponents(r.address_components || []),
        descricao_completa: r.formatted_address,
      },
    }
  } catch (e: any) {
    return { ok: false, erro: e?.message || 'Falha de rede' }
  }
}

/** Coord → endereço estruturado (reverse). */
export async function reverseGeocodeCliente(lat: number, lng: number): Promise<Partial<EnderecoResolvido>> {
  if (!KEY) return {}
  try {
    const url =
      `https://maps.googleapis.com/maps/api/geocode/json` +
      `?latlng=${lat},${lng}` +
      `&language=pt-BR&key=${KEY}`
    const res = await fetch(url)
    const json: any = await res.json()
    const r = json?.results?.[0]
    if (!r) return {}
    return {
      ...parseComponents(r.address_components || []),
      descricao_completa: r.formatted_address,
    }
  } catch {
    return {}
  }
}
