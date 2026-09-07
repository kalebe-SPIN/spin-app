import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { CONFIG as CRED, acelerador as calcularAcelerador } from '@/lib/proposta-credenciamento'
import { TAXA_BASE_POR_LINHA, ORIGEM_MULT, type Linha, type OrigemLead } from '@/lib/precificacao/calcular-v2'

export const dynamic = 'force-dynamic'
export const revalidate = 0

type RepresentanteRow = {
  id: string
  nome_completo: string
  email: string | null
  created_at: string
  nivel_representante: string | null
  mrr_carteira_atual: number
  volume_mes: number
  qtd_vendas_mes: number
  comissao_estimada_mes: number
  acelerador_mult: number
}

const fmt = (v: number) => v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const fmtInt = (v: number) => Math.round(v).toLocaleString('pt-BR')

function inferirLinha(potenciaKwp: number): Linha {
  if (potenciaKwp <= 20) return 'residencial'
  if (potenciaKwp <= 200) return 'comercial'
  return 'usina'
}

export default async function AdminRepresentantesPage() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const { data: perfil } = await supabase
    .from('profiles').select('role').eq('id', user.id).maybeSingle()
  if (perfil?.role !== 'admin') redirect('/dashboard')

  // 1) Representantes ativos
  const { data: reps } = await supabase
    .from('profiles')
    .select('id, nome_completo, email, created_at, nivel_representante, mrr_carteira_atual, credenciados_formados, fechador_mes_count, ativo, role')
    .in('role', ['representante', 'vendedor_servicos', 'consultor'])
    .eq('ativo', true)
    .order('nome_completo')

  // 2) Vendas do mês corrente por representante
  const inicioMes = new Date()
  inicioMes.setDate(1); inicioMes.setHours(0, 0, 0, 0)
  const { data: vendasMes } = await supabase
    .from('projetos')
    .select('id, consultor_id, orcamento_final, kit_selecionado, origem_lead, tipos_projeto, ve_recarga_selecionada')
    .eq('status', 'vendido')
    .gte('created_at', inicioMes.toISOString())

  // 3) Agrega por representante
  const porRep = new Map<string, { volume: number; qtd: number; comissao: number }>()
  for (const p of (vendasMes || []) as any[]) {
    const uid = p.consultor_id
    if (!uid) continue
    const valor = Number(p.orcamento_final?.pv_total) || 0
    const potencia = Number(p.kit_selecionado?.potencia_cc_kwp) || 0
    const tipos: string[] = Array.isArray(p.tipos_projeto) ? p.tipos_projeto : []
    const linha: Linha = tipos.includes('ve_recarga') || p.ve_recarga_selecionada
      ? 'carregador'
      : inferirLinha(potencia)
    const taxa = TAXA_BASE_POR_LINHA[linha]?.sem ?? 0.05
    const origem = (p.origem_lead as OrigemLead) || 'lead_spin'
    const atual = porRep.get(uid) || { volume: 0, qtd: 0, comissao: 0 }
    atual.volume += valor
    atual.qtd += 1
    atual.comissao += valor * taxa * (ORIGEM_MULT[origem] ?? 1)
    porRep.set(uid, atual)
  }

  const linhas: RepresentanteRow[] = (reps || []).map((r: any) => {
    const dados = porRep.get(r.id) || { volume: 0, qtd: 0, comissao: 0 }
    const acel = calcularAcelerador(dados.volume)
    return {
      id: r.id,
      nome_completo: r.nome_completo || 'Sem nome',
      email: r.email,
      created_at: r.created_at,
      nivel_representante: r.nivel_representante,
      mrr_carteira_atual: Number(r.mrr_carteira_atual) || 0,
      volume_mes: dados.volume,
      qtd_vendas_mes: dados.qtd,
      comissao_estimada_mes: dados.comissao * acel,
      acelerador_mult: acel,
    }
  }).sort((a, b) => b.volume_mes - a.volume_mes)

  // 4) Métricas agregadas
  const totalRepresentantes = linhas.length
  const volumeTotalMes = linhas.reduce((s, l) => s + l.volume_mes, 0)
  const comissaoTotalMes = linhas.reduce((s, l) => s + l.comissao_estimada_mes, 0)
  const mrrTotal = linhas.reduce((s, l) => s + l.mrr_carteira_atual, 0)
  const qtdVendasMes = linhas.reduce((s, l) => s + l.qtd_vendas_mes, 0)

  // 5) Alertas fiscais (RBT12 vs faixa Simples)
  const { data: parRbt } = await supabase
    .from('parametros_precificacao')
    .select('valor_numero')
    .eq('chave', 'rbt12_atual')
    .eq('ativo', true).is('vigente_ate', null).maybeSingle()
  const { data: parAnexo } = await supabase
    .from('parametros_precificacao')
    .select('valor_numero')
    .eq('chave', 'simples_anexo_atual')
    .eq('ativo', true).is('vigente_ate', null).maybeSingle()

  const rbt12 = Number(parRbt?.valor_numero) || 0
  const anexoNum = Number(parAnexo?.valor_numero) || 3
  const anexo: 'III' | 'V' = anexoNum === 5 ? 'V' : 'III'

  const { data: faixas } = await supabase
    .from('aliquotas_simples')
    .select('*')
    .eq('anexo', anexo)
    .eq('ativo', true)
    .order('faixa')

  const faixaAtual = (faixas || []).find(
    (f: any) => rbt12 >= Number(f.rbt12_min) && rbt12 <= Number(f.rbt12_max)
  )
  const proximaFaixa = faixaAtual
    ? (faixas || []).find((f: any) => f.faixa === (faixaAtual.faixa + 1))
    : null
  const alertaFaixa = faixaAtual && proximaFaixa
    ? (Number(faixaAtual.rbt12_max) - rbt12) < 60000
    : false

  return (
    <main className="min-h-screen p-4 sm:p-6 md:p-8 lg:p-12">
      <div className="max-w-screen-2xl mx-auto">
        <header className="mb-8">
          <Link href="/admin" className="text-xs text-white/40 hover:text-white/60 mb-2 inline-block">
            ← Voltar ao admin
          </Link>
          <h1 className="text-3xl md:text-4xl font-black text-white">
            Programa de Representantes
          </h1>
          <p className="text-white/60 mt-1 text-sm">
            Ranking, métricas do mês, folha e alertas fiscais
          </p>
        </header>

        {/* Alertas fiscais */}
        {alertaFaixa && faixaAtual && proximaFaixa && (
          <div className="mb-6 p-4 bg-coral/10 border border-coral/30 rounded-lg text-sm">
            <p className="text-coral font-bold mb-1">⚠ RBT12 próximo do teto da faixa {faixaAtual.faixa}</p>
            <p className="text-white/80">
              RBT12 atual: R$ {fmtInt(rbt12)} · teto da faixa: R$ {fmtInt(Number(faixaAtual.rbt12_max))} ·
              faltam <span className="text-coral font-bold">R$ {fmtInt(Number(faixaAtual.rbt12_max) - rbt12)}</span> pra
              subir pra faixa {proximaFaixa.faixa} (alíquota {(Number(proximaFaixa.aliquota_nominal) * 100).toFixed(2)}%).
              O motor v2 recalcula sozinho — mas revise as margens alvo.
            </p>
          </div>
        )}

        {/* Métricas agregadas */}
        <section className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-8">
          <Metric label="Representantes ativos" value={String(totalRepresentantes)} />
          <Metric label="Vendas do mês" value={String(qtdVendasMes)} />
          <Metric label="Volume do mês" value={`R$ ${fmtInt(volumeTotalMes)}`} highlight="sol" />
          <Metric label="MRR carteira (soma)" value={`R$ ${fmtInt(mrrTotal)}`} highlight="verde" />
        </section>

        {/* Simulação de folha do mês */}
        <section className="mb-8 p-6 bg-sol/[0.05] border border-sol/25 rounded-xl">
          <p className="text-[10px] uppercase tracking-widest text-sol font-bold mb-2">Folha estimada</p>
          <h2 className="text-lg font-bold text-white mb-4">Comissão a pagar este mês</h2>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <Metric label="Comissão bruta total" value={`R$ ${fmtInt(comissaoTotalMes)}`} highlight="sol" />
            <Metric label="Retirada fixa (× reps)" value={`R$ ${fmtInt(CRED.RETIRADA_MENSAL * totalRepresentantes)}`} />
            <Metric label="Anuidade MRR (~ estim.)" value={`R$ ${fmtInt(mrrTotal * 0.14)}`} />
            <Metric label="Verba de apoio (estim.)"
              value={`R$ ${fmtInt(Math.min(CRED.VERBA.teto * totalRepresentantes, Math.max(CRED.VERBA.piso * totalRepresentantes, volumeTotalMes * CRED.VERBA.pct)))}`} />
          </div>
          <p className="text-[11px] text-white/50 mt-4">
            Estimativa preliminar — a folha oficial roda no fechamento do mês considerando origem, aceleração e anexação real.
          </p>
        </section>

        {/* Ranking */}
        <section className="bg-white/[0.03] border border-white/10 rounded-xl overflow-hidden mb-8">
          <div className="p-4 border-b border-white/10 flex items-center justify-between">
            <h2 className="text-sm font-bold text-white">Ranking do mês</h2>
            <span className="text-xs text-white/40">{linhas.length} representantes</span>
          </div>
          {linhas.length === 0 ? (
            <div className="p-12 text-center">
              <p className="text-white/40 text-sm">Nenhum representante cadastrado ainda.</p>
              <Link href="/admin/usuarios" className="mt-3 inline-block text-xs text-sol hover:underline">
                → Convidar representante em /admin/usuarios
              </Link>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-white/[0.02] border-b border-white/10">
                <tr>
                  <th className="text-left px-4 py-3 text-[10px] uppercase tracking-wider text-white/50 font-bold">#</th>
                  <th className="text-left px-4 py-3 text-[10px] uppercase tracking-wider text-white/50 font-bold">Representante</th>
                  <th className="text-center px-4 py-3 text-[10px] uppercase tracking-wider text-white/50 font-bold">Nível</th>
                  <th className="text-right px-4 py-3 text-[10px] uppercase tracking-wider text-white/50 font-bold">Vendas</th>
                  <th className="text-right px-4 py-3 text-[10px] uppercase tracking-wider text-white/50 font-bold">Volume</th>
                  <th className="text-right px-4 py-3 text-[10px] uppercase tracking-wider text-white/50 font-bold">Acelerador</th>
                  <th className="text-right px-4 py-3 text-[10px] uppercase tracking-wider text-sol font-bold">Comissão est.</th>
                  <th className="text-right px-4 py-3 text-[10px] uppercase tracking-wider text-verde font-bold">MRR</th>
                </tr>
              </thead>
              <tbody>
                {linhas.map((l, i) => (
                  <tr key={l.id} className="border-b border-white/5 hover:bg-white/[0.02]">
                    <td className="px-4 py-3 text-white/50 font-mono text-xs">{i + 1}</td>
                    <td className="px-4 py-3">
                      <div className="text-white font-semibold">{l.nome_completo}</div>
                      {l.email && <div className="text-white/40 text-xs mt-0.5">{l.email}</div>}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ${
                        l.nivel_representante === 'Master' ? 'bg-sol text-noite'
                        : l.nivel_representante === 'Sênior' ? 'bg-verde/20 text-verde'
                        : 'bg-white/10 text-white/60'
                      }`}>
                        {l.nivel_representante || 'Credenciado'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right text-white/80 font-mono">{l.qtd_vendas_mes}</td>
                    <td className="px-4 py-3 text-right text-white font-mono">R$ {fmtInt(l.volume_mes)}</td>
                    <td className="px-4 py-3 text-right text-white/80 font-mono">{l.acelerador_mult.toFixed(2)}×</td>
                    <td className="px-4 py-3 text-right text-sol font-mono font-bold">R$ {fmtInt(l.comissao_estimada_mes)}</td>
                    <td className="px-4 py-3 text-right text-verde font-mono">R$ {fmtInt(l.mrr_carteira_atual)}</td>
                  </tr>
                ))}
                <tr className="bg-white/[0.03] font-bold">
                  <td colSpan={3} className="px-4 py-3 text-white text-xs uppercase tracking-wider">Total</td>
                  <td className="px-4 py-3 text-right text-white font-mono">{qtdVendasMes}</td>
                  <td className="px-4 py-3 text-right text-white font-mono">R$ {fmtInt(volumeTotalMes)}</td>
                  <td></td>
                  <td className="px-4 py-3 text-right text-sol font-mono">R$ {fmtInt(comissaoTotalMes)}</td>
                  <td className="px-4 py-3 text-right text-verde font-mono">R$ {fmtInt(mrrTotal)}</td>
                </tr>
              </tbody>
            </table>
          )}
        </section>

        {/* Parâmetros globais do programa — resumo (edição virá em fase seguinte) */}
        <section className="bg-white/[0.03] border border-white/10 rounded-xl p-6">
          <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
            <h2 className="text-lg font-bold text-white">Parâmetros globais do programa</h2>
            <Link href="/admin/precificacao" className="text-xs text-sol hover:underline">
              → Editar em /admin/precificacao
            </Link>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <p className="text-[10px] uppercase tracking-widest text-white/50 font-bold mb-2">Taxa base por linha</p>
              <div className="space-y-1 text-sm">
                <ParamLine label="Residencial" val={`${(TAXA_BASE_POR_LINHA.residencial.sem * 100).toFixed(1)}% (5,5% com O&M)`} />
                <ParamLine label="Comercial" val={`${(TAXA_BASE_POR_LINHA.comercial.sem * 100).toFixed(1)}% (4,0% com O&M)`} />
                <ParamLine label="Usina" val={`${(TAXA_BASE_POR_LINHA.usina.sem * 100).toFixed(1)}% (3,0% com O&M)`} />
                <ParamLine label="Carregador VE" val={`${(TAXA_BASE_POR_LINHA.carregador.sem * 100).toFixed(1)}%`} />
                <ParamLine label="O&M avulso" val={`${(TAXA_BASE_POR_LINHA.om.sem * 100).toFixed(1)}%`} />
              </div>
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-widest text-white/50 font-bold mb-2">Origens do lead</p>
              <div className="space-y-1 text-sm">
                {(Object.entries(ORIGEM_MULT) as Array<[OrigemLead, number]>).map(([k, v]) => (
                  <ParamLine key={k} label={k.replace('_', ' ')} val={`${v.toFixed(2)}×`} />
                ))}
              </div>
            </div>
          </div>
          <div className="mt-6 pt-6 border-t border-white/10">
            <p className="text-[10px] uppercase tracking-widest text-white/50 font-bold mb-2">Situação fiscal</p>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-sm">
              <ParamLine label="Anexo Simples" val={anexo} />
              <ParamLine label="RBT12" val={`R$ ${fmtInt(rbt12)}`} />
              {faixaAtual && <ParamLine label={`Faixa ${faixaAtual.faixa}`} val={`${(Number(faixaAtual.aliquota_nominal) * 100).toFixed(2)}% nominal`} />}
            </div>
          </div>
        </section>
      </div>
    </main>
  )
}

function Metric({ label, value, highlight }: { label: string; value: string; highlight?: 'sol' | 'verde' | 'coral' }) {
  const cor = highlight === 'sol' ? 'text-sol' : highlight === 'verde' ? 'text-verde' : highlight === 'coral' ? 'text-coral' : 'text-white'
  return (
    <div className="p-4 bg-white/[0.03] border border-white/10 rounded-lg">
      <p className="text-[10px] uppercase tracking-widest text-white/50 font-bold mb-1">{label}</p>
      <p className={`text-2xl font-black ${cor}`}>{value}</p>
    </div>
  )
}

function ParamLine({ label, val }: { label: string; val: string }) {
  return (
    <div className="flex justify-between py-1 border-b border-white/5 last:border-0">
      <span className="text-white/60 text-xs">{label}</span>
      <span className="text-white font-mono text-xs">{val}</span>
    </div>
  )
}
