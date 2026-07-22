import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { calcularProposta, paramsToRecord } from '@/lib/precificacao/calcular'
import { OrcamentoClient } from '@/components/OrcamentoClient'
import { OrcamentoServicosClient } from '@/components/OrcamentoServicosClient'
import { apenasServicos, type TipoItem } from '@/lib/tipos-projeto'

export const dynamic = 'force-dynamic'
export const revalidate = 0

export default async function OrcamentoPage(props: { params: { id: string } }) {
  const projetoId = props.params.id
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: projeto, error } = await supabase
    .from('projetos')
    .select('*')
    .eq('id', projetoId)
    .single()

  if (error || !projeto) notFound()

  // Detecta se o projeto e SO servicos — nesse caso pula validacao FV
  // e renderiza versao simplificada do orcamento (sem kit / lista CA).
  const { data: itensProjeto } = await supabase
    .from('projeto_itens')
    .select('id, tipo, titulo, valor_estimado, dados')
    .eq('projeto_id', projetoId)
    .neq('status', 'removido')

  const tipos = (itensProjeto || []).map((i: any) => i.tipo as TipoItem)
  const soServicos = apenasServicos(tipos)

  if (soServicos && itensProjeto && itensProjeto.length > 0) {
    // Projeto so servico — renderiza fluxo simplificado
    const { data: configEmpresa } = await supabase
      .from('configuracoes_empresa')
      .select('*')
      .eq('singleton', true)
      .single()

    return (
      <main className="min-h-screen p-8 md:p-12">
        <div className="max-w-5xl mx-auto">
          <header className="mb-8">
            <Link href={`/projetos/${projetoId}`} className="text-xs text-white/40 hover:text-white/60 mb-2 inline-block">
              ← Voltar ao projeto
            </Link>
            <div className="flex items-center gap-3 mb-1">
              <span className="text-xs font-mono text-white/40">{projeto.codigo}</span>
              <span className="text-[10px] uppercase tracking-wider font-bold px-2 py-0.5 rounded-full bg-verde/10 text-verde">
                🛠️ Serviço
              </span>
            </div>
            <h1 className="text-3xl md:text-4xl font-black text-white">
              Orçamento e proposta comercial
            </h1>
            <p className="text-white/60 mt-1 text-sm">
              {projeto.cliente_razao_social} · Proposta consolidada dos módulos de serviço
            </p>
          </header>

          <OrcamentoServicosClient
            projeto={projeto}
            itens={itensProjeto}
            configEmpresa={configEmpresa}
          />
        </div>
      </main>
    )
  }

  const kit = projeto.kit_selecionado
  const listaCa = projeto.lista_ca_confirmada

  if (!kit || !Array.isArray(listaCa) || listaCa.length === 0) {
    return (
      <main className="min-h-screen p-8 md:p-12">
        <div className="max-w-3xl mx-auto bg-sol/10 border border-sol/30 rounded-xl p-6">
          <h1 className="text-xl font-bold text-sol mb-2">⚠️ Dados incompletos</h1>
          <p className="text-white/70 text-sm mb-4">Antes de gerar orçamento, complete:</p>
          <ul className="space-y-2 mb-4">
            {!kit && (
              <li className="text-sm">
                <Link href={`/projetos/${projetoId}/kit`} className="text-sol hover:underline">
                  ✗ Passo 6 — Escolher kit
                </Link>
              </li>
            )}
            {(!Array.isArray(listaCa) || listaCa.length === 0) && (
              <li className="text-sm">
                <Link href={`/projetos/${projetoId}/lista-ca`} className="text-sol hover:underline">
                  ✗ Passo 7 — Confirmar Lista CA
                </Link>
              </li>
            )}
          </ul>
          <Link
            href={`/projetos/${projetoId}`}
            className="inline-block px-4 py-2 bg-white/5 border border-white/10 rounded-lg text-sm"
          >
            ← Voltar ao projeto
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

  const { data: paramsRows } = await supabase
    .from('parametros_precificacao')
    .select('chave, valor_numero, valor_json, unidade')
    .eq('ativo', true)
    .is('vigente_ate', null)

  const params = paramsToRecord(paramsRows || [])

  const proposta = calcularProposta(
    {
      placa: {
        qtd: kit.qtd_placas || 1,
        preco_venda_unitario: kit.placa?.preco_venda || 0,
        modelo: kit.placa?.modelo || '—',
        potencia_wp: kit.placa?.potencia_wp || 0,
      },
      inversor: {
        qtd: kit.qtd_inversores || 1,
        preco_venda_unitario: kit.inversor?.preco_venda || 0,
        modelo: kit.inversor?.modelo || '—',
        potencia_kw: kit.inversor?.potencia_kw || 0,
      },
      itens_ca: listaCa.map((i: any) => ({
        descricao: i.descricao,
        qtd: i.qtd || 0,
        preco_unitario: i.preco_unitario || 0,
        categoria: i.categoria,
      })),
      potencia_kwp: kit.potencia_cc_kwp || 0,
      distancia_km_extra: 0,
    },
    params
  )

  return (
    <main className="min-h-screen p-8 md:p-12">
      <div className="max-w-5xl mx-auto">
        <header className="mb-8">
          <Link href={`/projetos/${projetoId}`} className="text-xs text-white/40 hover:text-white/60 mb-2 inline-block">
            ← Voltar ao projeto
          </Link>
          <div className="flex items-center gap-3 mb-1">
            <span className="text-xs font-mono text-white/40">{projeto.codigo}</span>
            <span className="text-[10px] uppercase tracking-wider font-bold px-2 py-0.5 rounded-full bg-sol/10 text-sol">
              Passo 8 de 8
            </span>
          </div>
          <h1 className="text-3xl md:text-4xl font-black text-white">
            Orçamento e proposta comercial
          </h1>
          <p className="text-white/60 mt-1 text-sm">
            {projeto.cliente_razao_social} · Preço calculado com parâmetros vigentes
          </p>
        </header>

        <OrcamentoClient
          projeto={projeto}
          proposta={proposta as any}
          configEmpresa={configEmpresa}
          listaCa={listaCa as any}
        />
      </div>
    </main>
  )
}
