import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { buscarPainelWaAction, type PainelWa } from './actions'
import { PainelWaClient } from '@/components/admin/PainelWaClient'

/**
 * /admin/whatsapp — painel operacional do canal WhatsApp Spin.
 * Kalebe 2026-09-14: 'preciso do acesso dentro do sistema já'.
 */
export const dynamic = 'force-dynamic'
export const revalidate = 0

export default async function AdminWhatsAppPage() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const { data: perfil } = await supabase
    .from('profiles').select('role').eq('id', user.id).maybeSingle()
  if (perfil?.role !== 'admin') redirect('/dashboard')

  const dadosIniciais = await buscarPainelWaAction()
  if ('erro' in dadosIniciais) {
    return (
      <main className="min-h-screen p-8">
        <p className="text-coral">Erro: {dadosIniciais.erro}</p>
      </main>
    )
  }

  return (
    <main className="min-h-screen p-4 sm:p-6 md:p-8 lg:p-12">
      <div className="max-w-7xl mx-auto">
        <header className="mb-8 flex items-start justify-between gap-4">
          <div>
            <Link href="/admin" className="text-xs text-white/40 hover:text-white/60 mb-2 inline-block">
              ← Painel Admin
            </Link>
            <h1 className="text-3xl md:text-4xl font-black text-white">
              💬 Canal WhatsApp Spin
            </h1>
            <p className="text-white/60 mt-1 text-sm">
              Painel operacional — conversas, broadcasts, fila FIFO e agentes IA.
              Substitui o TROIA.
            </p>
          </div>
          <div className="flex flex-col gap-2 items-end shrink-0">
            <Link href="/inbox" className="px-4 py-2 rounded bg-sol/20 border border-sol/40 text-sol text-xs font-bold hover:bg-sol/30">
              Abrir Inbox →
            </Link>
            <Link href="/admin/agentes" className="text-xs text-white/60 hover:text-white/80">
              Gerenciar agentes IA
            </Link>
          </div>
        </header>

        <PainelWaClient dadosIniciais={dadosIniciais as PainelWa} />
      </div>
    </main>
  )
}
