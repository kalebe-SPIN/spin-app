import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { ServicoGenericoForm } from '@/components/ServicoGenericoForm'
import { getInfoTipo, type TipoItem } from '@/lib/tipos-projeto'

export const dynamic = 'force-dynamic'
export const revalidate = 0

/**
 * Rota GENÉRICA de escopo de serviço.
 * Aceita qualquer tipo_item_projeto via query string ?tipo=srv_alvenaria.
 * Serve pros tipos que NÃO têm rota específica (alvenaria, serralheria, carpintaria,
 * aluguel_maquinas, aluguel_equipamentos, outros, laudo, análise, elétrica predial).
 * Tipos com rota dedicada (limpeza, retirada, instalação, revisão) continuam nas suas.
 *
 * URL exemplo: /projetos/123/servico?tipo=srv_alvenaria
 */
export default async function ServicoGenericoPage({
  params,
  searchParams,
}: {
  params: { id: string }
  searchParams: { tipo?: string; item?: string }
}) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // Aceita ?item=<id> (padrão do ItensPropostaCard) ou ?tipo=<enum> (chamada direta)
  // Se veio ?item=, busca o tipo pelo id. Se só ?tipo=, usa ele direto.
  let tipoParam: TipoItem | undefined = searchParams.tipo as TipoItem | undefined
  let itemExistente: { dados: any; valor_estimado: number | null } | null = null

  if (searchParams.item) {
    const { data } = await supabase
      .from('projeto_itens')
      .select('tipo, dados, valor_estimado')
      .eq('id', searchParams.item)
      .eq('projeto_id', params.id)
      .maybeSingle()
    if (data) {
      tipoParam = data.tipo as TipoItem
      itemExistente = { dados: data.dados, valor_estimado: data.valor_estimado }
    }
  }

  const info = tipoParam ? getInfoTipo(tipoParam) : undefined

  if (!tipoParam || !info) {
    return (
      <main className="min-h-screen p-8 md:p-12">
        <div className="max-w-3xl mx-auto bg-coral/10 border border-coral/30 rounded-xl p-6">
          <h1 className="text-xl font-bold text-coral">Item não encontrado</h1>
          <p className="text-white/70 text-sm mt-2">
            Não foi possível identificar o tipo de item a editar. Volte à página do projeto e
            clique no item.
          </p>
          <Link
            href={`/projetos/${params.id}`}
            className="inline-block mt-4 text-sm text-sol hover:text-sol/80"
          >
            ← Voltar ao projeto
          </Link>
        </div>
      </main>
    )
  }

  const { data: projeto, error } = await supabase
    .from('projetos')
    .select('id, codigo, cliente_razao_social')
    .eq('id', params.id)
    .single()

  if (error || !projeto) notFound()

  // Descobre role do usuário — margem/comissão/impostos só admin/gestor edita
  const { data: perfil } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  const podeVerMargem = perfil?.role === 'admin'

  // Se não veio via ?item=, tenta buscar item existente do mesmo tipo
  if (!itemExistente) {
    const { data } = await supabase
      .from('projeto_itens')
      .select('dados, valor_estimado')
      .eq('projeto_id', params.id)
      .eq('tipo', tipoParam)
      .neq('status', 'removido')
      .maybeSingle()
    itemExistente = data
  }

  const dadosIniciais = itemExistente?.dados
    ? {
        descricao: itemExistente.dados.descricao,
        subitens: itemExistente.dados.quantidades,
        observacoes: itemExistente.dados.observacoes,
        valor_cliente: itemExistente.dados.valor_cliente ?? itemExistente.valor_estimado,
        detalhamento_interno: itemExistente.dados.detalhamento_interno,
      }
    : undefined

  return (
    <main className="min-h-screen p-8 md:p-12">
      <div className="max-w-4xl mx-auto">
        <header className="mb-8">
          <Link
            href={`/projetos/${projeto.id}`}
            className="text-xs text-white/40 hover:text-white/60 mb-2 inline-block"
          >
            ← Voltar ao projeto
          </Link>
          <div className="flex items-center gap-3 mb-1">
            <span className="text-xs font-mono text-white/40">{projeto.codigo}</span>
            <span className="text-[10px] uppercase tracking-wider font-bold px-2 py-0.5 rounded-full bg-coral/10 text-coral">
              {info.emoji} {info.grupo}
            </span>
          </div>
          <h1 className="text-3xl md:text-4xl font-black text-white">{info.label}</h1>
          <p className="text-white/60 mt-1 text-sm">
            {projeto.cliente_razao_social} · {info.descricao}
          </p>
        </header>

        <ServicoGenericoForm
          projetoId={projeto.id}
          tipo={tipoParam}
          dadosIniciais={dadosIniciais}
          podeVerMargem={podeVerMargem}
        />
      </div>
    </main>
  )
}
