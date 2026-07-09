import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { KitFluxoClient } from '@/components/KitFluxoClient'

export const dynamic = 'force-dynamic'
export const revalidate = 0

export default async function KitPage({ params }: { params: { id: string } }) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: projeto, error } = await supabase
    .from('projetos')
    .select('*')
    .eq('id', params.id)
    .single()

  if (error || !projeto) notFound()

  // Consumo consolidado: UC principal + soma das beneficiárias
  const consumoPrincipal =
    projeto.analise_fatura?.consumo_medio_12m_kwh ||
    projeto.analise_fatura?.consumo_mes_kwh ||
    projeto.analise_fatura?.consumo_medio_kwh ||
    0
  const consumoBeneficiarias = (projeto.beneficiarias || []).reduce(
    (sum: number, b: any) => sum + (b.analise?.consumo_medio_12m_kwh || b.analise?.consumo_mes_kwh || 0),
    0
  )
  const consumoMedio = consumoPrincipal + consumoBeneficiarias
  const horasSol = 4.5
  const perdas = 0.20
  const potCcAlvoAuto = consumoMedio > 0
    ? consumoMedio / (30 * horasSol * (1 - perdas))
    : 5.0

  // Padrão CELESC do cliente
  const padrao = projeto.padrao_entrada
  if (!padrao || !padrao.tipo_ligacao) {
    return (
      <main className="min-h-screen p-8 md:p-12">
        <div className="max-w-3xl mx-auto bg-coral/10 border border-coral/30 rounded-xl p-6">
          <h1 className="text-xl font-bold text-coral mb-2">⚠️ Padrão CELESC não preenchido</h1>
          <p className="text-white/70 text-sm mb-4">
            Precisamos saber o tipo de ligação (mono/bi/tri) e amperagem do padrão de entrada
            do cliente pra sugerir kits compatíveis com a rede CELESC dele.
          </p>
          <Link
            href={`/projetos/${projeto.id}/padrao`}
            className="inline-block px-4 py-2 bg-sol text-noite font-bold text-sm rounded-lg"
          >
            → Ir para Passo 4 (Padrão CELESC)
          </Link>
        </div>
      </main>
    )
  }

  // Buscar todas as placas ativas do catálogo
  const { data: placas } = await supabase
    .from('produtos')
    .select(`
      id, codigo_weg, modelo, fabricante, descricao_curta, specs, disponivel_estoque, url_datasheet,
      precos_produtos!inner(preco_venda, vigente_de)
    `)
    .eq('categoria', 'placa')
    .eq('ativo', true)
    .order('specs->potencia_wp', { ascending: false })

  // Buscar todos os inversores disponíveis
  const { data: inversores } = await supabase
    .from('produtos')
    .select(`
      id, codigo_weg, modelo, subcategoria, descricao_curta, specs, disponivel_estoque,
      precos_produtos!inner(preco_venda, vigente_de)
    `)
    .eq('categoria', 'inversor')
    .eq('ativo', true)

  return (
    <main className="min-h-screen p-8 md:p-12">
      <div className="max-w-6xl mx-auto">
        <header className="mb-8">
          <Link href={`/projetos/${projeto.id}`} className="text-xs text-white/40 hover:text-white/60 mb-2 inline-block">
            ← Voltar ao projeto
          </Link>
          <div className="flex items-center gap-3 mb-1">
            <span className="text-xs font-mono text-white/40">{projeto.codigo}</span>
            <span className="text-[10px] uppercase tracking-wider font-bold px-2 py-0.5 rounded-full bg-sol/10 text-sol">
              Passo 6 de 8
            </span>
          </div>
          <h1 className="text-3xl md:text-4xl font-black text-white">
            Composição automática do kit
          </h1>
          <p className="text-white/60 mt-1 text-sm">
            {projeto.cliente_razao_social} · Escolha a placa e o sistema sugere kits compatíveis
          </p>
        </header>

        <KitFluxoClient
          projetoId={projeto.id}
          placas={(placas || []) as any}
          inversores={(inversores || []) as any}
          padrao={padrao}
          potCcAlvoAuto={potCcAlvoAuto}
          consumoMedio={consumoMedio}
          kitSalvo={projeto.kit_selecionado}
        />
      </div>
    </main>
  )
}
