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
