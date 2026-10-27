import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getModoVisualizacao } from '@/lib/modo-visualizacao'
import { faltaMigration, podeUsarLevantamentos } from '@/lib/levantamentos/comum'
import { modelosParaEscolha } from '@/lib/levantamentos/servidor'
import type { Pendencia } from '@/lib/levantamentos/types'
import { ListaLevantamentos, type ItemLista } from '@/components/levantamentos/ListaLevantamentos'

export const dynamic = 'force-dynamic'

/**
 * /levantamentos — checklists de campo (Kalebe 2026-10-26/27): o admin cria
 * (já preenchido pelo projeto), corrige e concede o acesso a quem é do campo;
 * o técnico vê só o que recebeu, completa na visita e envia. Só o admin gera
 * os diagramas/arquivos, devolve com pendência e aprova. Representante não
 * acessa (os dados do projeto dele entram sozinhos no formulário).
 */
export default async function LevantamentosPage() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login?redirect=/levantamentos')
  const { modo, ehAdminReal } = await getModoVisualizacao()
  const { data: perfil } = await supabase.from('profiles').select('role, ativo').eq('id', user.id).maybeSingle()
  if (!podeUsarLevantamentos(perfil?.role, perfil?.ativo)) redirect('/dashboard')
  const ehEquipe = ehAdminReal && modo === 'admin'

  const [modelos, { data: levs, error }] = await Promise.all([
    modelosParaEscolha(supabase),
    supabase.from('levantamentos')
      .select('id, numero, finalidade, status, cliente_nome, cidade, progresso, updated_at, consultor_id, projeto_id, pendencias')
      .order('updated_at', { ascending: false }).limit(300),
  ])

  if (!modelos || faltaMigration(error)) {
    return (
      <Moldura>
        <div className="p-4 rounded-xl bg-sol/10 border border-sol/30 text-sm text-white/85">
          O módulo de levantamentos ainda não foi ativado no banco. Rode no Supabase as migrations 162 e 163.
        </div>
      </Moldura>
    )
  }

  // nomes e códigos só dos levantamentos que o RLS já deixou ver
  const lista = (levs || []) as any[]
  const admin = createAdminClient()
  const consultorIds = [...new Set(lista.map((l) => l.consultor_id))]
  const projetoIds = [...new Set(lista.map((l) => l.projeto_id).filter(Boolean))]
  const [{ data: pessoas }, { data: projetos }] = await Promise.all([
    consultorIds.length ? admin.from('profiles').select('id, nome_completo').in('id', consultorIds) : Promise.resolve({ data: [] as any[] }),
    projetoIds.length ? admin.from('projetos').select('id, codigo').in('id', projetoIds) : Promise.resolve({ data: [] as any[] }),
  ])
  const nome = new Map((pessoas || []).map((p: any) => [p.id, p.nome_completo || null]))
  const codigo = new Map((projetos || []).map((p: any) => [p.id, p.codigo || null]))

  const itens: ItemLista[] = lista.map((l) => ({
    id: l.id,
    numero: l.numero,
    finalidade: l.finalidade,
    status: l.status,
    cliente_nome: l.cliente_nome,
    cidade: l.cidade,
    progresso: l.progresso,
    updated_at: l.updated_at,
    consultor: nome.get(l.consultor_id) || null,
    projeto_codigo: l.projeto_id ? codigo.get(l.projeto_id) || null : null,
    pendencias_projetista: (Array.isArray(l.pendencias) ? (l.pendencias as Pendencia[]) : []).filter((p) => p.origem === 'projetista').length,
  }))

  return (
    <Moldura>
      <ListaLevantamentos itens={itens} modelos={modelos} ehEquipe={ehEquipe} podeCriar={ehEquipe && !!modelos.length} />
    </Moldura>
  )
}

function Moldura({ children }: { children: React.ReactNode }) {
  return (
    <main className="min-h-screen p-3 sm:p-6">
      <div className="max-w-2xl mx-auto space-y-4">
        <header>
          <h1 className="text-2xl sm:text-3xl font-black text-white">Levantamentos de campo</h1>
          <p className="text-white/60 text-sm mt-0.5">
            Um checklist para cada finalidade: sistema fotovoltaico, padrão de entrada novo e alteração ou aumento de carga. Os itens com * são obrigatórios para o projetista montar a prancha. Os dados que o projeto já tem entram preenchidos.
          </p>
        </header>
        {children}
      </div>
    </main>
  )
}
