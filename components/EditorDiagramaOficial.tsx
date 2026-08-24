'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { salvarCampoFaseAction } from '@/app/homologacoes/[id]/actions'

type Diagrama = {
  id: string
  versao: number
  tipo_desenho: string
  status: string
  url_pdf: string | null
  created_at: string
}

/**
 * Seletor do diagrama oficial da homologação (Fase 3). Lista todos os
 * diagramas prontos do projeto e permite marcar qual é o "definitivo"
 * — o que vai ser enviado à CELESC. Salva em homologacoes.diagrama_unifilar_id.
 */
export function EditorDiagramaOficial({
  homologacaoId,
  projetoId,
  diagramas,
  diagramaIdSelecionado,
}: {
  homologacaoId: string
  projetoId: string
  diagramas: Diagrama[]
  diagramaIdSelecionado?: string | null
}) {
  const router = useRouter()
  const [selecionado, setSelecionado] = useState<string>(diagramaIdSelecionado || '')
  const [pending, startTransition] = useTransition()
  const [erro, setErro] = useState<string | null>(null)

  const diagramasProntos = diagramas.filter(d => d.status === 'pronto')

  function marcar(diagramaId: string) {
    setErro(null)
    setSelecionado(diagramaId)
    startTransition(async () => {
      const r = await salvarCampoFaseAction(homologacaoId, 'diagrama_unifilar_id', diagramaId || null)
      if ('erro' in r) setErro(r.erro)
      else router.refresh()
    })
  }

  function desmarcar() {
    setSelecionado('')
    startTransition(async () => {
      await salvarCampoFaseAction(homologacaoId, 'diagrama_unifilar_id', null)
      router.refresh()
    })
  }

  if (diagramasProntos.length === 0) {
    return (
      <div className="p-3 bg-white/[0.02] border border-dashed border-white/20 rounded-lg text-xs text-white/60">
        Nenhum diagrama pronto ainda pra este projeto.{' '}
        <Link href={`/projetos/${projetoId}/diagrama`} className="text-sol hover:underline">
          Ir gerar/enviar o unifilar →
        </Link>
      </div>
    )
  }

  return (
    <div className="space-y-2">
      <p className="text-[10px] uppercase tracking-wider text-white/50 font-bold">
        Diagrama oficial da homologação
        {pending && <span className="ml-2 text-white/40">…</span>}
      </p>
      <div className="space-y-2">
        {diagramasProntos.map(d => {
          const escolhido = selecionado === d.id
          return (
            <button
              key={d.id}
              type="button"
              onClick={() => marcar(d.id)}
              disabled={pending}
              className={`w-full text-left p-3 rounded-lg border transition ${
                escolhido
                  ? 'bg-verde/10 border-verde/40'
                  : 'bg-white/[0.02] border-white/10 hover:border-white/25'
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <div>
                  <p className="text-sm font-bold text-white flex items-center gap-2">
                    {escolhido && <span className="text-verde">✓</span>}
                    v{d.versao} · {d.tipo_desenho.replace('_', ' ')}
                  </p>
                  <p className="text-[10px] text-white/50">
                    {new Date(d.created_at).toLocaleString('pt-BR', {
                      day: '2-digit', month: '2-digit', year: 'numeric',
                      hour: '2-digit', minute: '2-digit',
                    })}
                  </p>
                </div>
                {d.url_pdf && (
                  <a
                    href={d.url_pdf}
                    target="_blank"
                    rel="noreferrer"
                    onClick={(e) => e.stopPropagation()}
                    className="text-[10px] px-2 py-1 bg-white/5 border border-white/10 rounded text-white/70 hover:bg-white/10"
                  >
                    📄 Abrir PDF
                  </a>
                )}
              </div>
            </button>
          )
        })}
      </div>
      {selecionado && (
        <button
          type="button"
          onClick={desmarcar}
          disabled={pending}
          className="text-[10px] text-white/40 hover:text-coral"
        >
          Desmarcar diagrama oficial
        </button>
      )}
      {erro && <p className="text-[10px] text-coral">⚠ {erro}</p>}
    </div>
  )
}
