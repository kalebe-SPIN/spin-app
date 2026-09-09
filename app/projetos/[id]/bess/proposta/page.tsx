import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { paramsToRecord, getNum } from '@/lib/precificacao/calcular'
import { BessPropostaClient } from '@/components/bess/BessPropostaClient'

export const dynamic = 'force-dynamic'
export const revalidate = 0

/**
 * Proposta BESS puro — /projetos/[id]/bess/proposta
 *
 * Kalebe 2026-09-09: tela dedicada quando kit_selecionado.modo === 'bess_puro'
 * (kit sem placas solares). O /orcamento genérico redireciona pra cá porque
 * o motor solar espera placa+inversor+geração — inaplicável aqui.
 *
 * Estrutura de precificação (mesma fórmula do v1, adaptada):
 *   kit_bess_bruto  = Σ(bateria + controladora + medidor + caixas + opcionais)
 *   kit_com_fator   = kit_bess_bruto × 0,4182 (pass-through WEG)
 *   base_impostavel = Lista CA + frete + projeto/ART + instalação
 *   PV = (kit_com_fator × (1−imp%) + base_imp) / (1 − (marg% + com% + imp%)/100)
 *   nota_spin = PV − kit_com_fator
 *   imposto = nota_spin × imp%
 */
export default async function BessPropostaPage(props: { params: { id: string } }) {
  const projetoId = props.params.id
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: perfil } = await supabase
    .from('profiles').select('role').eq('id', user.id).maybeSingle()
  const ehAdmin = perfil?.role === 'admin'

  const { data: projeto } = await supabase
    .from('projetos').select('*').eq('id', projetoId).single()
  if (!projeto) notFound()

  const kit = projeto.kit_selecionado
  if (!kit || kit.modo !== 'bess_puro') {
    return (
      <main className="min-h-screen p-4 sm:p-6 md:p-8 lg:p-12">
        <div className="max-w-3xl mx-auto bg-coral/10 border border-coral/30 rounded-xl p-6">
          <h1 className="text-xl font-bold text-coral mb-2">⚠️ Kit BESS não configurado</h1>
          <p className="text-white/70 text-sm mb-4">
            Volta em <code className="text-sol">/kit</code> e monta o kit BESS puro
            (bateria + controladora + medidor) antes de gerar a proposta.
          </p>
          <Link href={`/projetos/${projetoId}/kit`}
            className="inline-block px-4 py-2 bg-sol text-noite font-bold text-sm rounded-lg">
            → Ir pro passo Kit
          </Link>
        </div>
      </main>
    )
  }

  const [{ data: configEmpresa }, { data: paramsRows }] = await Promise.all([
    supabase.from('configuracoes_empresa').select('*').eq('singleton', true).single(),
    supabase.from('parametros_precificacao')
      .select('chave, valor_numero, valor_json, unidade')
      .eq('ativo', true).is('vigente_ate', null),
  ])
  const params = paramsToRecord(paramsRows || [])

  // Precificação BESS pura — mesma fórmula do v1, kit_weg_bruto = soma BESS.
  // Kalebe 2026-09-09 v2: cada segmento é ARRAY (múltiplos itens).
  // Compat com formato antigo (single object): normaliza pra array.
  const toArr = (x: any): any[] => Array.isArray(x) ? x : (x?.id ? [x] : [])
  const bateriasArr      = toArr(kit.baterias      ?? kit.bateria)
  const controladorasArr = toArr(kit.controladoras ?? kit.controladora)
  const medidoresArr     = toArr(kit.medidores     ?? kit.medidor)
  const caixasArr        = toArr(kit.caixas_juncao)
  const opcionaisArr     = toArr(kit.opcionais)

  const somarLinha = (i: any) => (Number(i?.preco_venda) || 0) * (Number(i?.qtd) || 1)
  const somarArr = (arr: any[]) => arr.reduce((s, i) => s + somarLinha(i), 0)
  const kitBrutoBess =
    somarArr(bateriasArr) + somarArr(controladorasArr) + somarArr(medidoresArr)
    + somarArr(caixasArr) + somarArr(opcionaisArr)

  const FATOR_KIT_WEG = 0.4182
  const kitComFator = kitBrutoBess * FATOR_KIT_WEG

  // Serviços do projeto BESS puro.
  // - Frete: mesma faixa "até 16 placas" do solar (menor porte)
  // - Projeto/ART: MESMA LÓGICA do on-grid (Kalebe 2026-09-09) —
  //     R$ 400 fixo até 30 kW + R$ 30/kW acima disso, onde a "potência"
  //     do BESS é a soma da potência CA das controladoras/inversores
  //     (qtd × potência_kw). Reusa exatamente os mesmos parâmetros:
  //     projeto_valor_fixo_ate_30kwp e projeto_rs_por_kwp_acima_30kwp.
  // - Instalação:
  //     R$ 1.200 por inversor/controladora × qtd
  //   + R$ 200   por bateria             × qtd
  const freteBase = getNum(params, 'frete_ate_16_placas', 300)
  // Somas dos arrays — múltiplos itens por segmento
  const qtdInversor = controladorasArr.reduce((s, c) => s + (Number(c?.qtd) || 0), 0)
  const qtdBateria = bateriasArr.reduce((s, b) => s + (Number(b?.qtd) || 0), 0)
  // Potência CA total = Σ (qtd × potência) de cada controladora
  const potenciaCaTotalKw = controladorasArr.reduce((s, c) =>
    s + (Number(c?.qtd) || 0) * (Number(c?.potencia_kw) || 0), 0)
  const projetoValorAte30 = getNum(params, 'projeto_valor_fixo_ate_30kwp', 400)
  const projetoRsPorKwAcima30 = getNum(params, 'projeto_rs_por_kwp_acima_30kwp', 30)
  const projetoArt = potenciaCaTotalKw <= 30
    ? projetoValorAte30
    : projetoValorAte30 + (potenciaCaTotalKw - 30) * projetoRsPorKwAcima30
  const maoObraPorInversor = getNum(params, 'bess_mo_por_inversor', 1200)
  const maoObraPorBateria = getNum(params, 'bess_mo_por_bateria', 200)
  const instalacao = qtdInversor * maoObraPorInversor + qtdBateria * maoObraPorBateria
  const baseImpostavel = freteBase + projetoArt + instalacao

  const margemPct = getNum(params, 'margem_contribuicao_perc', 20)
  const comissaoPct = getNum(params, 'comissao_vendedor_perc', 5)
  const impostosPct = getNum(params, 'aliquota_simples_perc', 15)
  const somaPct = (margemPct + comissaoPct + impostosPct) / 100
  const pvTotal = (kitComFator * (1 - impostosPct / 100) + baseImpostavel) / (1 - somaPct)
  const margem = pvTotal * (margemPct / 100)
  const comissao = pvTotal * (comissaoPct / 100)
  const imposto = (pvTotal - kitComFator) * (impostosPct / 100)

  // Kalebe 2026-09-09: paridade com PDF solar — extras livres da proposta
  // (brinde, consultoria, treinamento etc) + desconto/acréscimo do admin.
  // Sinal do desconto_admin_pct/valor: positivo desconta, negativo acresce.
  const extras: Array<{ descricao: string; valor: number }> =
    Array.isArray(projeto.extras_proposta) ? projeto.extras_proposta : []
  const totalExtras = extras.reduce((s, e) => s + (Number(e.valor) || 0), 0)
  const pvBruto = pvTotal + totalExtras

  const descPct = Number(projeto.desconto_admin_pct) || 0
  const descVal = Number(projeto.desconto_admin_valor) || 0
  const deltaRaw = descPct !== 0
    ? pvBruto * (descPct / 100)
    : (descVal !== 0 ? descVal : 0)
  const delta = deltaRaw > pvBruto ? pvBruto : deltaRaw
  const pvFinal = pvBruto - delta
  const valorAjuste = Math.abs(delta)
  const sentidoAjuste: 'desconto' | 'acrescimo' | 'nenhum' =
    delta > 0 ? 'desconto' : delta < 0 ? 'acrescimo' : 'nenhum'

  const proposta = {
    kit_bess_bruto: kitBrutoBess,
    kit_com_fator: kitComFator,
    frete: freteBase,
    projeto_art: projetoArt,
    projeto_art_detalhe: {
      potencia_ca_total_kw: potenciaCaTotalKw,
      valor_fixo_ate_30kw: projetoValorAte30,
      rs_por_kw_acima_30: projetoRsPorKwAcima30,
      dentro_faixa_fixa: potenciaCaTotalKw <= 30,
    },
    instalacao,
    instalacao_detalhe: {
      qtd_inversor: qtdInversor,
      qtd_bateria: qtdBateria,
      valor_por_inversor: maoObraPorInversor,
      valor_por_bateria: maoObraPorBateria,
    },
    base_impostavel: baseImpostavel,
    margem, comissao_vendedor: comissao, impostos_simples: imposto,
    pv_total: pvTotal,
    extras,
    total_extras: totalExtras,
    pv_bruto: pvBruto,
    desconto_admin_pct: descPct,
    desconto_admin_valor: descVal,
    valor_ajuste: valorAjuste,
    sentido_ajuste: sentidoAjuste,
    pv_final: pvFinal,
    memoria: { fator_kit_weg_aplicado: FATOR_KIT_WEG, margem_pct: margemPct, comissao_pct: comissaoPct, impostos_pct: impostosPct },
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
            <span className="text-[10px] uppercase tracking-wider font-bold px-2 py-0.5 rounded-full bg-verde/10 text-verde">
              🔋 BESS puro
            </span>
          </div>
          <h1 className="text-3xl md:text-4xl font-black text-white">
            Proposta comercial — Kit BESS
          </h1>
          <p className="text-white/60 mt-1 text-sm">
            {projeto.cliente_razao_social} · Backup de energia sem geração solar
          </p>
        </header>

        <BessPropostaClient
          projeto={projeto}
          kit={kit}
          proposta={proposta}
          configEmpresa={configEmpresa}
          ehAdmin={ehAdmin}
        />
      </div>
    </main>
  )
}
