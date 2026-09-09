import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { MotorV2Controls } from './MotorV2Controls'
import { SimuladorV1xV2 } from './SimuladorV1xV2'

export const dynamic = 'force-dynamic'
export const revalidate = 0

const fmtBRL = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const fmtPct = (v: number) => `${(v * 100).toFixed(2).replace('.', ',')}%`

export default async function MotorV2Page() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: perfil } = await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle()
  if (perfil?.role !== 'admin') {
    return (
      <main className="min-h-screen p-4 sm:p-6 md:p-8 lg:p-12">
        <div className="max-w-3xl mx-auto bg-coral/10 border border-coral/30 rounded-xl p-6">
          <h1 className="text-xl font-bold text-coral">Acesso restrito</h1>
        </div>
      </main>
    )
  }

  const [paramsRes, margensRes, aliqRes, multRes] = await Promise.all([
    supabase.from('parametros_precificacao')
      .select('chave, valor_numero')
      .in('chave', ['precificacao_v2', 'comissao_modo', 'rbt12_atual', 'simples_anexo_atual']),
    supabase.from('margens_alvo').select('*').eq('ativo', true).is('vigente_ate', null)
      .order('linha').order('potencia_min_kwp'),
    supabase.from('aliquotas_simples').select('*').eq('ativo', true)
      .order('anexo').order('faixa'),
    supabase.from('multiplicadores_complexidade').select('*').eq('ativo', true).order('codigo'),
  ])

  const paramMap: Record<string, number> = {}
  ;(paramsRes.data || []).forEach((r: any) => { paramMap[r.chave] = Number(r.valor_numero) || 0 })

  const v2Ativo = paramMap['precificacao_v2'] === 1
  const comissaoFixa7 = paramMap['comissao_modo'] === 1
  const rbt12 = paramMap['rbt12_atual'] || 0
  const anexoAtual: 'III' | 'V' = paramMap['simples_anexo_atual'] === 5 ? 'V' : 'III'

  const tabelasProntas = (margensRes.data || []).length > 0
    && (aliqRes.data || []).length > 0
    && (multRes.data || []).length > 0

  return (
    <main className="min-h-screen p-4 sm:p-6 md:p-8 lg:p-12">
      <div className="max-w-screen-xl mx-auto">
        <header className="mb-8">
          <Link href="/admin/precificacao" className="text-xs text-white/40 hover:text-white/60 mb-2 inline-block">
            ← Voltar
          </Link>
          <div className="flex items-center gap-3 mb-1">
            <span className={`text-[10px] uppercase tracking-wider font-bold px-2 py-0.5 rounded-full border ${v2Ativo ? 'bg-verde/10 text-verde border-verde/30' : 'bg-white/5 text-white/50 border-white/10'}`}>
              {v2Ativo ? 'v2 ativo' : 'v1 legado'}
            </span>
            {!tabelasProntas && (
              <span className="text-[10px] uppercase tracking-wider font-bold px-2 py-0.5 rounded-full bg-coral/10 text-coral border border-coral/30">
                Tabelas incompletas — aplicar migration 103
              </span>
            )}
          </div>
          <h1 className="text-3xl md:text-4xl font-black text-white">
            ⚡ Motor de precificação v2
          </h1>
          <p className="text-white/60 mt-1 text-sm max-w-3xl">
            Prompt 12 — margem alvo sobre nota SPIN, comissão efetiva variável, alíquota do Simples calculada
            por projeto e piso R$/Wp. Ligar aqui muda o cálculo do <code className="font-mono text-sol">/orcamento</code> em tempo real.
          </p>
        </header>

        <MotorV2Controls
          v2Ativo={v2Ativo}
          comissaoFixa7={comissaoFixa7}
          rbt12={rbt12}
          anexoAtual={anexoAtual}
        />

        {/* Simulador v1 × v2 — permite validar impacto ANTES de ligar a flag */}
        <SimuladorV1xV2
          multiplicadoresDisponiveis={(multRes.data || []).map((m: any) => ({
            codigo: m.codigo, nome: m.nome, tipo: m.tipo, valor: Number(m.valor),
          }))}
        />

        {/* Tabelas do motor — só leitura por enquanto (edição fica pro próximo prompt) */}
        <section className="mt-10">
          <h2 className="text-xs uppercase tracking-widest font-bold text-sol mb-3">
            Margens alvo por linha
          </h2>
          <div className="bg-white/[0.03] border border-white/10 rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-white/5 text-[10px] uppercase tracking-wider text-white/50">
                <tr>
                  <th className="text-left p-2">Linha</th>
                  <th className="text-right p-2">Potência (kWp)</th>
                  <th className="text-right p-2">Margem alvo</th>
                  <th className="text-right p-2">Piso R$/Wp</th>
                  <th className="text-left p-2">Descrição</th>
                </tr>
              </thead>
              <tbody>
                {(margensRes.data || []).map((m: any) => (
                  <tr key={m.id} className="border-t border-white/5">
                    <td className="p-2 font-semibold text-white capitalize">{m.linha}</td>
                    <td className="p-2 text-right text-white/70 font-mono">
                      {Number(m.potencia_min_kwp)}–{Number(m.potencia_max_kwp)}
                    </td>
                    <td className="p-2 text-right font-mono text-sol">{fmtPct(Number(m.margem_alvo_nota_spin))}</td>
                    <td className="p-2 text-right font-mono text-white/70">R$ {Number(m.piso_reais_por_wp).toFixed(2)}</td>
                    <td className="p-2 text-white/50 text-xs">{m.descricao}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="mt-10">
          <h2 className="text-xs uppercase tracking-widest font-bold text-sol mb-3">
            Alíquotas Simples Nacional — Anexos III e V
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {(['III', 'V'] as const).map((ax) => {
              const faixas = (aliqRes.data || []).filter((a: any) => a.anexo === ax)
              return (
                <div key={ax} className="bg-white/[0.03] border border-white/10 rounded-xl overflow-hidden">
                  <p className="px-3 py-2 text-[10px] uppercase tracking-wider font-bold text-white/60 border-b border-white/5">
                    Anexo {ax} {anexoAtual === ax && <span className="text-verde ml-2">· em uso</span>}
                  </p>
                  <table className="w-full text-xs">
                    <thead className="text-[10px] uppercase text-white/50">
                      <tr>
                        <th className="text-left p-2">Faixa</th>
                        <th className="text-right p-2">RBT12</th>
                        <th className="text-right p-2">Alíquota</th>
                        <th className="text-right p-2">Deduzir</th>
                      </tr>
                    </thead>
                    <tbody>
                      {faixas.map((a: any) => (
                        <tr key={a.id} className="border-t border-white/5">
                          <td className="p-2 font-mono text-white/70">{a.faixa}</td>
                          <td className="p-2 text-right text-white/60 font-mono">
                            até {fmtBRL(Number(a.rbt12_max))}
                          </td>
                          <td className="p-2 text-right font-mono text-sol">{fmtPct(Number(a.aliquota_nominal))}</td>
                          <td className="p-2 text-right text-white/60 font-mono">
                            {fmtBRL(Number(a.parcela_deduzir))}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )
            })}
          </div>
        </section>

        <section className="mt-10">
          <h2 className="text-xs uppercase tracking-widest font-bold text-sol mb-3">
            Multiplicadores de complexidade
          </h2>
          <div className="bg-white/[0.03] border border-white/10 rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-white/5 text-[10px] uppercase tracking-wider text-white/50">
                <tr>
                  <th className="text-left p-2">Código</th>
                  <th className="text-left p-2">Nome</th>
                  <th className="text-left p-2">Tipo</th>
                  <th className="text-right p-2">Valor</th>
                  <th className="text-left p-2">Descrição</th>
                </tr>
              </thead>
              <tbody>
                {(multRes.data || []).map((m: any) => (
                  <tr key={m.id} className="border-t border-white/5">
                    <td className="p-2 font-mono text-white/60 text-xs">{m.codigo}</td>
                    <td className="p-2 text-white font-semibold">{m.nome}</td>
                    <td className="p-2 text-white/60 text-xs">{m.tipo}</td>
                    <td className="p-2 text-right font-mono text-sol">
                      {m.tipo === 'percentual' ? fmtPct(Number(m.valor))
                        : m.tipo === 'orcar_parte' ? '—'
                        : `R$ ${Number(m.valor).toFixed(2)}`}
                    </td>
                    <td className="p-2 text-white/50 text-xs">{m.descricao}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </main>
  )
}
