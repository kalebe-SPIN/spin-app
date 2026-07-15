import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import {
  getInfoTipo,
  getPassosRelevantes,
  INFO_PASSO,
  GRUPOS_INFO,
  type TipoItem,
} from '@/lib/tipos-projeto'
import { formatarMoedaBRL } from '@/lib/formatters'

const STATUS_INFO: Record<string, { emoji: string; label: string; cor: string }> = {
  pendente:            { emoji: '⏳', label: 'Pendente',            cor: 'text-white/60' },
  em_dimensionamento:  { emoji: '🚧', label: 'Em dimensionamento',  cor: 'text-sol' },
  concluido:           { emoji: '✓',  label: 'Concluído',           cor: 'text-verde' },
}

/**
 * Card que mostra os itens da proposta, cada um com seu MINI-WORKFLOW próprio.
 * Cada item é tratado independentemente — tem seus passos, status, valor.
 */
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
            Cada item tem seu próprio fluxo — {itens?.length || 0} {itens?.length === 1 ? 'item' : 'itens'}
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
          <div className="space-y-4">
            {itens.map((item: any) => (
              <ItemProposta key={item.id} item={item} projetoId={projetoId} />
            ))}
          </div>

          {total > 0 && (
            <div className="mt-5 pt-4 border-t-2 border-sol/40 flex items-center justify-between">
              <span className="text-xs uppercase tracking-wider font-bold text-white/60">
                Total consolidado
              </span>
              <span className="text-2xl font-black text-sol">{formatarMoedaBRL(total)}</span>
            </div>
          )}
        </>
      )}
    </section>
  )
}

/**
 * Um item da proposta — mini-card com seus próprios passos e status.
 */
function ItemProposta({ item, projetoId }: { item: any; projetoId: string }) {
  const info = getInfoTipo(item.tipo as TipoItem)
  const statusInfo = STATUS_INFO[item.status] || STATUS_INFO.pendente
  const grupo = info ? GRUPOS_INFO[info.grupo] : null

  // Passos individuais do item
  const passos = getPassosRelevantes([item.tipo as TipoItem])

  return (
    <div className={`p-4 rounded-lg border ${grupo?.bgClass || 'bg-noite/40 border-white/10'}`}>
      {/* Header do item */}
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <div className="text-3xl flex-shrink-0">{info?.emoji || '📋'}</div>
          <div className="flex-1 min-w-0">
            <p className="text-base font-bold text-white truncate">
              {item.titulo || info?.label || item.tipo}
            </p>
            <div className="flex items-center gap-2 mt-0.5">
              <span className={`text-[10px] uppercase font-bold ${statusInfo.cor}`}>
                {statusInfo.emoji} {statusInfo.label}
              </span>
              {info?.descricao && (
                <span className="text-[10px] text-white/40 hidden md:inline">
                  · {info.descricao.slice(0, 60)}
                </span>
              )}
            </div>
          </div>
        </div>
        <div className="text-right">
          {item.valor_estimado ? (
            <p className="text-lg font-black text-verde">{formatarMoedaBRL(item.valor_estimado)}</p>
          ) : (
            <p className="text-[10px] text-white/30 italic mt-1">a dimensionar</p>
          )}
        </div>
      </div>

      {/* Mini-workflow do item */}
      <div className="mt-3 pt-3 border-t border-white/10">
        <p className="text-[9px] uppercase tracking-wider font-bold text-white/40 mb-2">
          Fluxo · {passos.length} {passos.length === 1 ? 'passo' : 'passos'} · <span className="text-sol">passos coloridos = específicos deste tipo</span>
        </p>
        <div className="flex flex-wrap gap-1.5">
          {passos.map((chave, idx) => {
            const p = INFO_PASSO[chave]
            // Destaca passos específicos do tipo (bess_config, ve_config, servico_config)
            const isEspecifico = ['bess_config', 've_config', 'servico_config'].includes(chave)
            return (
              <Link
                key={chave}
                href={`/projetos/${projetoId}/${p.path}?item=${item.id}`}
                className={`text-[10px] px-2 py-1 rounded transition border ${
                  isEspecifico
                    ? `${grupo?.bgClass || 'bg-sol/20 border-sol/50'} font-bold text-white shadow-sm ring-1 ring-sol/40`
                    : 'bg-white/5 border-white/10 hover:bg-white/10 hover:border-sol/30 text-white/70 hover:text-white'
                }`}
              >
                <span className={isEspecifico ? 'text-sol' : 'text-white/40'}>{idx + 1}.</span>{' '}
                {isEspecifico && '⭐ '}{p.titulo}
              </Link>
            )
          })}
        </div>
      </div>

      {/* Observações do item */}
      {item.observacoes && (
        <p className="mt-3 text-xs text-white/60 italic">
          💬 {item.observacoes}
        </p>
      )}
    </div>
  )
}
