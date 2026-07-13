import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { getInfoTipo, GRUPOS_INFO, type TipoItem } from '@/lib/tipos-projeto'
import { formatarMoedaBRL } from '@/lib/formatters'

const STATUS_INFO: Record<string, { emoji: string; label: string; cor: string }> = {
  pendente:            { emoji: '⏳', label: 'Pendente',            cor: 'text-white/60' },
  em_dimensionamento:  { emoji: '🚧', label: 'Em dimensionamento',  cor: 'text-sol' },
  concluido:           { emoji: '✓',  label: 'Concluído',           cor: 'text-verde' },
}

export async function ItensPropostaCard({ projetoId }: { projetoId: string }) {
  const supabase = createClient()
  const { data: itens } = await supabase
    .from('projeto_itens')
    .select('*')
    .eq('projeto_id', projetoId)
    .neq('status', 'removido')
    .order('ordem', { ascending: true })

  const total = (itens || []).reduce((s, i: any) => s + (Number(i.valor_estimado) || 0), 0)

  return (
    <section className="mb-6 p-5 bg-white/[0.03] border border-white/10 rounded-xl">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-xs uppercase tracking-wider font-bold text-sol">
            🎁 Itens da proposta
          </h2>
          <p className="text-[10px] text-white/50 mt-0.5">
            {itens?.length || 0} {itens?.length === 1 ? 'item selecionado' : 'itens selecionados'}
          </p>
        </div>
        <Link
          href={`/projetos/${projetoId}/tipos`}
          className="text-xs px-3 py-1.5 bg-sol/10 border border-sol/30 text-sol font-bold rounded hover:bg-sol/20"
        >
          + Adicionar/editar
        </Link>
      </div>

      {(!itens || itens.length === 0) ? (
        <div className="p-6 text-center bg-noite/40 border border-dashed border-white/10 rounded">
          <p className="text-sm text-white/60 mb-1">Nenhum item selecionado ainda.</p>
          <p className="text-xs text-white/40 mb-3">Escolha o que a Spin vai fornecer: solar, BESS, serviços...</p>
          <Link
            href={`/projetos/${projetoId}/tipos`}
            className="inline-block px-4 py-2 bg-sol text-noite font-bold text-sm rounded"
          >
            Escolher tipos →
          </Link>
        </div>
      ) : (
        <>
          <div className="space-y-2">
            {itens.map((item: any) => {
              const info = getInfoTipo(item.tipo as TipoItem)
              const statusInfo = STATUS_INFO[item.status] || STATUS_INFO.pendente
              const grupo = info ? GRUPOS_INFO[info.grupo] : null
              return (
                <div
                  key={item.id}
                  className={`p-3 rounded-lg border ${grupo?.bgClass || 'bg-noite/40 border-white/10'}`}
                >
                  <div className="flex items-center gap-3">
                    <div className="text-2xl">{info?.emoji || '📋'}</div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold text-white truncate">
                        {item.titulo || info?.label || item.tipo}
                      </p>
                      <p className={`text-[10px] uppercase font-bold ${statusInfo.cor}`}>
                        {statusInfo.emoji} {statusInfo.label}
                      </p>
                    </div>
                    <div className="text-right">
                      {item.valor_estimado ? (
                        <p className="text-sm font-black text-verde">{formatarMoedaBRL(item.valor_estimado)}</p>
                      ) : (
                        <p className="text-[10px] text-white/30 italic">a dimensionar</p>
                      )}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>

          {total > 0 && (
            <div className="mt-4 pt-3 border-t border-sol/30 flex items-center justify-between">
              <span className="text-xs uppercase tracking-wider font-bold text-white/60">
                Total estimado (parcial)
              </span>
              <span className="text-lg font-black text-sol">{formatarMoedaBRL(total)}</span>
            </div>
          )}
        </>
      )}
    </section>
  )
}
