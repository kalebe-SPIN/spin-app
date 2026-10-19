import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { ComposicaoRecargaProjeto } from '@/components/propostas/ComposicaoRecargaProjeto'
import { BotaoMemorialIN23 } from '@/components/propostas/BotaoMemorialIN23'

export const dynamic = 'force-dynamic'
export const revalidate = 0

/**
 * Proposta da estação de recarga (Kalebe 2026-10-14): equipamentos →
 * projeto → execução, com as respostas de infraestrutura calculando na hora.
 * A mesma composição abre dentro do Spinzap (ModalPropostaRecarga).
 */
export default async function VeRecargaPage({ params }: { params: { id: string } }) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: projeto, error } = await supabase
    .from('projetos')
    .select('id, codigo, cliente_razao_social')
    .eq('id', params.id)
    .single()
  if (error || !projeto) notFound()

  return (
    <main className="min-h-screen p-4 sm:p-6 md:p-8">
      <div className="max-w-3xl mx-auto">
        <header className="mb-6">
          <Link href={`/projetos/${projeto.id}`} className="text-xs text-white/40 hover:text-white/60 mb-2 inline-block">
            ← Voltar ao projeto
          </Link>
          <div className="flex items-center gap-3 mb-1">
            <span className="text-xs font-mono text-white/40">{projeto.codigo}</span>
            <span data-etiqueta className="text-[10px] uppercase tracking-wider font-bold px-2 py-0.5 rounded-full border border-sol/50 text-white/70">
              Estação de recarga
            </span>
          </div>
          <h1 className="text-2xl md:text-3xl font-black text-white">⚡ Proposta da estação de recarga</h1>
          <p className="text-white/60 mt-1 text-sm">{projeto.cliente_razao_social} · equipamentos → projeto → execução</p>
          {/* Kalebe 2026-10-17: memorial técnico da IN 23 do CBMSC, pro RT */}
          <div className="mt-3"><BotaoMemorialIN23 projetoId={projeto.id} /></div>
        </header>
        <ComposicaoRecargaProjeto projetoId={projeto.id} nomeCliente={projeto.cliente_razao_social || ''} />
      </div>
    </main>
  )
}
