import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { STATUS_INFO, getTituloTipo, type StatusExecucao } from '@/lib/execucoes'
import { ExecucaoDetalheClient } from '@/components/ExecucaoDetalheClient'

export const dynamic = 'force-dynamic'
export const revalidate = 0

export default async function ExecucaoDetalhePage({ params }: { params: { id: string } }) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: exec, error } = await supabase
    .from('execucoes_servicos')
    .select(`
      *,
      projeto:projeto_id(id, codigo, cliente_razao_social, cliente_telefone, cliente_endereco)
    `)
    .eq('id', params.id)
    .maybeSingle()

  if (error || !exec) notFound()

  const { data: historico } = await supabase
    .from('execucoes_status_historico')
    .select('*')
    .eq('execucao_id', params.id)
    .order('created_at', { ascending: false })

  const projeto = Array.isArray(exec.projeto) ? exec.projeto[0] : exec.projeto
  const info = STATUS_INFO[exec.status as StatusExecucao] || STATUS_INFO.aguardando_pre_requisitos

  return (
    <main className="min-h-screen p-8 md:p-12">
      <div className="max-w-4xl mx-auto">
        <header className="mb-8">
          <Link href="/execucoes" className="text-xs text-white/40 hover:text-white/60 mb-2 inline-block">
            ← Todas execuções
          </Link>
          <div className="flex items-baseline gap-3 flex-wrap mb-2">
            <span className="text-xs font-mono text-white/40">{projeto?.codigo}</span>
            <span className={`text-[10px] uppercase tracking-wider font-bold px-2 py-0.5 rounded-full border ${info.cor} ${info.bg}`}>
              {info.emoji} {info.label}
            </span>
          </div>
          <h1 className="text-3xl md:text-4xl font-black text-white">
            {exec.titulo}
          </h1>
          <p className="text-white/60 mt-1 text-sm">
            {getTituloTipo(exec.tipo_servico)} · {projeto?.cliente_razao_social}
          </p>
        </header>

        <ExecucaoDetalheClient
          execucao={exec}
          projeto={projeto}
          historico={historico || []}
        />
      </div>
    </main>
  )
}
