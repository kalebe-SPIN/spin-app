import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { CURTO_FINALIDADE } from '@/lib/levantamentos/comum'
import { modelosParaEscolha } from '@/lib/levantamentos/servidor'
import { numeroLevantamento, type Finalidade, type StatusLevantamento } from '@/lib/levantamentos/types'
import { EtiquetaStatus } from './ui'
import { NovoLevantamento } from './NovoLevantamento'

/**
 * Levantamentos de campo no projeto (Kalebe 2026-10-26): status de cada um e
 * "Novo levantamento" já ligado e pré-preenchido com os dados do projeto.
 * Some enquanto as migrations 162/163 não forem aplicadas.
 */
export async function LevantamentosProjetoCard({ projetoId }: { projetoId: string }) {
  const supabase = createClient()
  const modelos = await modelosParaEscolha(supabase)
  if (!modelos) return null
  const { data: levs } = await supabase.from('levantamentos')
    .select('id, numero, finalidade, status, progresso, updated_at')
    .eq('projeto_id', projetoId).order('updated_at', { ascending: false }).limit(20)
  const lista = (levs || []) as { id: string; numero: number; finalidade: Finalidade; status: StatusLevantamento; progresso: number; updated_at: string }[]

  return (
    <section className="mb-6 rounded-xl border border-white/10 bg-white/[0.03] p-4 space-y-3">
      <div>
        <h2 className="text-base font-bold text-white">📋 Levantamentos de campo</h2>
        <p className="text-xs text-white/55">Checklist da visita (fotos e medidas) que alimenta o gerador de diagramas e do padrão de entrada.</p>
      </div>
      {lista.length > 0 && (
        <ul className="grid gap-1.5">
          {lista.map((l) => (
            <li key={l.id}>
              <Link href={`/levantamentos/${l.id}`} className="flex items-center justify-between gap-3 rounded-lg border border-white/10 px-3 py-2 hover:border-sol/40">
                <span className="text-sm text-white min-w-0 truncate">
                  {CURTO_FINALIDADE[l.finalidade]} <span className="text-white/45">· {numeroLevantamento(l.numero)} · {l.progresso}%</span>
                </span>
                <EtiquetaStatus status={l.status} />
              </Link>
            </li>
          ))}
        </ul>
      )}
      <NovoLevantamento modelos={modelos} projetoId={projetoId} />
    </section>
  )
}
