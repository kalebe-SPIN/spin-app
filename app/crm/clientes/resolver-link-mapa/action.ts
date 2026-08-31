'use server'

/**
 * Resolve link do Google Maps (colado do WhatsApp) → coordenadas +
 * endereço estruturado. Kalebe 2026-08-31: alguns clientes não têm
 * numeração no imóvel, então mandam a localização via WhatsApp.
 * O consultor cola o link aqui e o sistema busca o endereço exato.
 *
 * Aceita:
 *   - Link direto: https://www.google.com/maps/@-27.5,-48.5,17z
 *   - Query: https://www.google.com/maps?q=-27.5,-48.5
 *   - Shortlink: https://maps.app.goo.gl/XYZ (expande via HEAD/GET)
 *   - Coord pura: -27.5,-48.5
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

const GOOGLE_KEY =
  process.env.GOOGLE_MAPS_SERVER_KEY ||
  process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ||
  ''

/** Extrai lat/lng de uma string de URL. */
function extrairCoord(url: string): { lat: number; lng: number } | null {
  // Formato "lat,lng" puro
  const puro = url.trim().match(/^(-?\d+\.\d+)\s*,\s*(-?\d+\.\d+)$/)
  if (puro) return { lat: Number(puro[1]), lng: Number(puro[2]) }

  // Padrões comuns do Google Maps
  const padroes = [
    /@(-?\d+\.\d+),(-?\d+\.\d+)/,               // /@lat,lng,zoom
    /!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/,           // formato encoded
    /[?&]q=(-?\d+\.\d+),(-?\d+\.\d+)/,          // ?q=lat,lng
    /[?&]ll=(-?\d+\.\d+),(-?\d+\.\d+)/,         // ?ll=lat,lng
    /[?&]center=(-?\d+\.\d+),(-?\d+\.\d+)/,     // ?center=lat,lng
  ]
  for (const rx of padroes) {
    const m = url.match(rx)
    if (m) return { lat: Number(m[1]), lng: Number(m[2]) }
  }
  return null
}

/** Se for shortlink (maps.app.goo.gl / goo.gl), segue o redirect. */
async function expandirShortlink(url: string): Promise<string> {
  if (!/^https?:\/\/(maps\.app\.goo\.gl|goo\.gl|g\.co)/i.test(url)) return url
  try {
    const res = await fetch(url, { method: 'GET', redirect: 'follow' })
    return res.url || url
  } catch {
    return url
  }
}

async function reverseGeocode(lat: number, lng: number): Promise<Partial<EnderecoResolvido>> {
  if (!GOOGLE_KEY) return {}
  try {
    const url = `https://maps.googleapis.com/maps/api/geocode/json?latlng=${lat},${lng}&key=${GOOGLE_KEY}&language=pt-BR`
    const res = await fetch(url)
    const json: any = await res.json()
    const r = json?.results?.[0]
    if (!r) return {}
    const comps: any[] = r.address_components || []
    const get = (tipo: string) => comps.find((c) => c.types?.includes(tipo))?.long_name || ''
    const shortOf = (tipo: string) => comps.find((c) => c.types?.includes(tipo))?.short_name || ''
    return {
      logradouro: get('route'),
      numero: get('street_number') || undefined,
      bairro: get('sublocality_level_1') || get('sublocality') || get('neighborhood'),
      cidade: get('administrative_area_level_2') || get('locality'),
      uf: shortOf('administrative_area_level_1'),
      cep: get('postal_code'),
      descricao_completa: r.formatted_address,
    }
  } catch {
    return {}
  }
}

export async function resolverLinkGoogleMapsAction(input: string): Promise<
  { ok: true; endereco: EnderecoResolvido } | { ok: false; erro: string }
> {
  const bruto = (input || '').trim()
  if (!bruto) return { ok: false, erro: 'Cole um link ou coordenada' }

  // 1. Expande shortlink se necessário
  let url = bruto
  if (/^https?:\/\//i.test(url)) {
    url = await expandirShortlink(url)
  }

  // 2. Tenta extrair lat/lng
  const coord = extrairCoord(url) || extrairCoord(bruto)
  if (!coord) {
    return {
      ok: false,
      erro: 'Não achei coordenadas neste link. Cole a URL completa do Google Maps (formato ?q=lat,lng ou @lat,lng) ou digite "lat,lng" diretamente.',
    }
  }

  // 3. Reverse geocode (opcional — mesmo sem, retorna lat/lng)
  const enrich = await reverseGeocode(coord.lat, coord.lng)
  return {
    ok: true,
    endereco: {
      lat: coord.lat,
      lng: coord.lng,
      ...enrich,
    },
  }
}
