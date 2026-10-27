import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { CURTO_FINALIDADE } from '@/lib/levantamentos/comum'
import { modelosParaEscolha } from '@/lib/levantamentos/servidor'
import { numeroLevantamento, type Finalidade, type StatusLevantamento } from '@/lib/levantamentos/types'
import { EtiquetaStatus } from './ui'
import { NovoLevantamento } from './NovoLevantamento'

type Linha = { id: string; numero: number; finalidade: Finalidade; status: StatusLevantamento; progresso: number }

/**
 * Levantamentos técnicos no projeto (Kalebe 2026-10-26/27). Admin: lista com
 * links e "Novo levantamento" já ligado e pré-preenchido. Representante: só a
 * situação — o formulário é do setor campo/admin e os arquivos ficam com o
 * admin; os dados que ele cadastrou no projeto entram sozinhos no formulário.
 * Some enquanto as migrations 162/163 não forem aplicadas.
 */
export async function LevantamentosProjetoCard({ projetoId, ehAdmin }: { projetoId: string; ehAdmin: boolean }) {
  const supabase = createClient()
  const modelos = await modelosParaEscolha(supabase)
  if (!modelos) return null
  // a página do projeto já conferiu o acesso (RLS de projetos); aqui só a situação
  const { data: levs } = await createAdminClient().from('levantamentos')
    .select('id, numero, finalidade, status, progresso')
    .eq('projeto_id', projetoId).is('deleted_at', null).neq('status', 'cancelado')
    .order('updated_at', { ascending: false }).limit(20)
  const lista = (levs || []) as Linha[]
  if (!ehAdmin && !lista.length) return null

  return (
    <section className="mb-6 rounded-xl border border-white/10 bg-white/[0.03] p-4 space-y-3">
      <div>
        <h2 className="text-base font-bold text-white">📋 Levantamento técnico</h2>
        <p className="text-xs text-white/55">
          {ehAdmin
            ? 'Checklist da visita técnica (fotos e medidas), preenchido pelo setor campo ou pelo admin; alimenta o gerador de diagramas e do padrão de entrada.'
            : 'Feito na visita técnica pelo setor campo. Os dados que você cadastrou no projeto já entram no formulário.'}
        </p>
      </div>
      {lista.length > 0 && (
        <ul className="grid gap-1.5">
          {lista.map((l) => {
            const conteudo = (
              <>
                <span className="text-sm text-white min-w-0 truncate">
                  {CURTO_FINALIDADE[l.finalidade]} <span className="text-white/45">· {numeroLevantamento(l.numero)}{ehAdmin ? ` · ${l.progresso}%` : ''}</span>
                </span>
                <EtiquetaStatus status={l.status} />
              </>
            )
            return (
              <li key={l.id}>
                {ehAdmin ? (
                  <Link href={`/levantamentos/${l.id}`} className="flex items-center justify-between gap-3 rounded-lg border border-white/10 px-3 py-2 hover:border-sol/40">{conteudo}</Link>
                ) : (
                  <div className="flex items-center justify-between gap-3 rounded-lg border border-white/10 px-3 py-2">{conteudo}</div>
                )}
              </li>
            )
          })}
        </ul>
      )}
      {ehAdmin && <NovoLevantamento modelos={modelos} projetoId={projetoId} />}
    </section>
  )
}
