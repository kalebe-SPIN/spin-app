import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { paramsToRecord } from '@/lib/precificacao/calcular'
import { precoVigente, type ProdutoCatalogoVD } from '@/lib/venda-direta/preco'
import { dadosVazios, type ItemDadosVendaDireta } from '@/lib/venda-direta/tipos'
import { VendaDiretaClient } from '@/components/venda-direta/VendaDiretaClient'

export const dynamic = 'force-dynamic'

/**
 * /projetos/[id]/venda-direta — equipamentos + frete + PDF da venda direta
 * (Kalebe 2026-09-29). O /orcamento redireciona pra cá quando o único item
 * do projeto é 'venda_equipamentos'.
 */
export default async function VendaDiretaProjetoPage({ params }: { params: { id: string } }) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const [{ data: perfil }, { data: projeto }, { data: item }] = await Promise.all([
    supabase.from('profiles').select('role').eq('id', user.id).maybeSingle(),
    supabase.from('projetos').select('*').eq('id', params.id).maybeSingle(),
    supabase.from('projeto_itens').select('id, dados').eq('projeto_id', params.id)
      .eq('tipo', 'venda_equipamentos').neq('status', 'removido').maybeSingle(),
  ])
  if (!projeto) notFound()
  const ehAdmin = perfil?.role === 'admin'

  if (!item) {
    return (
      <main className="min-h-screen p-6 md:p-10">
        <div className="max-w-2xl mx-auto bg-white/[0.03] border border-white/10 rounded-xl p-6">
          <p className="text-white">Este projeto não é uma venda direta de equipamentos.</p>
          <Link href={`/projetos/${params.id}`} className="text-sm text-sol hover:underline mt-3 inline-block">← Voltar ao projeto</Link>
        </div>
      </main>
    )
  }

  const [{ data: produtos }, { data: paramsRows }, { data: configEmpresa }] = await Promise.all([
    // Kalebe 2026-09-29: TODO o catálogo ativo (inclusive sem preço na planilha,
    // ex.: WEMOB) — limit explícito pra não cortar em 1000 linhas
    supabase
      .from('produtos')
      .select('id, modelo, fabricante, descricao_curta, categoria, subcategoria, specs, precos_produtos(preco_venda, vigente_de, vigente_ate)')
      .eq('ativo', true)
      .neq('categoria', 'frete')
      .order('modelo')
      .limit(5000),
    supabase
      .from('parametros_precificacao')
      .select('chave, valor_numero, valor_json, unidade')
      .eq('ativo', true)
      .is('vigente_ate', null),
    supabase.from('configuracoes_empresa').select('*').eq('singleton', true).maybeSingle(),
  ])

  const catalogo: ProdutoCatalogoVD[] = (produtos || []).map((p: any) => {
    const preco = precoVigente(p.precos_produtos) || 0
    return {
      id: p.id,
      modelo: p.modelo,
      fabricante: p.fabricante || null,
      descricao: p.descricao_curta || null,
      categoria: p.categoria || null,
      subcategoria: p.subcategoria || null,
      detalhe: typeof p.specs?.descricao === 'string' ? p.specs.descricao : null,
      preco_tabela: preco,
      sem_preco: preco <= 0,
    }
  })

  const base = dadosVazios()
  const salvo = (item.dados || {}) as Partial<ItemDadosVendaDireta>
  const dadosIniciais: ItemDadosVendaDireta = {
    nf: { ...base.nf, ...(salvo.nf || {}), endereco: { ...base.nf.endereco, ...(salvo.nf?.endereco || {}) } },
    entrega: {
      ...base.entrega, ...(salvo.entrega || {}),
      endereco: { ...base.entrega.endereco, ...(salvo.entrega?.endereco || {}) },
    },
    itens: salvo.itens || [],
    frete: Number(salvo.frete) || 0,
    cupom: salvo.cupom || null,
    url_pdf: salvo.url_pdf || null,
  }

  return (
    <main className="min-h-screen p-4 sm:p-6 md:p-8 lg:p-12">
      <div className="max-w-screen-xl mx-auto">
        <header className="mb-8">
          <div className="flex gap-4 text-xs mb-2">
            <Link href={`/projetos/${projeto.id}`} className="text-white/40 hover:text-white/60">← Projeto</Link>
            {ehAdmin && <Link href="/venda-direta" className="text-white/40 hover:text-white/60">Todas as vendas diretas</Link>}
            {ehAdmin && <Link href="/admin/precificacao/venda-direta" className="text-sol/80 hover:text-sol">⚙️ Estrutura de preço e cupons</Link>}
          </div>
          <div className="flex items-center gap-3 mb-1">
            <span className="text-xs font-mono text-white/40">{projeto.codigo}</span>
            <span className="text-[10px] uppercase tracking-wider font-bold px-2 py-0.5 rounded-full bg-weg-azul/10 text-weg-azul">
              📦 Venda direta
            </span>
          </div>
          <h1 className="text-3xl md:text-4xl font-black text-white">Venda direta de equipamentos</h1>
          <p className="text-white/60 mt-1 text-sm">
            Sem projeto, instalação ou lista CA. O PDF sai com o termo de isenção de responsabilidade técnica.
          </p>
        </header>

        <VendaDiretaClient
          projeto={projeto}
          dadosIniciais={dadosIniciais}
          catalogo={catalogo}
          params={paramsToRecord(paramsRows || [])}
          configEmpresa={configEmpresa}
          ehAdmin={ehAdmin}
        />
      </div>
    </main>
  )
}
