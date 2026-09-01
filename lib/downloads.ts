/**
 * Baixa um arquivo remoto (Supabase Storage, etc) forçando salvar na
 * máquina do usuário — sem abrir no browser.
 *
 * Motivo: <a href="…" download="…"> é IGNORADO pelo browser quando a
 * URL é cross-origin (Storage vive em outro domínio). Solução: fetch
 * do arquivo, cria blob local (same-origin) e clica num link temporário.
 *
 * Kalebe pediu 2026-08-27: 'diagrama e todos os arquivos podem ser
 * baixados para a máquina'.
 */
export async function baixarArquivo(url: string, nomeArquivo?: string): Promise<void> {
  if (!url) throw new Error('URL vazia')

  // Se falhar CORS/fetch, fallback: window.open (pelo menos abre em aba)
  try {
    const resp = await fetch(url, { mode: 'cors' })
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`)
    const blob = await resp.blob()
    const blobUrl = URL.createObjectURL(blob)

    const nome = nomeArquivo || inferirNomeDaUrl(url) || 'arquivo'

    const a = document.createElement('a')
    a.href = blobUrl
    a.download = nome
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)

    // Libera memória depois de um tick — se libera imediatamente,
    // browser pode cancelar o download em andamento em alguns casos
    setTimeout(() => URL.revokeObjectURL(blobUrl), 1000)
  } catch (err) {
    console.error('[baixarArquivo] erro no fetch, abrindo em aba:', err)
    window.open(url, '_blank', 'noopener,noreferrer')
  }
}

/** Extrai o nome do arquivo do fim da URL (antes de query string) */
function inferirNomeDaUrl(url: string): string {
  try {
    const u = new URL(url)
    const path = u.pathname
    const parts = path.split('/').filter(Boolean)
    const nome = parts[parts.length - 1] || ''
    // Decode %20 etc.
    return decodeURIComponent(nome)
  } catch {
    return ''
  }
}

/**
 * Nomenclatura padrão dos arquivos gerados pela Spin.
 * Kalebe 2026-08-27: formato `NOME_FINALIDADE_TIPO.ext`
 * Exemplo: KALEBE_DIAGRAMA_UNIFILAR_PDF.pdf
 *
 * Regras:
 *  - Uppercase sem acentos
 *  - Espaços/pontuação viram underscore
 *  - Só primeiro nome (ou razão social truncada) pra caber
 *  - `tipo` deve ser a extensão em UPPER (PDF, DXF, SVG, XLSX, ZIP…)
 */
export function nomearArquivo(input: {
  cliente: string | null | undefined
  finalidade: string
  tipo: string
}): string {
  const nomeCliente = normalizarNome(input.cliente || 'CLIENTE')
  const finalidade = normalizarNome(input.finalidade)
  const tipoUpper = String(input.tipo || '').toUpperCase().replace(/[^A-Z0-9]/g, '')
  const ext = tipoUpper.toLowerCase() || 'bin'
  return `${nomeCliente}_${finalidade}_${tipoUpper}.${ext}`
}

/**
 * Nomenclatura específica pra propostas comerciais.
 * Kalebe 2026-09-01: 'PROPOSTA_POTÊNCIACC/CA_NOME DO CLIENTE' em UPPER.
 *
 * Como '/' quebra em filesystem (é separador de path), uso hífen entre
 * as duas potências: PROPOSTA_5.2CC-4.4CA_JOAO SILVA.pdf
 * O nome do cliente PRESERVA espaços (só remove acentos).
 *
 * Se falta CC (fluxo VE), fica só CA:  PROPOSTA_7.4CA_JOAO SILVA.pdf
 * Se falta CA (raro), fica só CC:      PROPOSTA_5.2CC_JOAO SILVA.pdf
 */
export function nomearProposta(input: {
  cliente: string | null | undefined
  potenciaCcKwp?: number | null
  potenciaCaKw?: number | null
  ext?: 'pdf' | 'zip'
}): string {
  const cliente = normalizarNomePreservaEspacos(input.cliente || 'CLIENTE')
  const cc = Number(input.potenciaCcKwp)
  const ca = Number(input.potenciaCaKw)
  const partes: string[] = []
  if (cc > 0) partes.push(`${cc.toFixed(cc >= 10 ? 1 : 2)}CC`.replace(/\.?0+CC$/, 'CC'))
  if (ca > 0) partes.push(`${ca.toFixed(ca >= 10 ? 1 : 2)}CA`.replace(/\.?0+CA$/, 'CA'))
  const potencias = partes.join('-') || 'SEMDIMENSAO'
  const ext = input.ext || 'pdf'
  return `PROPOSTA_${potencias}_${cliente}.${ext}`
}

/** UPPERCASE + remove acentos, PRESERVA espaços simples. */
function normalizarNomePreservaEspacos(s: string): string {
  return String(s || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9 ]+/g, ' ')  // não-alfanumérico vira espaço
    .replace(/\s+/g, ' ')
    .trim()
}

/** Remove acentos, uppercase, colapsa não-alfanumérico em _ */
function normalizarNome(s: string): string {
  return String(s || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')       // tira diacríticos
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_') // não-letra vira _
    .replace(/^_+|_+$/g, '')      // trim de _
    .replace(/_+/g, '_')          // colapsa _ duplos
}
