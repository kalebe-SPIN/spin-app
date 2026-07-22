import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { ServicoInstalacaoForm } from '@/components/ServicoInstalacaoForm'

export const dynamic = 'force-dynamic'
export const revalidate = 0

export default async function ServicoInstalacaoPage({ params }: { params: { id: string } }) {
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
    .eq('chave', 'instalacao_placas')
    .maybeSingle()

  const { data: itemExistente } = await supabase
    .from('projeto_itens')
    .select('dados, valor_estimado')
    .eq('projeto_id', params.id)
    .eq('tipo', 'srv_instalacao_placas')
    .neq('status', 'removido')
    .maybeSingle()

  // Catálogo WEG: placas ativas + estruturas ativas com preço atual
  const { data: placasCat } = await supabase
    .from('produtos')
    .select(`id, codigo_weg, modelo, categoria, specs,
             precos_produtos!inner(preco_venda, vigente_ate)`)
    .eq('categoria', 'placa')
    .eq('ativo', true)
    .is('precos_produtos.vigente_ate', null)
    .order('modelo')

  const { data: estruturasCat } = await supabase
    .from('produtos')
    .select(`id, codigo_weg, modelo, categoria, specs,
             precos_produtos!inner(preco_venda, vigente_ate)`)
    .eq('categoria', 'estrutura')
    .eq('ativo', true)
    .is('precos_produtos.vigente_ate', null)
    .order('modelo')

  const { data: cabosCat } = await supabase
    .from('produtos')
    .select(`id, codigo_weg, modelo, categoria, specs,
             precos_produtos!inner(preco_venda, vigente_ate)`)
    .in('categoria', ['cabo_cc', 'cabo_ca', 'cabo'])
    .eq('ativo', true)
    .is('precos_produtos.vigente_ate', null)
    .order('modelo')

  const placasCatalogo = (placasCat || []).map((p: any) => ({
    id: p.id,
    codigo: p.codigo_weg,
    modelo: p.modelo,
    potencia_w: p.specs?.potencia_w || 0,
    preco: p.precos_produtos?.[0]?.preco_venda || 0,
  }))

  const estruturasCatalogo = (estruturasCat || []).map((p: any) => ({
    id: p.id,
    codigo: p.codigo_weg,
    modelo: p.modelo,
    preco: p.precos_produtos?.[0]?.preco_venda || 0,
  }))

  const cabosCatalogo = (cabosCat || []).map((p: any) => ({
    id: p.id,
    codigo: p.codigo_weg,
    modelo: p.modelo,
    preco: p.precos_produtos?.[0]?.preco_venda || 0,
  }))

  if (!paramRow) {
    return (
      <main className="min-h-screen p-8 md:p-12">
        <div className="max-w-3xl mx-auto bg-coral/10 border border-coral/30 rounded-xl p-6">
          <h1 className="text-xl font-bold text-coral">Parâmetros não configurados</h1>
          <p className="text-white/70 text-sm mt-2">
            Rode a Migration <strong>049</strong> no Supabase pra criar os parâmetros
            do serviço de instalação de placas. Depois o admin edita valores em{' '}
            <code className="text-sol">/admin/precificacao/servicos</code>.
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
            <span className="text-[10px] uppercase tracking-wider font-bold px-2 py-0.5 rounded-full bg-coral/10 text-coral">
              🔧☀️ Serviço
            </span>
          </div>
          <h1 className="text-3xl md:text-4xl font-black text-white">
            Instalação de módulos em projeto
          </h1>
          <p className="text-white/60 mt-1 text-sm">
            {projeto.cliente_razao_social} · Cliente já tem placas + inversor. Spin instala.
          </p>
        </header>

        <ServicoInstalacaoForm
          projetoId={projeto.id}
          parametros={paramRow.parametros}
          entradasIniciais={itemExistente?.dados?.entradas || null}
          valorFinalInicial={itemExistente?.valor_estimado || null}
          placasCatalogo={placasCatalogo}
          estruturasCatalogo={estruturasCatalogo}
          cabosCatalogo={cabosCatalogo}
        />
      </div>
    </main>
  )
}
