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

/** Se for shortlink (maps.app.goo.gl / goo.gl), segue o redirect com
 *  User-Agent de browser real. Google serve HTML diferente pra
 *  requests sem UA de browser. */
const UA_BROWSER =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36'

async function expandirShortlink(url: string): Promise<{ finalUrl: string; html?: string }> {
  if (!/^https?:\/\/(maps\.app\.goo\.gl|goo\.gl|g\.co)/i.test(url)) return { finalUrl: url }
  try {
    const res = await fetch(url, {
      method: 'GET',
      redirect: 'follow',
      headers: { 'User-Agent': UA_BROWSER, 'Accept-Language': 'pt-BR' },
    })
    const html = await res.text()
    return { finalUrl: res.url || url, html }
  } catch {
    return { finalUrl: url }
  }
}

/** Extrai lat/lng do HTML do Google Maps (várias regex — o layout
 *  muda com frequência). Retorna null se não achou. */
function extrairCoordDoHtml(html: string): { lat: number; lng: number } | null {
  const padroes = [
    /"latlng":\s*\{\s*"lat":\s*(-?\d+\.\d+),\s*"lng":\s*(-?\d+\.\d+)/,
    /"latitude":\s*(-?\d+\.\d+),\s*"longitude":\s*(-?\d+\.\d+)/,
    /APP_INITIALIZATION_STATE=.*?\[\[null,null,(-?\d+\.\d+),(-?\d+\.\d+)/s,
    /!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/,
    /"@type":\s*"GeoCoordinates".*?"latitude":\s*"?(-?\d+\.\d+)"?.*?"longitude":\s*"?(-?\d+\.\d+)"?/s,
    /center=(-?\d+\.\d+)(?:%2C|,)(-?\d+\.\d+)/,
    /q=(-?\d+\.\d+),(-?\d+\.\d+)/,
    /@(-?\d+\.\d+),(-?\d+\.\d+)/,
  ]
  for (const rx of padroes) {
    const m = html.match(rx)
    if (m) {
      const lat = Number(m[1])
      const lng = Number(m[2])
      // Sanidade: BR fica entre lat -34..5, lng -74..-34; mundo -90..90 / -180..180
      if (isFinite(lat) && isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180) {
        return { lat, lng }
      }
    }
  }
  return null
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

  // 1. Expande shortlink se necessário (com User-Agent de browser real)
  let url = bruto
  let htmlDaExpansao: string | undefined
  if (/^https?:\/\//i.test(url)) {
    const r = await expandirShortlink(url)
    url = r.finalUrl
    htmlDaExpansao = r.html
  }

  // 2. Tenta extrair lat/lng em ordem: URL final → URL bruta → HTML do
  //    Google (o shortlink às vezes redireciona pra uma URL sem
  //    coordenadas na querystring, mas com elas dentro do HTML).
  let coord = extrairCoord(url) || extrairCoord(bruto)
  if (!coord && htmlDaExpansao) {
    coord = extrairCoordDoHtml(htmlDaExpansao)
  }
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
