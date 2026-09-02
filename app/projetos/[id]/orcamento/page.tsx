import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { calcularProposta, paramsToRecord } from '@/lib/precificacao/calcular'
import { OrcamentoClient } from '@/components/OrcamentoClient'
import { OrcamentoServicosClient } from '@/components/OrcamentoServicosClient'
import { apenasServicos, type TipoItem } from '@/lib/tipos-projeto'
import { precificarComplementosCC } from '@/lib/kit-auto/complementos-cc'

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

  // Kalebe 2026-09-01: fix "preços não puxam na proposta". Se o snapshot
  // do kit foi salvo com preço 0 (sem preço vigente na hora), re-consulta
  // preço vigente ATUAL dos IDs de placa/inversor. Assim, se o admin
  // cadastrou/importou preço DEPOIS do kit ser montado, a proposta usa.
  const kitsParaColetar: any[] = modoComposicao === 'por_uc'
    ? kitsPorUcRaw.map(k => k?.kit_selecionado).filter(Boolean)
    : [kit].filter(Boolean)
  const idsPrecoRefresh = new Set<string>()
  kitsParaColetar.forEach((k: any) => {
    if (k?.placa?.id && !(Number(k.placa.preco_venda) > 0)) idsPrecoRefresh.add(k.placa.id)
    if (k?.inversor?.id && !(Number(k.inversor.preco_venda) > 0)) idsPrecoRefresh.add(k.inversor.id)
  })
  const precoAtualMap = new Map<string, number>()
  if (idsPrecoRefresh.size > 0) {
    const { data: pRows } = await supabase
      .from('precos_produtos')
      .select('produto_id, preco_venda, vigente_de, vigente_ate')
      .in('produto_id', Array.from(idsPrecoRefresh))
      .gt('preco_venda', 0)
    const hoje = new Date().toISOString().slice(0, 10)
    // Agrupa por produto e escolhe vigente aberto > futuro > vencido mais recente
    const porProduto = new Map<string, any[]>()
    ;(pRows || []).forEach((r: any) => {
      const arr = porProduto.get(r.produto_id) || []
      arr.push(r); porProduto.set(r.produto_id, arr)
    })
    porProduto.forEach((arr, pid) => {
      const abertos = arr.filter(x => !x.vigente_ate)
      const futuros = arr.filter(x => x.vigente_ate && x.vigente_ate >= hoje)
      const vencidos = arr.filter(x => x.vigente_ate && x.vigente_ate < hoje)
      const pick = (a: any[]) => a.slice().sort((x, y) => (x.vigente_de < y.vigente_de ? 1 : -1))[0]
      const winner = pick(abertos) || pick(futuros) || pick(vencidos)
      if (winner) precoAtualMap.set(pid, winner.preco_venda)
    })
  }
  function precoOuFallback(item: any): number {
    const s = Number(item?.preco_venda) || 0
    if (s > 0) return s
    return item?.id ? (precoAtualMap.get(item.id) || 0) : 0
  }

  // Kalebe 2026-09-02: SEMPRE re-roda precificarComplementosCC on-demand
  // pra refletir o catálogo atual. Snapshots antigos vinham zerados (qtd=0,
  // "não cadastrado") mesmo com produtos existindo no /admin/catalogo —
  // porque foram salvos antes dos fixes recentes. Agora a página garante
  // resultado fresco em todo carregamento.
  const padraoEfetivo: any = projeto.padrao_entrada || {}
  const telhadoSecoesData: any[] = Array.isArray((projeto as any).telhado_secoes)
    ? (projeto as any).telhado_secoes : []
  const ligacaoCliente = padraoEfetivo?.tipo_ligacao || 'monofasico'

  async function regerarComplementos(k: any) {
    if (!k?.qtd_placas) return null
    const invs = k.inversores?.length > 0
      ? k.inversores
      : (k.inversor
          ? [{ id: k.inversor.id, modelo: k.inversor.modelo, potencia_kw: k.inversor.potencia_kw, qtd: k.qtd_inversores || 1 }]
          : [])
    try {
      const r = await precificarComplementosCC(supabase, {
        qtd_placas: k.qtd_placas,
        tipo_telhado: telhadoSecoesData[0]?.tipo_cobertura || null,
        distancia_string_qgbt_m: Number(padraoEfetivo?.distancia_string_qgbt_m) || 0,
        inversores: invs,
        tipo_ligacao_cliente: ligacaoCliente,
      })
      return { itens: r.itens, total: r.total, avisos: r.avisos, gerado_em: new Date().toISOString() }
    } catch (e: any) {
      console.error('[orcamento/page] regerarComplementos', e?.message)
      return null
    }
  }

  const complementosCentralizado = modoComposicao === 'centralizado'
    ? await regerarComplementos(kit) : null
  const complementosPorUcMap = new Map<string, any>()
  if (modoComposicao === 'por_uc') {
    for (const item of kitsPorUcRaw) {
      if (item?.kit_selecionado) {
        const c = await regerarComplementos(item.kit_selecionado)
        if (c) complementosPorUcMap.set(String(item.uc_ref), c)
      }
    }
  }

  // Recalcula kit_weg_bruto_total on-demand pra o calcProposta usar valor
  // sempre coerente com os complementos regerados.
  function brutoTotalFresh(k: any, complementos: any): number | undefined {
    if (!complementos) return undefined
    const placaSub = (Number(k.placa?.preco_venda) || 0) * (k.qtd_placas || 0)
    const invsList = k.inversores?.length > 0 ? k.inversores
      : (k.inversor ? [{ ...k.inversor, qtd: k.qtd_inversores || 1 }] : [])
    const invSub = invsList.reduce((s: number, i: any) => s + (Number(i.preco_venda) || 0) * (Number(i.qtd) || 1), 0)
    return placaSub + invSub + (complementos.total || 0)
  }

  // Helper: calcula proposta pra um par (kit, listaCa, brutoTotal)
  function calcProposta(k: any, lca: any[], brutoTotal?: number) {
    return calcularProposta(
      {
        placa: {
          qtd: k.qtd_placas || 1,
          preco_venda_unitario: precoOuFallback(k.placa),
          modelo: k.placa?.modelo || '—',
          potencia_wp: k.placa?.potencia_wp || 0,
        },
        inversor: {
          qtd: k.qtd_inversores || 1,
          preco_venda_unitario: precoOuFallback(k.inversor),
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
    ? calcProposta(
        kit,
        listaCa as any[],
        brutoTotalFresh(kit, complementosCentralizado) ?? (projeto as any).kit_weg_bruto_total,
      )
    : null

  // Rota B — por_uc: 1 proposta por UC + label
  const propostasPorUc = modoComposicao === 'por_uc'
    ? kitsPorUcRaw
        .filter(k => k?.kit_selecionado)
        .map((item: any) => {
          const cFresh = complementosPorUcMap.get(String(item.uc_ref)) || null
          return {
            uc_ref: item.uc_ref,
            label: item.uc_ref === 'principal' ? 'UC principal' : `UC ${item.uc_ref}`,
            endereco_label: item.endereco_label || null,
            endereco_proprio: !!item.endereco_proprio,
            kit: item.kit_selecionado,
            listaCa: (item.lista_ca_confirmada || []) as any[],
            complementosCc: cFresh || item.lista_complementos_cc || null,
            proposta: calcProposta(
              item.kit_selecionado,
              item.lista_ca_confirmada || [],
              brutoTotalFresh(item.kit_selecionado, cFresh) ?? item.kit_weg_bruto_total,
            ),
          }
        })
    : null

  // Kalebe 2026-09-02: injeta os complementos frescos no projeto que vai
  // pro Client, sobrescrevendo o snapshot antigo. Assim OrcamentoClient
  // renderiza qtd/preço atualizados sem exigir clique em "Regerar".
  const projetoComComplementos = {
    ...projeto,
    lista_complementos_cc: complementosCentralizado || (projeto as any).lista_complementos_cc,
    kits_por_uc: modoComposicao === 'por_uc'
      ? kitsPorUcRaw.map((item: any) => ({
          ...item,
          lista_complementos_cc: complementosPorUcMap.get(String(item.uc_ref)) || item.lista_complementos_cc,
        }))
      : (projeto as any).kits_por_uc,
  }

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
          projeto={projetoComComplementos}
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
