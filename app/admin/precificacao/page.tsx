import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'
export const revalidate = 0

const NOME_SERVICO: Record<string, { emoji: string; label: string; grupo: string }> = {
  retirada_recolocacao:   { emoji: '🔄', label: 'Retirada e recolocação',   grupo: 'FV' },
  instalacao_placas:      { emoji: '🔧', label: 'Instalação de placas',      grupo: 'FV' },
  limpeza_fotovoltaica:   { emoji: '🧹', label: 'Limpeza fotovoltaica',      grupo: 'Manutenção' },
  revisao_manutencao:     { emoji: '🔬', label: 'Revisão e manutenção',      grupo: 'Manutenção' },
  eletrica_predial:       { emoji: '⚡', label: 'Elétrica predial',           grupo: 'Elétrica' },
  padrao_entrada:         { emoji: '📊', label: 'Padrão de entrada CELESC',  grupo: 'Elétrica' },
  laudo_tecnico:          { emoji: '📋', label: 'Laudo técnico',              grupo: 'Diagnóstico' },
  analise_rede:           { emoji: '📊', label: 'Análise de rede',            grupo: 'Diagnóstico' },
  alvenaria:              { emoji: '🧱', label: 'Alvenaria',                  grupo: 'Construção' },
  serralheria:            { emoji: '⚙️', label: 'Serralheria',                grupo: 'Construção' },
  carpintaria:            { emoji: '🪵', label: 'Carpintaria',                grupo: 'Construção' },
  aluguel_maquinas:       { emoji: '🚜', label: 'Aluguel máquinas pesadas',  grupo: 'Aluguel' },
  aluguel_equipamentos:   { emoji: '🛠️', label: 'Aluguel equipamentos',      grupo: 'Aluguel' },
}

export default async function HubPrecificacaoPage() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: perfil } = await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle()
  if (perfil?.role !== 'admin') {
    return (
      <main className="min-h-screen p-8 md:p-12">
        <div className="max-w-3xl mx-auto bg-coral/10 border border-coral/30 rounded-xl p-6">
          <h1 className="text-xl font-bold text-coral">Acesso restrito</h1>
        </div>
      </main>
    )
  }

  // Agrega dados dos 2 sistemas: parametros detalhados + faixas de referencia
  const { data: parametros } = await supabase
    .from('parametros_precificacao_servicos')
    .select('chave, nome, ativo, updated_at')

  const { data: faixas } = await supabase
    .from('faixas_precificacao_servicos')
    .select('chave_servico, unidade, valor, ativo')

  // Consolida por chave
  const chavesTodas = new Set<string>()
  const paramsPorChave: Record<string, any> = {}
  for (const p of (parametros || [])) {
    chavesTodas.add(p.chave)
    paramsPorChave[p.chave] = p
  }
  const faixasPorChave: Record<string, any[]> = {}
  for (const f of (faixas || [])) {
    chavesTodas.add(f.chave_servico)
    if (!faixasPorChave[f.chave_servico]) faixasPorChave[f.chave_servico] = []
    faixasPorChave[f.chave_servico].push(f)
  }

  // Agrupa por segmento (FV, Manutenção, Construção, etc)
  const porGrupo: Record<string, string[]> = {}
  for (const chave of Array.from(chavesTodas)) {
    const info = NOME_SERVICO[chave] || { emoji: '📎', label: chave, grupo: 'Outros' }
    if (!porGrupo[info.grupo]) porGrupo[info.grupo] = []
    porGrupo[info.grupo].push(chave)
  }

  return (
    <main className="min-h-screen p-8 md:p-12">
      <div className="max-w-6xl mx-auto">
        <header className="mb-8">
          <Link href="/admin" className="text-xs text-white/40 hover:text-white/60 mb-2 inline-block">
            ← Voltar ao admin
          </Link>
          <h1 className="text-3xl md:text-4xl font-black text-white">
            💰 Precificação centralizada
          </h1>
          <p className="text-white/60 mt-1 text-sm">
            Todos os serviços num único lugar. Edite parâmetros de cálculo detalhado ou faixas de referência.
          </p>
        </header>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-8">
          <Link
            href="/admin/precificacao/servicos"
            className="bg-white/[0.03] border border-white/10 hover:border-sol/40 rounded-xl p-5 transition"
          >
            <p className="text-2xl mb-2">⚙️</p>
            <p className="text-lg font-bold text-white mb-1">Parâmetros detalhados</p>
            <p className="text-xs text-white/60">
              Fatores por telhado, pavimento, KM, diárias, materiais, etc.
              Usados pelo cálculo automático em cada form de serviço.
            </p>
          </Link>
          <Link
            href="/admin/precificacao/faixas"
            className="bg-white/[0.03] border border-white/10 hover:border-sol/40 rounded-xl p-5 transition"
          >
            <p className="text-2xl mb-2">📊</p>
            <p className="text-lg font-bold text-white mb-1">Faixas de referência</p>
            <p className="text-xs text-white/60">
              Por qtd de placas, potência kWp, horas, m², metros, dias.
              Aparece como referência rápida no orçamento.
            </p>
          </Link>
        </div>

        {/* Lista de servicos por grupo */}
        <section>
          <h2 className="text-xs uppercase tracking-wider font-bold text-sol mb-4">
            Serviços cadastrados
          </h2>

          {Object.entries(porGrupo).sort().map(([grupo, chaves]) => (
            <div key={grupo} className="mb-6">
              <p className="text-[10px] uppercase tracking-wider font-bold text-white/50 mb-2">
                {grupo}
              </p>
              <div className="space-y-1.5">
                {chaves.map((chave) => {
                  const info = NOME_SERVICO[chave] || { emoji: '📎', label: chave, grupo: 'Outros' }
                  const temParams = !!paramsPorChave[chave]
                  const faixasAtivas = (faixasPorChave[chave] || []).filter((f: any) => f.ativo).length
                  const unidades = new Set((faixasPorChave[chave] || []).map((f: any) => f.unidade))

                  return (
                    <div
                      key={chave}
                      className="bg-white/[0.03] border border-white/10 rounded-lg p-3 flex items-center gap-4"
                    >
                      <span className="text-xl shrink-0">{info.emoji}</span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-bold text-white truncate">{info.label}</p>
                        <p className="text-[10px] text-white/50 font-mono">{chave}</p>
                      </div>

                      <div className="flex items-center gap-2 flex-wrap">
                        {temParams ? (
                          <Link
                            href={`/admin/precificacao/servicos#${chave}`}
                            className="text-[10px] px-2 py-1 bg-verde/10 border border-verde/30 text-verde rounded hover:bg-verde/20"
                            title="Editar parâmetros detalhados"
                          >
                            ⚙️ Params
                          </Link>
                        ) : (
                          <span className="text-[10px] px-2 py-1 bg-white/5 border border-white/10 text-white/40 rounded">
                            sem params
                          </span>
                        )}

                        {faixasAtivas > 0 ? (
                          <Link
                            href={`/admin/precificacao/faixas#${chave}`}
                            className="text-[10px] px-2 py-1 bg-sol/10 border border-sol/30 text-sol rounded hover:bg-sol/20"
                            title={`${faixasAtivas} faixas ativas por ${Array.from(unidades).join(', ')}`}
                          >
                            📊 {faixasAtivas} faixas ({Array.from(unidades).join('/')})
                          </Link>
                        ) : (
                          <span className="text-[10px] px-2 py-1 bg-white/5 border border-white/10 text-white/40 rounded">
                            sem faixas
                          </span>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          ))}
        </section>
      </div>
    </main>
  )
}
