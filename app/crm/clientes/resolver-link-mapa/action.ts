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

/** Segue redirects HTTP MANUALMENTE (não deixa o fetch resolver) —
 *  assim pega a URL exata do 'Location' header, sem o Google servir
 *  HTML default do datacenter Vercel (EUA) que polui a extração.
 *  Kalebe 2026-08-31: sem isso link BR resolvia coord dos EUA. */
const UA_BROWSER =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36'

async function seguirRedirectsManual(url: string, maxHops = 10): Promise<{ finalUrl: string; html?: string }> {
  const isShort = /^https?:\/\/(maps\.app\.goo\.gl|goo\.gl|g\.co)/i.test(url)
  if (!isShort) return { finalUrl: url }
  let atual = url
  for (let i = 0; i < maxHops; i++) {
    try {
      const res = await fetch(atual, {
        method: 'GET',
        redirect: 'manual',
        headers: {
          'User-Agent': UA_BROWSER,
          'Accept-Language': 'pt-BR,pt;q=0.9',
          'Accept': 'text/html,application/xhtml+xml',
          // Cookie CONSENT pula a tela de aceite do Google (evita
          // redirect pra consent.google.com que quebra a extração)
          'Cookie': 'CONSENT=YES+cb.pt-BR+FX+000; NID=511=abc',
        },
      })
      if (res.status >= 300 && res.status < 400) {
        const loc = res.headers.get('location')
        if (!loc) break
        // Se a próxima URL já tem coordenada visível, para aqui
        atual = loc.startsWith('http') ? loc : new URL(loc, atual).toString()
        if (/[@!]3d/.test(atual) || /[@]-?\d+\.\d+,-?\d+\.\d+/.test(atual)) {
          return { finalUrl: atual }
        }
        continue
      }
      // 200 (ou similar) — lê corpo pra fallback HTML
      const html = await res.text()
      return { finalUrl: res.url || atual, html }
    } catch {
      break
    }
  }
  return { finalUrl: atual }
}

/** Extrai lat/lng do HTML do Google Maps.
 *  Só usa !3d!4d — que só aparece no marker exato do place resolvido
 *  (não em POIs adjacentes / centro do mapa default). Outros padrões
 *  como 'latitude'/'APP_INITIALIZATION_STATE' pegam qualquer coord no
 *  HTML e retornam falso positivo (bug reportado 2026-08-31: link BR
 *  resolvia coord dos EUA por causa disso). */
function extrairCoordDoHtml(html: string): { lat: number; lng: number } | null {
  // !3d!4d é o formato ligado ao place_id específico. Se aparecer
  // MÚLTIPLAS vezes com valores diferentes, pega a mais frequente
  // (o marker principal costuma repetir várias vezes na página).
  const rx = /!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/g
  const contagem = new Map<string, { lat: number; lng: number; qtd: number }>()
  let m: RegExpExecArray | null
  while ((m = rx.exec(html)) !== null) {
    const lat = Number(m[1])
    const lng = Number(m[2])
    if (isFinite(lat) && isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180) {
      const chave = `${lat.toFixed(5)},${lng.toFixed(5)}`
      const atual = contagem.get(chave)
      if (atual) atual.qtd++
      else contagem.set(chave, { lat, lng, qtd: 1 })
    }
  }
  if (contagem.size === 0) return null
  // Escolhe a coord que aparece mais vezes (marker principal)
  let vencedor: { lat: number; lng: number; qtd: number } | null = null
  for (const c of contagem.values()) {
    if (!vencedor || c.qtd > vencedor.qtd) vencedor = c
  }
  return vencedor ? { lat: vencedor.lat, lng: vencedor.lng } : null
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
    const r = await seguirRedirectsManual(url)
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
