import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { getModoVisualizacao } from '@/lib/modo-visualizacao'
import { ProjetosListaClient } from '@/components/ProjetosListaClient'
import { ETAPAS_BASE_PROJETOS } from '@/lib/projetos/negocio'

/**
 * Listagem de projetos — /projetos
 *
 * AGRUPA por cliente: se um mesmo cliente tem N projetos, aparece 1 card
 * com sub-lista dos projetos. Regra fixa da Spin: cliente é único, projetos
 * ficam sob o cadastro dele.
 *
 * Kalebe 2026-10-07: a BASE de projetos é o trabalho técnico (até o
 * orçamento gerado). Da proposta enviada em diante o card está no CRM; perdido
 * ou não elegível sai da base (aba Encerrados, dá pra reabrir).
 *
 * A lista + filtro de busca ficam num client component pra permitir
 * pesquisa em memória sem round-trip ao servidor.
 */
type Aba = 'andamento' | 'crm' | 'encerrados'
const ENCERRADOS_POR_ETAPA = ['recusado', 'cancelado', 'expirado']

export default async function ProjetosPage({ searchParams }: { searchParams: { ver?: string } }) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  const { modo } = await getModoVisualizacao()
  if (modo === 'profissional_campo') redirect('/campo')

  const aba: Aba = searchParams.ver === 'crm' || searchParams.ver === 'encerrados' ? searchParams.ver : 'andamento'

  // Query tolerante: colunas novas (encerrado_*, mig 144) e excluida_em (mig
  // 095) — se faltar alguma, cai pra consulta sem ela.
  const base = `
    id, codigo, status, tipo_projeto,
    cliente_id, cliente_razao_social, cliente_cpf_cnpj,
    uc_geradora, data_inicio,
    kit_selecionado,
    created_at, updated_at, status_atualizado_em,
    projeto_itens(tipo, status)`
  let projetos: any[] | null = null
  const tentativas = [
    () => supabase.from('projetos').select(`${base}, encerrado_tipo, encerrado_motivo, encerrado_detalhe, encerrado_em`).is('excluida_em', null),
    () => supabase.from('projetos').select(base).is('excluida_em', null),
    () => supabase.from('projetos').select(base),
  ]
  for (const t of tentativas) {
    const r: { data: any; error: any } = await (t() as any).order('created_at', { ascending: false }).limit(5000)
    if (!r.error) { projetos = r.data as any[]; break }
    console.warn('[projetos/page] consulta caiu pra próxima:', r.error.message)
  }

  const encerrado = (p: any) => !!p.encerrado_em || ENCERRADOS_POR_ETAPA.includes(p.status)
  const daAba = (p: any): Aba => (encerrado(p) ? 'encerrados' : ETAPAS_BASE_PROJETOS.includes(p.status) ? 'andamento' : 'crm')
  const contagem: Record<Aba, number> = { andamento: 0, crm: 0, encerrados: 0 }
  for (const p of projetos || []) contagem[daAba(p)] += 1
  const visiveis = (projetos || []).filter((p) => daAba(p) === aba)

  const grupos = new Map<string, { cliente_id: string | null; nome: string; projetos: any[] }>()
  for (const p of visiveis) {
    const chave = p.cliente_id || `sn:${(p.cliente_razao_social || 'sem_nome').toLowerCase().trim()}`
    const g = grupos.get(chave)
    if (g) {
      g.projetos.push(p)
    } else {
      grupos.set(chave, {
        cliente_id: p.cliente_id,
        nome: p.cliente_razao_social || 'Sem nome',
        projetos: [p],
      })
    }
  }

  const gruposArray = Array.from(grupos.values()).sort((a, b) => {
    const dataA = a.projetos[0]?.created_at || ''
    const dataB = b.projetos[0]?.created_at || ''
    return dataB.localeCompare(dataA)
  })

  const abaCls = (a: Aba) => `px-3 py-2 text-sm whitespace-nowrap border-b-2 -mb-px ${aba === a ? 'border-sol text-white font-bold' : 'border-transparent text-white/55 hover:text-white'}`

  return (
    <main className="min-h-screen p-4 sm:p-6 md:p-8 lg:p-12">
      <div className="max-w-screen-2xl mx-auto">
        <header className="mb-4">
          <Link href="/dashboard" className="text-xs text-white/40 hover:text-white/60 mb-2 inline-block">
            ← Dashboard
          </Link>
          <h1 className="text-3xl md:text-4xl font-black text-white">
            Projetos
          </h1>
        </header>

        <nav className="flex gap-1 overflow-x-auto border-b border-white/10 mb-4">
          <Link href="/projetos" className={abaCls('andamento')}>🛠 Em andamento ({contagem.andamento})</Link>
          <Link href="/projetos?ver=crm" className={abaCls('crm')} title="Da proposta enviada em diante o card está no CRM">🎯 No CRM ({contagem.crm})</Link>
          <Link href="/projetos?ver=encerrados" className={abaCls('encerrados')}>🗂 Perdidos e não elegíveis ({contagem.encerrados})</Link>
        </nav>
        {aba === 'crm' && (
          <p className="text-xs text-white/50 mb-3">
            Proposta enviada em diante — o acompanhamento é no <Link href="/crm/pipeline" className="text-sol hover:underline">CRM</Link>.
          </p>
        )}

        <ProjetosListaClient grupos={gruposArray} aba={aba} />
      </div>
    </main>
  )
}
