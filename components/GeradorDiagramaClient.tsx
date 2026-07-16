'use client'

import { useState, useTransition, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { gerarDiagramaAction } from '@/app/projetos/[id]/diagrama/actions'

type Diagrama = {
  id: string
  versao: number
  tipo_desenho: string
  status: string
  url_pdf: string | null
  url_dxf: string | null
  url_svg: string | null
  url_dwg: string | null
  avisos: string[] | null
  erro_mensagem: string | null
  created_at: string
  eh_previa?: boolean
}

type Props = {
  projeto: any
  diagramasExistentes: Diagrama[]
  configOk: boolean
}

const TIPOS: Array<{ id: 'unifilar_ongrid' | 'unifilar_hibrido'; label: string; desc: string }> = [
  {
    id: 'unifilar_ongrid',
    label: 'Unifilar on-grid',
    desc: 'Sistema conectado à rede sem armazenamento. Padrão CELESC para GD.',
  },
  {
    id: 'unifilar_hibrido',
    label: 'Unifilar híbrido (BESS)',
    desc: 'Sistema conectado à rede com bateria. Inclui SPDA e proteção BESS.',
  },
]

export function GeradorDiagramaClient({ projeto, diagramasExistentes, configOk }: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [erro, setErro] = useState<string | null>(null)

  // Sugere tipo baseado no tipo_projeto
  const tipoSugerido = projeto.tipo_projeto === 'hibrido_bess' ? 'unifilar_hibrido' : 'unifilar_ongrid'
  const [tipoSelecionado, setTipoSelecionado] = useState<'unifilar_ongrid' | 'unifilar_hibrido'>(tipoSugerido)

  // Auto-refresh a cada 5s enquanto houver diagrama em 'gerando'
  useEffect(() => {
    const temGerando = diagramasExistentes.some(d => d.status === 'gerando')
    if (!temGerando) return
    const interval = setInterval(() => router.refresh(), 5000)
    return () => clearInterval(interval)
  }, [diagramasExistentes, router])

  function handleGerar(modoPrevia: boolean = false) {
    setErro(null)
    startTransition(async () => {
      const result = await gerarDiagramaAction(projeto.id, tipoSelecionado, { modoPrevia })
      if (!result.sucesso) {
        setErro(result.erro || 'Erro ao gerar diagrama')
      } else {
        router.refresh()
      }
    })
  }

  const clienteAceitou = projeto.status === 'aceito'

  return (
    <div className="space-y-8">
      {/* Escolha do tipo */}
      <section className="bg-white/[0.03] border border-white/10 rounded-xl p-6">
        <h2 className="text-lg font-bold text-white mb-4">Qual desenho gerar?</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {TIPOS.map(t => (
            <button
              key={t.id}
              onClick={() => setTipoSelecionado(t.id)}
              className={`text-left p-4 rounded-lg border transition ${
                tipoSelecionado === t.id
                  ? 'bg-sol/15 border-sol/60'
                  : 'bg-white/[0.02] border-white/10 hover:border-white/20'
              }`}
            >
              <div className="flex items-center justify-between mb-1">
                <span className="font-bold text-white text-sm">{t.label}</span>
                {tipoSelecionado === t.id && <span className="text-sol">✓</span>}
              </div>
              <p className="text-xs text-white/60">{t.desc}</p>
            </button>
          ))}
        </div>
      </section>

      {/* Botão gerar */}
      <section className="bg-white/[0.03] border border-white/10 rounded-xl p-6">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <p className="text-sm text-white/80">
              O sistema vai reunir os dados do projeto (fatura + telhado + padrão + kit
              {tipoSelecionado === 'unifilar_hibrido' && ' + dimensionamento BESS'})
              e desenhar o unifilar com o selo da Spin.
            </p>
            <p className="text-xs text-white/40 mt-1">
              Saída: <strong className="text-white">SVG</strong> (PDF/DXF na fase F.2)
            </p>
          </div>
          <div className="flex gap-2 flex-shrink-0">
            {!clienteAceitou && (
              <button
                onClick={() => handleGerar(true)}
                disabled={isPending || !configOk}
                className="px-4 py-3 bg-white/10 border border-white/20 text-white font-bold text-sm rounded-lg disabled:opacity-40 disabled:cursor-not-allowed whitespace-nowrap"
                title="Gera rascunho pra visualizar antes do cliente aceitar"
              >
                {isPending ? '⏳' : '👁️ Gerar prévia'}
              </button>
            )}
            <button
              onClick={() => handleGerar(false)}
              disabled={isPending || !configOk || !clienteAceitou}
              className="px-6 py-3 bg-sol text-noite font-bold text-sm rounded-lg disabled:opacity-40 disabled:cursor-not-allowed whitespace-nowrap"
              title={!clienteAceitou ? 'Cliente ainda não aceitou a proposta' : 'Gera diagrama oficial'}
            >
              {isPending ? '⏳ Gerando...' : '🖨️ Gerar oficial'}
            </button>
          </div>
        </div>

        {!clienteAceitou && (
          <div className="mt-4 p-3 bg-sol/10 border border-sol/30 rounded-lg text-xs text-sol/90">
            💡 <strong>Status atual:</strong> {projeto.status} — Cliente ainda não aceitou a proposta.
            Você pode gerar uma <strong>prévia</strong> pra revisar o unifilar antes.
            Só o diagrama <strong>oficial</strong> (pós-aceite) serve pra ART.
          </div>
        )}

        {erro && (
          <div className="mt-4 bg-coral/10 border border-coral/30 rounded-lg p-3 text-sm text-coral">
            ❌ {erro}
          </div>
        )}
      </section>

      {/* Histórico de versões */}
      <section>
        <h2 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
          📁 Versões geradas
          <span className="text-xs font-normal text-white/40">({diagramasExistentes.length})</span>
        </h2>
        {diagramasExistentes.length === 0 ? (
          <div className="text-sm text-white/40 py-6 text-center bg-white/[0.02] border border-dashed border-white/10 rounded-lg">
            Nenhum diagrama gerado ainda.
          </div>
        ) : (
          <div className="space-y-2">
            {diagramasExistentes.map(d => (
              <DiagramaCard key={d.id} d={d} />
            ))}
          </div>
        )}
      </section>
    </div>
  )
}

function DiagramaCard({ d }: { d: Diagrama }) {
  const dataFmt = new Date(d.created_at).toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })

  const statusCor =
    d.status === 'pronto' ? 'text-verde bg-verde/10 border-verde/30'
      : d.status === 'gerando' ? 'text-sol bg-sol/10 border-sol/30'
      : 'text-coral bg-coral/10 border-coral/30'

  return (
    <div className="bg-white/[0.03] border border-white/10 rounded-lg p-4">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-3 flex-wrap">
          <span className="text-xs font-mono text-white/40">v{d.versao}</span>
          <span className="text-sm font-bold text-white capitalize">
            {d.tipo_desenho.replace('_', ' ')}
          </span>
          <span className={`text-[10px] uppercase font-bold px-2 py-0.5 rounded-full border ${statusCor}`}>
            {d.status}
          </span>
          {d.eh_previa && (
            <span className="text-[10px] uppercase font-bold px-2 py-0.5 rounded-full border border-sol/40 bg-sol/10 text-sol">
              👁️ PRÉVIA
            </span>
          )}
        </div>
        <span className="text-xs text-white/40">{dataFmt}</span>
      </div>

      {d.erro_mensagem && (
        <p className="text-xs text-coral mb-2">❌ {d.erro_mensagem}</p>
      )}

      {d.avisos && d.avisos.length > 0 && (
        <ul className="text-xs text-sol space-y-0.5 mb-2 pl-4 list-disc">
          {d.avisos.map((a, i) => <li key={i}>{a}</li>)}
        </ul>
      )}

      {d.status === 'pronto' && (
        <>
          {d.url_svg && (
            <div className="mt-3 p-2 bg-white rounded-lg overflow-auto max-h-[500px]">
              <img
                src={d.url_svg}
                alt={`Unifilar v${d.versao}`}
                className="w-full h-auto"
              />
            </div>
          )}
          <div className="flex flex-wrap gap-2 mt-3">
            {d.url_pdf && (
              <a href={d.url_pdf} target="_blank" rel="noreferrer" className="text-xs px-3 py-1.5 bg-white/5 border border-white/10 rounded-md text-white hover:bg-white/10">
                📄 PDF
              </a>
            )}
            {d.url_dxf && (
              <a href={d.url_dxf} target="_blank" rel="noreferrer" className="text-xs px-3 py-1.5 bg-white/5 border border-white/10 rounded-md text-white hover:bg-white/10">
                ✏️ DXF (AutoCAD)
              </a>
            )}
            {d.url_dwg && (
              <a href={d.url_dwg} target="_blank" rel="noreferrer" className="text-xs px-3 py-1.5 bg-white/5 border border-white/10 rounded-md text-white hover:bg-white/10">
                ✏️ DWG
              </a>
            )}
            {d.url_svg && (
              <a href={d.url_svg} target="_blank" rel="noreferrer" className="text-xs px-3 py-1.5 bg-white/5 border border-white/10 rounded-md text-white hover:bg-white/10">
                🖼️ SVG (abrir)
              </a>
            )}
          </div>
        </>
      )}
    </div>
  )
}
