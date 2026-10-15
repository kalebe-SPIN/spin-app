import { createClient } from '@/lib/supabase/client'

/**
 * Datasheet no navegador (Kalebe 2026-10-14): lê o PDF com a IA
 * (/api/extrair-datasheet, só admin) e guarda o arquivo no bucket
 * "datasheets" — usado no cadastro de equipamento dentro das propostas.
 */

export type DadosDatasheet = {
  fabricante?: string
  modelo?: string
  descricao_curta?: string
  descricao_tecnica?: string | null
  subcategoria?: string | null
  codigo_sugerido?: string | null
  specs?: Record<string, unknown>
  confianca?: string
  observacoes?: string
}

/** Desconto de integrador WEG sobre a tabela (mesmo fator do cadastro do catálogo). */
export const FATOR_CUSTO_WEG = 0.4182
export const ehFabricanteWeg = (fabricante: string | null | undefined) => String(fabricante || '').trim().toUpperCase().startsWith('WEG')

export async function lerDatasheet(arquivo: File, categoria: string): Promise<DadosDatasheet | { erro: string }> {
  if (arquivo.type !== 'application/pdf' && !arquivo.type.startsWith('image/')) return { erro: 'Use PDF ou imagem do datasheet' }
  const fd = new FormData()
  fd.append('arquivo', arquivo)
  fd.append('categoria', categoria)
  try {
    const res = await fetch('/api/extrair-datasheet', { method: 'POST', body: fd })
    const json = await res.json().catch(() => ({}))
    if (!res.ok || !json.sucesso) return { erro: json.erro || 'A IA não conseguiu ler o datasheet — preencha à mão' }
    return json as DadosDatasheet
  } catch {
    return { erro: 'Falha de rede ao ler o datasheet' }
  }
}

/** Sobe o PDF e devolve a URL pública (null se o envio falhar — o cadastro segue sem anexo). */
export async function subirDatasheet(arquivo: File, codigo?: string | null): Promise<string | null> {
  const supabase = createClient()
  const base = (codigo || `SPIN-${Date.now().toString(36).toUpperCase()}`).replace(/[^\w.-]+/g, '-')
  const ext = arquivo.type === 'application/pdf' ? 'pdf' : (arquivo.name.split('.').pop() || 'bin').toLowerCase()
  const caminho = `${base}-${Date.now()}.${ext}`
  const { error } = await supabase.storage.from('datasheets').upload(caminho, arquivo, { contentType: arquivo.type, upsert: false })
  if (error) return null
  return supabase.storage.from('datasheets').getPublicUrl(caminho).data.publicUrl
}
