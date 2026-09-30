import { NextResponse } from 'next/server'

/**
 * Link curto e com a marca da Spin pro PDF da proposta (Kalebe 2026-09-30):
 *   app.spinsolar.com.br/proposta/<projeto>/<arquivo>.pdf → bucket propostas-pdf
 * Usado pelo botão "Ver proposta" do modelo spin_proposta_pronta (WhatsApp).
 * Só aceita caminho de arquivo .pdf do bucket — não redireciona pra outro lugar.
 */
export const dynamic = 'force-dynamic'

export async function GET(_req: Request, { params }: { params: { caminho: string[] } }) {
  const caminho = (params.caminho || []).join('/')
  if (!/^[A-Za-z0-9_-]+(\/[A-Za-z0-9_.-]+)*\.pdf$/.test(caminho) || caminho.includes('..')) {
    return new NextResponse('Proposta não encontrada', { status: 404 })
  }
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL
  if (!base) return new NextResponse('Indisponível', { status: 503 })
  return NextResponse.redirect(`${base}/storage/v1/object/public/propostas-pdf/${caminho}`, 302)
}
