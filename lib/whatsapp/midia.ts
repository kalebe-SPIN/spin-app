import { createAdminClient } from '@/lib/supabase/admin'
import { getWaConfig } from './config'

/**
 * Helpers pra baixar mídia recebida pelo webhook WhatsApp e salvar no
 * bucket wa_midia do Supabase Storage.
 *
 * Kalebe 2026-09-21: antes o webhook guardava só o midia_meta_id (URL
 * temporária Meta que expira em 5min), então o inbox nunca conseguia
 * mostrar PDF/imagem/áudio. Agora baixa no ato e persiste midia_url
 * apontando pro Storage público (bucket wa_midia).
 */

const BUCKET = 'wa_midia'

/** Extensão inferida do mime type — pra a URL ter extensão útil */
function extFromMime(mime: string | null | undefined): string {
  const m = String(mime || '').toLowerCase()
  if (m.includes('pdf')) return 'pdf'
  if (m.includes('jpeg') || m.includes('jpg')) return 'jpg'
  if (m.includes('png')) return 'png'
  if (m.includes('webp')) return 'webp'
  if (m.includes('gif')) return 'gif'
  if (m.includes('ogg')) return 'ogg'
  if (m.includes('mpeg') && m.includes('audio')) return 'mp3'
  if (m.includes('audio/mp4') || m.includes('m4a')) return 'm4a'
  if (m.includes('aac')) return 'aac'
  if (m.includes('mp4')) return 'mp4'
  if (m.includes('webm')) return 'webm'
  if (m.includes('3gpp')) return '3gp'
  return 'bin'
}

/**
 * Baixa a mídia da Meta pelo media_id e salva no Storage. Retorna URL
 * pública ou null em qualquer falha (o webhook segue gravando a msg
 * mesmo sem url — melhor perder a mídia que perder a mensagem).
 */
export async function baixarESalvarMidiaWa(entrada: {
  midia_meta_id: string
  mime_hint?: string | null
  nome_original?: string | null
}): Promise<{ midia_url: string; midia_mime: string; nome_arquivo: string } | null> {
  try {
    const cfg = await getWaConfig()
    const token = cfg.access_token
    if (!token) {
      console.warn('[wa/midia] sem token — pulando download')
      return null
    }

    // 1. Meta media metadata (traz url temporária de download)
    const metaRes = await fetch(
      `https://graph.facebook.com/v20.0/${entrada.midia_meta_id}`,
      { headers: { Authorization: `Bearer ${token}` } },
    )
    if (!metaRes.ok) {
      console.error('[wa/midia] Meta metadata falhou:', metaRes.status, await metaRes.text())
      return null
    }
    const meta = await metaRes.json()
    const urlDownload: string | undefined = meta.url
    const mime: string = meta.mime_type || entrada.mime_hint || 'application/octet-stream'
    if (!urlDownload) return null

    // 2. Baixa o binário (também exige o token)
    const bin = await fetch(urlDownload, { headers: { Authorization: `Bearer ${token}` } })
    if (!bin.ok) {
      console.error('[wa/midia] download falhou:', bin.status)
      return null
    }
    const buffer = Buffer.from(await bin.arrayBuffer())

    // 3. Sobe pro Storage. Path: YYYY-MM-DD/{meta_id}.{ext}
    const admin = createAdminClient()
    const hoje = new Date().toISOString().slice(0, 10)
    const ext = extFromMime(mime)
    const path = `${hoje}/${entrada.midia_meta_id}.${ext}`

    const { error: upErr } = await admin.storage
      .from(BUCKET)
      .upload(path, buffer, { contentType: mime, upsert: true })
    if (upErr) {
      console.error('[wa/midia] upload storage falhou:', upErr)
      return null
    }

    // 4. URL pública
    const { data: pub } = admin.storage.from(BUCKET).getPublicUrl(path)
    if (!pub?.publicUrl) return null

    return {
      midia_url: pub.publicUrl,
      midia_mime: mime,
      nome_arquivo: entrada.nome_original || `arquivo.${ext}`,
    }
  } catch (e) {
    console.error('[wa/midia] baixarESalvarMidiaWa erro:', e)
    return null
  }
}
