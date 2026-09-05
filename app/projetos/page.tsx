import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { getModoVisualizacao } from '@/lib/modo-visualizacao'
import { ProjetosListaClient } from '@/components/ProjetosListaClient'

/**
 * Listagem de projetos — /projetos
 *
 * AGRUPA por cliente: se um mesmo cliente tem N projetos, aparece 1 card
 * com sub-lista dos projetos. Regra fixa da Spin: cliente é único, projetos
 * ficam sob o cadastro dele.
 *
 * Admin vê tudo. Representante Spin/campo NÃO têm projetos — redirect.
 *
 * A lista + filtro de busca ficam num client component pra permitir
 * pesquisa em memória sem round-trip ao servidor.
 */
export default async function ProjetosPage() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  const { modo } = await getModoVisualizacao()
  if (modo === 'representante') redirect('/crm/servicos')
  if (modo === 'profissional_campo') redirect('/agenda')

  // Query tolerante: tenta filtrar excluída_em (migration 095); se a
  // coluna não existir ainda, cai pra query sem filtro. Assim a listagem
  // continua funcionando mesmo antes da migration rodar.
  const primeira = await supabase
    .from('projetos')
    .select(`
      id, codigo, status, tipo_projeto,
      cliente_id, cliente_razao_social, cliente_cpf_cnpj,
      uc_geradora, data_inicio,
      kit_selecionado,
      created_at, updated_at, status_atualizado_em,
      excluida_em
    `)
    .is('excluida_em', null)
    .order('created_at', { ascending: false })

  let projetos: any[] | null = primeira.data as any[] | null
  if (primeira.error) {
    console.warn('[projetos/page] filtro excluida_em falhou, fallback sem filtro:', primeira.error.message)
    const segunda = await supabase
      .from('projetos')
      .select(`
        id, codigo, status, tipo_projeto,
        cliente_id, cliente_razao_social, cliente_cpf_cnpj,
        uc_geradora, data_inicio,
        kit_selecionado,
        created_at, updated_at, status_atualizado_em
      `)
      .order('created_at', { ascending: false })
    projetos = segunda.data
  }

  const grupos = new Map<string, { cliente_id: string | null; nome: string; projetos: any[] }>()
  for (const p of projetos || []) {
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

        <ProjetosListaClient grupos={gruposArray} />
      </div>
    </main>
  )
}
