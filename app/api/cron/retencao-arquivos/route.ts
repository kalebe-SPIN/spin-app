import { NextRequest, NextResponse } from 'next/server'
import { executarRetencao } from '@/lib/retencao/arquivos'

/**
 * Cron diário — apaga arquivo de cliente com mais de 180 dias quando o
 * cliente não fechou negócio. Regra completa em lib/retencao/arquivos.ts.
 *
 * Executado por Vercel Cron (vercel.json). Manual: header
 * Authorization: Bearer CRON_SECRET.
 */

export const runtime = 'nodejs'
export const maxDuration = 60

export async function GET(req: NextRequest) {
  // Com CRON_SECRET configurado, a Vercel manda o Bearer — exige ele.
  // Sem, aceita o user-agent do Vercel Cron (mesmo padrão do bianca-eventos).
  const segredo = process.env.CRON_SECRET
  const auth = req.headers.get('authorization')
  const isVercelCron = req.headers.get('user-agent')?.includes('vercel-cron')
  const autorizado = segredo ? auth === `Bearer ${segredo}` : isVercelCron
  if (!autorizado) {
    return NextResponse.json({ erro: 'Nao autorizado' }, { status: 401 })
  }

  try {
    const resultado = await executarRetencao()
    console.log('[cron/retencao-arquivos]', JSON.stringify(resultado))
    return NextResponse.json({ sucesso: true, executado_em: new Date().toISOString(), ...resultado })
  } catch (e: any) {
    console.error('[cron/retencao-arquivos]', e)
    return NextResponse.json({ erro: e?.message }, { status: 500 })
  }
}
