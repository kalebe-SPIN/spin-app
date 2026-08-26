import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { EstacaoRecargaFluxoClient } from '@/components/EstacaoRecargaFluxoClient'

export const dynamic = 'force-dynamic'
export const revalidate = 0

/**
 * Passo VE Config — escolher wallbox WEG + acessórios + preço.
 * Kalebe pediu 2026-08-25: item ve_recarga do projeto acessa catálogo
 * WEG e precificação padrão SPIN pra criar proposta.
 */
export default async function VeRecargaPage({ params }: { params: { id: string } }) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: projeto, error } = await supabase
    .from('projetos')
    .select('*')
    .eq('id', params.id)
    .single()

  if (error || !projeto) notFound()

  // Wallboxes WEG (linha WEMOB categorizada como outro/ve_wallbox nas migrations 078/079)
  const { data: wallboxes } = await supabase
    .from('produtos')
    .select(`
      id, codigo_weg, modelo, descricao_curta, specs, disponivel_estoque, url_datasheet,
      precos_produtos!inner(preco_venda, vigente_de)
    `)
    .eq('subcategoria', 've_wallbox')
    .eq('ativo', true)
    .order('modelo', { ascending: true })

  // Acessórios opcionais (cabos, disjuntores, box) — hoje sem categoria própria pra VE,
  // então busca o catálogo geral de acessórios comuns (disjuntor CA, cabo, DPS) que
  // Kalebe pode adicionar avulso ao pedido.
  const { data: acessorios } = await supabase
    .from('produtos')
    .select(`
      id, codigo_weg, modelo, descricao_curta, categoria, subcategoria, specs,
      precos_produtos!inner(preco_venda, vigente_de)
    `)
    .in('categoria', ['disjuntor', 'dps', 'cabo'])
    .eq('ativo', true)
    .order('modelo', { ascending: true })
    .limit(80)

  // Parâmetros de margem — se existir tabela parametros_fotovoltaico, tenta pegar;
  // senão fallback pra 35% margem SPIN padrão.
  let margemPadraoPct = 35
  try {
    const { data: params } = await supabase
      .from('parametros_fotovoltaico')
      .select('chave, valor_numero')
      .in('chave', ['margem_contribuicao_perc'])
    const m = (params || []).find((p: any) => p.chave === 'margem_contribuicao_perc')
    if (m?.valor_numero) margemPadraoPct = Number(m.valor_numero)
  } catch { /* usa fallback */ }

  return (
    <main className="min-h-screen p-4 sm:p-6 md:p-8 lg:p-12">
      <div className="max-w-screen-2xl mx-auto">
        <header className="mb-8">
          <Link href={`/projetos/${projeto.id}`} className="text-xs text-white/40 hover:text-white/60 mb-2 inline-block">
            ← Voltar ao projeto
          </Link>
          <div className="flex items-center gap-3 mb-1">
            <span className="text-xs font-mono text-white/40">{projeto.codigo}</span>
            <span className="text-[10px] uppercase tracking-wider font-bold px-2 py-0.5 rounded-full bg-sol/10 text-sol">
              Estação de recarga VE
            </span>
          </div>
          <h1 className="text-2xl md:text-3xl lg:text-4xl font-black text-white">
            ⚡🚗 Composição da estação de recarga
          </h1>
          <p className="text-white/60 mt-1 text-sm">
            {projeto.cliente_razao_social} · Escolha o wallbox WEG e o sistema aplica a precificação SPIN
          </p>
        </header>

        <EstacaoRecargaFluxoClient
          projetoId={projeto.id}
          wallboxes={(wallboxes || []) as any}
          acessorios={(acessorios || []) as any}
          selecaoSalva={projeto.ve_recarga_selecionada}
          margemPadraoPct={margemPadraoPct}
        />
      </div>
    </main>
  )
}
