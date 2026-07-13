import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { ComparativoFinanceiro } from '@/components/proposta/blocos/ComparativoFinanceiro'
import { calcularComparativo, calcularParcelaFinanciamento } from '@/lib/proposta/calculos-comparativo'
import type { DadosProposta } from '@/lib/proposta/tipos'

export const dynamic = 'force-dynamic'
export const revalidate = 0

export default async function PreviewPropostaPage({ params, searchParams }: {
  params: { id: string }
  searchParams: { versao?: string; segmento?: string }
}) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: projeto } = await supabase
    .from('projetos')
    .select('*')
    .eq('id', params.id)
    .single()

  if (!projeto) notFound()

  // Parâmetros da proposta (CELESC, CDI, etc)
  const { data: paramsRows } = await supabase
    .from('parametros_proposta')
    .select('chave, valor_numero')
  const parametros: Record<string, number> = {}
  for (const p of paramsRows || []) {
    if (p.valor_numero !== null) parametros[p.chave] = Number(p.valor_numero)
  }

  // Config empresa
  const { data: configEmpresa } = await supabase
    .from('configuracoes_empresa')
    .select('*')
    .eq('singleton', true)
    .single()

  // Dados derivados
  const kit = projeto.kit_selecionado || {}
  const potenciaKwp = Number(kit.potencia_cc_kwp || projeto.qtd_placas_estimada * (projeto.potencia_wp_placa_estimada || 605) / 1000) || 5
  const hsp = Number(projeto.hsp_estimado || 4.5)
  const geracaoEstimadaKwhMes = potenciaKwp * hsp * 30 * 0.8
  const geracaoEstimadaKwhAno = geracaoEstimadaKwhMes * 12
  const consumoMedioKwhMes = Number(projeto.analise_fatura?.consumo_medio_kwh || projeto.geracao_media_alvo_kwh || geracaoEstimadaKwhMes)

  const segmento = (searchParams.segmento || projeto.segmento_cliente || 'residencial') as 'residencial' | 'comercial' | 'industrial'
  const versao = (searchParams.versao || 'refinada') as 'simplificada' | 'refinada'

  const valorTotal = Number(projeto.orcamento_final?.valor_total || potenciaKwp * 4200) // fallback R$/kWp médio
  const parcelaFinanciada60x = calcularParcelaFinanciamento(
    valorTotal,
    parametros.taxa_juros_financiamento_aa || 22,
    parametros.prazo_maximo_meses || 60,
  )

  const tipoLigacao = (projeto.padrao_entrada?.tipo_ligacao || 'monofasico') as any

  const dadosProposta: DadosProposta = {
    projeto,
    segmento,
    versao,
    itens: [],
    parametros,
    configEmpresa,
    consumoMedioKwhMes,
    geracaoEstimadaKwhMes,
    geracaoEstimadaKwhAno,
    potenciaKwp,
    qtdPlacas: Number(kit.qtd_placas || projeto.qtd_placas_estimada || 8),
    qtdInversores: Number(kit.qtd_inversores || 1),
    tipoLigacao,
    valorTotal,
    parcelaFinanciada60x,
  }

  const comparativo = calcularComparativo(dadosProposta)

  return (
    <main className="min-h-screen p-4 md:p-6 bg-noite">
      <div className="max-w-4xl mx-auto">
        <header className="mb-4 flex items-center justify-between gap-3 flex-wrap">
          <div>
            <Link href={`/projetos/${projeto.id}`} className="text-xs text-white/40 hover:text-white/60 mb-2 inline-block">
              ← Voltar ao projeto
            </Link>
            <h1 className="text-xl font-black text-white">Preview: Comparativo Financeiro</h1>
            <p className="text-xs text-white/60 mt-0.5">
              Bloco estrela da proposta — {projeto.cliente_razao_social}
            </p>
          </div>
          <div className="flex gap-2">
            <SegmentoBtn projetoId={projeto.id} atual={segmento} versao={versao} valor="residencial" label="Residencial" />
            <SegmentoBtn projetoId={projeto.id} atual={segmento} versao={versao} valor="comercial" label="Comercial" />
            <SegmentoBtn projetoId={projeto.id} atual={segmento} versao={versao} valor="industrial" label="Industrial" />
          </div>
        </header>

        {/* Debug info */}
        <details className="mb-4 p-3 bg-white/[0.03] border border-white/10 rounded text-xs text-white/60">
          <summary className="cursor-pointer text-white/80 font-bold">
            🔍 Ver parâmetros de cálculo
          </summary>
          <div className="mt-3 grid grid-cols-2 md:grid-cols-4 gap-2">
            <Metric label="Segmento" valor={segmento} />
            <Metric label="Potência kWp" valor={potenciaKwp.toFixed(2)} />
            <Metric label="Consumo médio" valor={`${Math.round(consumoMedioKwhMes)} kWh/mês`} />
            <Metric label="Geração estimada" valor={`${Math.round(geracaoEstimadaKwhMes)} kWh/mês`} />
            <Metric label="Valor total" valor={valorTotal.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })} />
            <Metric label="Parcela 60x" valor={parcelaFinanciada60x.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })} />
            <Metric label="Tarifa base" valor={`R$ ${(segmento === 'residencial' ? parametros.celesc_tarifa_b1_kwh : parametros.celesc_tarifa_b3_kwh || 0.85).toFixed(2)}/kWh`} />
            <Metric label="Fio B (Lei 14.300)" valor={`${((parametros[`lei_14300_perc_${new Date().getFullYear()}`] || 0.45) * 100).toFixed(0)}%`} />
          </div>
        </details>

        {/* Render do bloco */}
        <div className="bg-white rounded-xl shadow-2xl overflow-hidden">
          <ComparativoFinanceiro dados={comparativo} />
        </div>

        <p className="mt-4 text-center text-[10px] text-white/40">
          Este é o preview do bloco. No PDF final entrará junto com Capa, Resumo Executivo, Equipamentos etc.
        </p>
      </div>
    </main>
  )
}

function SegmentoBtn({ projetoId, atual, valor, versao, label }: {
  projetoId: string; atual: string; valor: string; versao: string; label: string
}) {
  const ativo = atual === valor
  return (
    <Link
      href={`/projetos/${projetoId}/proposta/preview?versao=${versao}&segmento=${valor}`}
      className={`text-xs px-3 py-1.5 rounded border ${
        ativo
          ? 'bg-sol/20 border-sol/40 text-sol font-bold'
          : 'bg-white/5 border-white/10 text-white/60 hover:bg-white/10'
      }`}
    >
      {label}
    </Link>
  )
}

function Metric({ label, valor }: { label: string; valor: string }) {
  return (
    <div className="p-2 bg-noite/40 border border-white/5 rounded">
      <p className="text-[9px] uppercase text-white/40">{label}</p>
      <p className="text-xs text-white font-bold">{valor}</p>
    </div>
  )
}
