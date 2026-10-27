// Reduz fotos antes do upload (máx. 2000 px, JPEG 85%). PDFs passam direto.
// Fotos HEIC do iPhone: o navegador converte ao desenhar no canvas quando suporta;
// se não suportar, o upload é recusado com mensagem clara.
export async function prepararArquivo(file: File): Promise<{ blob: Blob; mime: string; ext: string }> {
  if (file.type === "application/pdf") return { blob: file, mime: "application/pdf", ext: "pdf" };
  try {
    const bmp = await createImageBitmap(file);
    const k = Math.min(1, 2000 / Math.max(bmp.width, bmp.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bmp.width * k);
    canvas.height = Math.round(bmp.height * k);
    canvas.getContext("2d")!.drawImage(bmp, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/jpeg", 0.85));
    if (blob) return { blob, mime: "image/jpeg", ext: "jpg" };
  } catch {
    /* cai no tratamento abaixo */
  }
  if (["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
    return { blob: file, mime: file.type, ext: file.type.split("/")[1] };
  }
  throw new Error("Formato não aceito. Envie foto JPG/PNG ou PDF.");
}
