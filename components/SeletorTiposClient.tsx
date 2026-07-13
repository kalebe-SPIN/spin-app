'use client'

import { useState, useTransition } from 'react'
import { TIPOS_ITEM, GRUPOS_INFO, tiposPorGrupo, type TipoItem } from '@/lib/tipos-projeto'
import { salvarTiposProjetoAction } from '@/app/projetos/[id]/tipos/actions'

export function SeletorTiposClient({
  projetoId,
  tiposJaEscolhidos,
}: {
  projetoId: string
  tiposJaEscolhidos: TipoItem[]
}) {
  const [selecionados, setSelecionados] = useState<Set<TipoItem>>(new Set(tiposJaEscolhidos))
  const [isPending, startTransition] = useTransition()
  const [erro, setErro] = useState<string | null>(null)

  const grupos = tiposPorGrupo()

  function toggle(t: TipoItem) {
    setSelecionados((prev) => {
      const n = new Set(prev)
      if (n.has(t)) n.delete(t)
      else n.add(t)
      return n
    })
  }

  function salvar() {
    setErro(null)
    if (selecionados.size === 0) {
      setErro('Escolha pelo menos 1 tipo')
      return
    }
    startTransition(async () => {
      const res = await salvarTiposProjetoAction(projetoId, Array.from(selecionados))
      if (res && 'erro' in res && res.erro) setErro(res.erro)
    })
  }

  return (
    <div className="space-y-6">
      <div className="p-4 bg-weg-azul/10 border border-weg-azul/30 rounded-lg text-sm text-white/80">
        💡 <strong className="text-white">Proposta combinada:</strong> selecione tudo que o cliente quer.
        Cada item terá seu próprio fluxo de dimensionamento e no final tudo é consolidado num único orçamento.
      </div>

      {/* Grupos */}
      {(Object.keys(grupos) as Array<keyof typeof grupos>).map((grupoKey) => {
        const grupo = GRUPOS_INFO[grupoKey]
        const tipos = grupos[grupoKey]
        return (
          <section key={grupoKey}>
            <h2 className={`text-sm uppercase tracking-wider font-bold mb-3 text-${grupo.cor}`}>
              {grupo.label}
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {tipos.map((t) => {
                const sel = selecionados.has(t.chave)
                return (
                  <button
                    key={t.chave}
                    type="button"
                    onClick={() => toggle(t.chave)}
                    disabled={!t.disponivel}
                    className={`relative p-4 rounded-xl border text-left transition ${
                      sel
                        ? `${grupo.bgClass} border-current`
                        : 'bg-white/[0.03] border-white/10 hover:border-white/30 hover:bg-white/5'
                    } ${!t.disponivel ? 'opacity-40 cursor-not-allowed' : ''}`}
                  >
                    {sel && (
                      <div className="absolute top-2 right-2 w-6 h-6 rounded-full bg-verde flex items-center justify-center text-noite text-xs font-black">
                        ✓
                      </div>
                    )}
                    {!t.disponivel && (
                      <span className="absolute top-2 right-2 text-[9px] uppercase font-bold text-white/40 bg-white/5 px-1.5 py-0.5 rounded">
                        em breve
                      </span>
                    )}
                    <div className="flex items-start gap-3">
                      <div className="text-3xl flex-shrink-0">{t.emoji}</div>
                      <div className="flex-1 min-w-0">
                        <p className="text-base font-bold text-white mb-0.5">{t.label}</p>
                        <p className="text-xs text-white/60 mb-1.5">{t.descricao}</p>
                        <p className="text-[10px] text-white/40 italic">Ex: {t.exemploUso}</p>
                      </div>
                    </div>
                  </button>
                )
              })}
            </div>
          </section>
        )
      })}

      {/* Resumo */}
      {selecionados.size > 0 && (
        <div className="sticky bottom-4 p-4 bg-verde/10 border border-verde/40 rounded-lg backdrop-blur">
          <p className="text-xs uppercase tracking-wider font-bold text-verde mb-2">
            Selecionado ({selecionados.size} {selecionados.size === 1 ? 'item' : 'itens'})
          </p>
          <div className="flex flex-wrap gap-1.5">
            {Array.from(selecionados).map((c) => {
              const info = TIPOS_ITEM.find((t) => t.chave === c)
              if (!info) return null
              return (
                <span key={c} className="text-xs px-2 py-1 bg-white/10 border border-white/20 rounded">
                  {info.emoji} {info.label}
                </span>
              )
            })}
          </div>
        </div>
      )}

      {erro && (
        <div className="p-3 bg-coral/10 border border-coral/30 rounded-lg text-sm text-coral">
          ⚠️ {erro}
        </div>
      )}

      <button
        onClick={salvar}
        disabled={isPending || selecionados.size === 0}
        className="w-full px-4 py-3 bg-sol text-noite font-bold rounded-lg hover:bg-sol/90 disabled:opacity-40"
      >
        {isPending ? 'Salvando...' : `Confirmar ${selecionados.size} ${selecionados.size === 1 ? 'item' : 'itens'} → Voltar ao projeto`}
      </button>
    </div>
  )
}
