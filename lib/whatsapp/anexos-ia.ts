/**
 * Fotos e PDFs do cliente que vão anexados pra IA ler (fatura, placa,
 * telhado). Usado pela Laís na qualificação e na cobertura do usuário.
 */

/** Tamanho em bytes via HEAD (null se não der pra saber) */
async function tamanhoRemoto(url: string): Promise<number | null> {
  try {
    const r = await fetch(url, { method: 'HEAD' })
    const n = Number(r.headers.get('content-length'))
    return r.ok && n > 0 ? n : null
  } catch {
    return null
  }
}

/**
 * Fotos/PDFs que o cliente mandou depois da última mensagem nossa — no
 * máximo 3, até 5 MB cada (limite de imagem da API e custo razoável).
 */
export async function anexosNovosDoCliente(
  msgs: Array<{ direcao: string; tipo: string; midia_url?: string | null; midia_mime?: string | null }>,
): Promise<Array<{ tipo: 'image' | 'pdf'; url: string }>> {
  const novas: typeof msgs = []
  for (let i = msgs.length - 1; i >= 0; i--) {
    if (msgs[i].direcao !== 'inbound') break
    novas.unshift(msgs[i])
  }
  const candidatos = novas
    .filter((m) => m.midia_url && (
      (m.tipo === 'image' && /image\/(jpeg|png|webp|gif)/.test(String(m.midia_mime || 'image/jpeg')))
      || (m.tipo === 'document' && String(m.midia_mime || '').includes('pdf'))
    ))
    .slice(-3)
  const saida: Array<{ tipo: 'image' | 'pdf'; url: string }> = []
  for (const m of candidatos) {
    const tam = await tamanhoRemoto(m.midia_url!)
    if (tam === null || tam > 5 * 1024 * 1024) continue
    saida.push({ tipo: m.tipo === 'image' ? 'image' : 'pdf', url: m.midia_url! })
  }
  return saida
}
