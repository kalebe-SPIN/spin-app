/**
 * Etiqueta da empresa (Kalebe 2026-10-19): cor só na borda, texto neutro
 * (visual minimalista). Módulo puro — tela e servidor.
 */
export const COR_ETIQUETA_EMPRESA: Record<string, string> = {
  azul: 'border-weg-azul/60',
  branco: 'border-white/40',
  coral: 'border-coral/60',
  sol: 'border-sol/60',
  verde: 'border-verde/60',
}

export const classeEtiquetaEmpresa = (cor: string | null | undefined) => COR_ETIQUETA_EMPRESA[cor || 'sol'] || COR_ETIQUETA_EMPRESA.sol
