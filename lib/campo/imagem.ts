/**
 * Reduz a foto no celular antes de subir (câmera manda 4–12 MB; o servidor
 * aceita até 4,5 MB por requisição). JPEG, lado maior ≤ maxLado.
 */
export async function fotoReduzida(f: File, maxLado = 1600, qualidade = 0.82): Promise<Blob> {
  const url = URL.createObjectURL(f)
  try {
    const img = await new Promise<HTMLImageElement>((ok, falha) => {
      const i = new Image()
      i.onload = () => ok(i)
      i.onerror = () => falha(new Error('Não consegui ler a foto'))
      i.src = url
    })
    const escala = Math.min(1, maxLado / Math.max(img.naturalWidth, img.naturalHeight))
    const canvas = document.createElement('canvas')
    canvas.width = Math.round(img.naturalWidth * escala)
    canvas.height = Math.round(img.naturalHeight * escala)
    canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height)
    return await new Promise<Blob>((ok, falha) =>
      canvas.toBlob((b) => (b ? ok(b) : falha(new Error('Não consegui ler a foto'))), 'image/jpeg', qualidade))
  } finally {
    URL.revokeObjectURL(url)
  }
}
