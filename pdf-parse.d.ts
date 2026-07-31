// Types pro import direto de pdf-parse/lib/pdf-parse.js (evita o self-test
// do index.js que quebra em produção com ENOENT './test/data/...pdf').
declare module 'pdf-parse/lib/pdf-parse.js' {
  interface PDFInfo {
    numpages: number
    numrender: number
    info: Record<string, unknown>
    metadata: unknown
    version: string
    text: string
  }
  function pdf(dataBuffer: Buffer | Uint8Array, options?: Record<string, unknown>): Promise<PDFInfo>
  export default pdf
  export = pdf
}
