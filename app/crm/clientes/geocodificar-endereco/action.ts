'use server'

/**
 * Geocoding forward: texto livre → coordenadas + endereço estruturado.
 *
 * Kalebe 2026-08-31: usado no /projetos/novo pra
 *   1) auto-ativar o mapa depois de completar CEP + rua + número
 *   2) barra "🔍 Buscar no Maps" onde o consultor digita endereço à mão
 *
 * Complementa o resolverLinkGoogleMapsAction, que faz o inverso
 * (link/coord → endereço). Reusa a mesma chave server e o mesmo
 * shape de retorno (EnderecoResolvido) pra o front tratar igual.
 */

import type { EnderecoResolvido } from '@/app/crm/clientes/resolver-link-mapa/action'

const GOOGLE_KEY =
  process.env.GOOGLE_MAPS_SERVER_KEY ||
  process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ||
  ''

export async function geocodificarEnderecoAction(endereco: string): Promise<
  { ok: true; endereco: EnderecoResolvido } | { ok: false; erro: string }
> {
  const q = (endereco || '').trim()
  if (!q) return { ok: false, erro: 'Digite um endereço pra buscar' }
  if (!GOOGLE_KEY) return { ok: false, erro: 'Chave Google Maps server não configurada' }

  try {
    const url =
      `https://maps.googleapis.com/maps/api/geocode/json` +
      `?address=${encodeURIComponent(q)}` +
      `&region=br&language=pt-BR&components=country:BR` +
      `&key=${GOOGLE_KEY}`
    const res = await fetch(url, { cache: 'no-store' })
    const json: any = await res.json()

    if (json.status === 'ZERO_RESULTS') {
      return { ok: false, erro: 'Endereço não localizado. Tente ser mais específico (cidade + UF).' }
    }
    if (json.status !== 'OK') {
      return { ok: false, erro: `Google Maps: ${json.status || 'erro desconhecido'}` }
    }
    const r = json.results?.[0]
    if (!r) return { ok: false, erro: 'Sem resultados' }

    const loc = r.geometry?.location
    if (!loc || typeof loc.lat !== 'number' || typeof loc.lng !== 'number') {
      return { ok: false, erro: 'Coordenada inválida no retorno' }
    }

    const comps: any[] = r.address_components || []
    const get = (tipo: string) => comps.find((c) => c.types?.includes(tipo))?.long_name || ''
    const shortOf = (tipo: string) => comps.find((c) => c.types?.includes(tipo))?.short_name || ''

    return {
      ok: true,
      endereco: {
        lat: loc.lat,
        lng: loc.lng,
        logradouro: get('route') || undefined,
        numero: get('street_number') || undefined,
        bairro: get('sublocality_level_1') || get('sublocality') || get('neighborhood') || undefined,
        cidade: get('administrative_area_level_2') || get('locality') || undefined,
        uf: shortOf('administrative_area_level_1') || undefined,
        cep: get('postal_code') || undefined,
        descricao_completa: r.formatted_address,
      },
    }
  } catch (e: any) {
    return { ok: false, erro: e?.message || 'Falha na geocodificação' }
  }
}
