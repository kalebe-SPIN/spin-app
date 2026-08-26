import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { PropostaVEClient } from '@/components/PropostaVEClient'

export const dynamic = 'force-dynamic'
export const revalidate = 0

/**
 * PDF da proposta da Estação de Recarga VE.
 * Kalebe pediu 2026-08-26: proposta seguindo padrão da Direção A
 * com blocos de Equipamentos + Lista de materiais + Serviços
 * (incluindo diagrama unifilar e trifilar quando marcados).
 */
export default async function PropostaVEPage({ params }: { params: { id: string } }) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: projeto } = await supabase
    .from('projetos')
    .select('*')
    .eq('id', params.id)
    .single()

  if (!projeto) notFound()

  const selecao = projeto.ve_recarga_selecionada
  if (!selecao?.equipamentos?.length && !selecao?.wallbox?.id) {
    return (
      <main className="min-h-screen p-8">
        <div className="max-w-2xl mx-auto p-6 bg-coral/10 border border-coral/30 rounded-xl">
          <h2 className="text-lg font-bold text-coral mb-2">⚠ Estação de recarga não configurada</h2>
          <p className="text-sm text-white/70 mb-4">
            Você precisa selecionar os equipamentos WEG e gerar a Lista CA antes de emitir a proposta.
          </p>
          <Link href={`/projetos/${projeto.id}/ve`} className="inline-block px-4 py-2 bg-sol text-noite font-bold text-sm rounded">
            → Ir pra composição da estação
          </Link>
        </div>
      </main>
    )
  }

  const { data: configEmpresa } = await supabase
    .from('configuracoes_empresa')
    .select('*')
    .eq('singleton', true)
    .single()

  return (
    <main className="min-h-screen p-4 sm:p-6 md:p-8">
      <div className="max-w-screen-2xl mx-auto">
        <header className="mb-6">
          <Link href={`/projetos/${projeto.id}/ve`} className="text-xs text-white/40 hover:text-white/60 mb-2 inline-block">
            ← Voltar à composição da estação
          </Link>
          <div className="flex items-center gap-3 mb-1 flex-wrap">
            <span className="text-xs font-mono text-white/40">{projeto.codigo}</span>
            <span className="text-[10px] uppercase tracking-wider font-bold px-2 py-0.5 rounded-full bg-sol/10 text-sol">
              Proposta VE
            </span>
          </div>
          <h1 className="text-2xl md:text-3xl font-black text-white">
            ⚡🚗 Proposta da estação de recarga
          </h1>
          <p className="text-white/60 mt-1 text-sm">
            {projeto.cliente_razao_social} · Preview do PDF antes de baixar/enviar
          </p>
        </header>

        <PropostaVEClient
          projeto={projeto}
          selecao={selecao}
          configEmpresa={configEmpresa}
        />
      </div>
    </main>
  )
}
