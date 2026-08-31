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

  const { data: perfil } = await supabase
    .from('profiles').select('role').eq('id', user.id).maybeSingle()
  const ehAdmin = perfil?.role === 'admin'

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

  // Kalebe 2026-08-27: quando o projeto é só ve_recarga (com config salva),
  // manda pro template VE dedicado (dark manifesto com fichas técnicas),
  // não pro genérico simplificado.
  const tiposUnicos = Array.from(new Set(tipos))
  const soVeRecarga = tiposUnicos.length === 1 && tiposUnicos[0] === 've_recarga'
  if (soVeRecarga && projeto.ve_recarga_selecionada?.equipamentos?.length) {
    redirect(`/projetos/${projetoId}/ve/proposta`)
  }

  if (soServicos && itensProjeto && itensProjeto.length > 0) {
    // Projeto so servico — renderiza fluxo simplificado
    const { data: configEmpresa } = await supabase
      .from('configuracoes_empresa')
      .select('*')
      .eq('singleton', true)
      .single()

    return (
      <main className="min-h-screen p-4 sm:p-6 md:p-8 lg:p-12">
        <div className="max-w-screen-2xl mx-auto">
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

  const modoComposicao: 'centralizado' | 'por_uc' = (projeto.modo_composicao === 'por_uc') ? 'por_uc' : 'centralizado'
  const kitsPorUcRaw: any[] = Array.isArray(projeto.kits_por_uc) ? projeto.kits_por_uc : []

  const kit = projeto.kit_selecionado
  const listaCa = projeto.lista_ca_confirmada

  // Validação: modo por_uc precisa de pelo menos 1 kit definido; modo
  // centralizado precisa de kit_selecionado + lista_ca_confirmada.
  const semKitCentralizado = modoComposicao === 'centralizado'
    && (!kit || !Array.isArray(listaCa) || listaCa.length === 0)
  const semKitPorUc = modoComposicao === 'por_uc'
    && (kitsPorUcRaw.length === 0 || !kitsPorUcRaw.some(k => k?.kit_selecionado))

  if (semKitCentralizado || semKitPorUc) {
    return (
      <main className="min-h-screen p-4 sm:p-6 md:p-8 lg:p-12">
        <div className="max-w-3xl mx-auto bg-sol/10 border border-sol/30 rounded-xl p-6">
          <h1 className="text-xl font-bold text-sol mb-2">⚠️ Dados incompletos</h1>
          <p className="text-white/70 text-sm mb-4">
            {modoComposicao === 'por_uc'
              ? 'Modo kit por UC: defina pelo menos 1 kit em /kit antes de gerar orçamento.'
              : 'Antes de gerar orçamento, complete:'}
          </p>
          <ul className="space-y-2 mb-4">
            {modoComposicao === 'centralizado' && !kit && (
              <li className="text-sm">
                <Link href={`/projetos/${projetoId}/kit`} className="text-sol hover:underline">
                  ✗ Passo 6 — Escolher kit
                </Link>
              </li>
            )}
            {modoComposicao === 'centralizado' && (!Array.isArray(listaCa) || listaCa.length === 0) && (
              <li className="text-sm">
                <Link href={`/projetos/${projetoId}/lista-ca`} className="text-sol hover:underline">
                  ✗ Passo 7 — Confirmar Lista CA
                </Link>
              </li>
            )}
            {modoComposicao === 'por_uc' && (
              <li className="text-sm">
                <Link href={`/projetos/${projetoId}/kit`} className="text-sol hover:underline">
                  → Ir pra /kit e configurar cada UC
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

  // Helper: calcula proposta pra um par (kit, listaCa, brutoTotal)
  function calcProposta(k: any, lca: any[], brutoTotal?: number) {
    return calcularProposta(
      {
        placa: {
          qtd: k.qtd_placas || 1,
          preco_venda_unitario: k.placa?.preco_venda || 0,
          modelo: k.placa?.modelo || '—',
          potencia_wp: k.placa?.potencia_wp || 0,
        },
        inversor: {
          qtd: k.qtd_inversores || 1,
          preco_venda_unitario: k.inversor?.preco_venda || 0,
          modelo: k.inversor?.modelo || '—',
          potencia_kw: k.inversor?.potencia_kw || 0,
        },
        itens_ca: (lca || []).map((i: any) => ({
          descricao: i.descricao,
          qtd: i.qtd || 0,
          preco_unitario: i.preco_unitario || 0,
          categoria: i.categoria,
        })),
        subtotal_kit_weg_bruto_override: brutoTotal || k.preco_total_kit_weg,
        potencia_kwp: k.potencia_cc_kwp || 0,
        distancia_km_extra: 0,
      },
      params,
    )
  }

  // Rota A — centralizado: 1 proposta única
  const proposta = modoComposicao === 'centralizado'
    ? calcProposta(kit, listaCa as any[], (projeto as any).kit_weg_bruto_total)
    : null

  // Rota B — por_uc: 1 proposta por UC + label
  const propostasPorUc = modoComposicao === 'por_uc'
    ? kitsPorUcRaw
        .filter(k => k?.kit_selecionado)
        .map((item: any) => ({
          uc_ref: item.uc_ref,
          label: item.uc_ref === 'principal' ? 'UC principal' : `UC ${item.uc_ref}`,
          endereco_label: item.endereco_label || null,
          endereco_proprio: !!item.endereco_proprio,
          kit: item.kit_selecionado,
          listaCa: (item.lista_ca_confirmada || []) as any[],
          complementosCc: item.lista_complementos_cc || null,
          proposta: calcProposta(item.kit_selecionado, item.lista_ca_confirmada || [], item.kit_weg_bruto_total),
        }))
    : null

  return (
    <main className="min-h-screen p-4 sm:p-6 md:p-8 lg:p-12">
      <div className="max-w-screen-2xl mx-auto">
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
          listaCa={(listaCa || []) as any}
          ehAdmin={ehAdmin}
          modoComposicao={modoComposicao}
          propostasPorUc={propostasPorUc as any}
        />
      </div>
    </main>
  )
}
