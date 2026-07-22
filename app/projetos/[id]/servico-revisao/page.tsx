import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { ServicoRevisaoForm } from '@/components/ServicoRevisaoForm'

export const dynamic = 'force-dynamic'
export const revalidate = 0

export default async function ServicoRevisaoPage({ params }: { params: { id: string } }) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: projeto, error } = await supabase
    .from('projetos')
    .select('id, codigo, cliente_razao_social')
    .eq('id', params.id)
    .single()

  if (error || !projeto) notFound()

  const { data: paramRow } = await supabase
    .from('parametros_precificacao_servicos')
    .select('parametros')
    .eq('chave', 'revisao_manutencao')
    .maybeSingle()

  const { data: itemExistente } = await supabase
    .from('projeto_itens')
    .select('dados, valor_estimado')
    .eq('projeto_id', params.id)
    .eq('tipo', 'srv_manutencao')
    .neq('status', 'removido')
    .maybeSingle()

  if (!paramRow) {
    return (
      <main className="min-h-screen p-8 md:p-12">
        <div className="max-w-3xl mx-auto bg-coral/10 border border-coral/30 rounded-xl p-6">
          <h1 className="text-xl font-bold text-coral">Parâmetros não configurados</h1>
          <p className="text-white/70 text-sm mt-2">
            Rode a Migration <strong>050</strong> no Supabase.
          </p>
        </div>
      </main>
    )
  }

  return (
    <main className="min-h-screen p-8 md:p-12">
      <div className="max-w-4xl mx-auto">
        <header className="mb-8">
          <Link href={`/projetos/${projeto.id}`} className="text-xs text-white/40 hover:text-white/60 mb-2 inline-block">
            ← Voltar ao projeto
          </Link>
          <div className="flex items-center gap-3 mb-1">
            <span className="text-xs font-mono text-white/40">{projeto.codigo}</span>
            <span className="text-[10px] uppercase tracking-wider font-bold px-2 py-0.5 rounded-full bg-sol/10 text-sol">
              🔧 Serviço
            </span>
          </div>
          <h1 className="text-3xl md:text-4xl font-black text-white">
            Revisão e manutenção de usina
          </h1>
          <p className="text-white/60 mt-1 text-sm">
            {projeto.cliente_razao_social} · Inspeção + limpeza + testes opcionais + relatório técnico.
          </p>
        </header>

        <ServicoRevisaoForm
          projetoId={projeto.id}
          parametros={paramRow.parametros}
          entradasIniciais={itemExistente?.dados?.entradas || null}
          valorFinalInicial={itemExistente?.valor_estimado || null}
        />
      </div>
    </main>
  )
}
