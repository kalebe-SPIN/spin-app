'use client'

import { useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import {
  enviarDiagramaAction,
  excluirDiagramaAction,
} from '@/app/projetos/[id]/diagrama/actions'

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

type TipoDiagrama = 'unifilar_ongrid' | 'unifilar_hibrido' | 'padrao_entrada' | 'layout_instalacao'
type OpcaoTipo = { id: TipoDiagrama; label: string; desc: string }

type Props = {
  projeto: any
  diagramasExistentes: Diagrama[]
  configOk: boolean
  tiposDisponiveis: OpcaoTipo[]
}

export function GeradorDiagramaClient({ projeto, diagramasExistentes, configOk, tiposDisponiveis }: Props) {
  return (
    <div className="space-y-8">
      <BlocoUpload projetoId={projeto.id} configOk={configOk} tiposDisponiveis={tiposDisponiveis} />
      <BlocoVersoes diagramas={diagramasExistentes} />
    </div>
  )
}

function BlocoUpload({
  projetoId,
  configOk,
  tiposDisponiveis,
}: {
  projetoId: string
  configOk: boolean
  tiposDisponiveis: OpcaoTipo[]
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [erro, setErro] = useState<string | null>(null)
  const [sucesso, setSucesso] = useState<string | null>(null)
  const [tipoSelecionado, setTipoSelecionado] = useState<TipoDiagrama>(
    tiposDisponiveis[0]?.id || 'padrao_entrada',
  )
  const [pdfName, setPdfName] = useState<string>('')
  const [dxfName, setDxfName] = useState<string>('')
  const [svgName, setSvgName] = useState<string>('')
  const formRef = useRef<HTMLFormElement>(null)

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setErro(null)
    setSucesso(null)
    const formData = new FormData(e.currentTarget)
    formData.set('projeto_id', projetoId)
    formData.set('tipo_desenho', tipoSelecionado)
    startTransition(async () => {
      const r = await enviarDiagramaAction(formData)
      if (!r.sucesso) {
        setErro(r.erro || 'Erro no envio')
      } else {
        setSucesso(`✓ v${r.versao} enviada. Aparece embaixo em segundos.`)
        setPdfName(''); setDxfName(''); setSvgName('')
        formRef.current?.reset()
        router.refresh()
      }
    })
  }

  return (
    <section className="bg-white/[0.03] border border-white/10 rounded-xl p-6 space-y-6">
      <div>
        <h2 className="text-lg font-bold text-white mb-1">Enviar diagrama gerado localmente</h2>
        <p className="text-xs text-white/50">
          Os diagramas são desenhados pela skill <strong className="text-sol">projetista-spin</strong> no
          Claude Code local do Kalebe (motor Python — PDF via cairosvg + DXF via ezdxf). Envie aqui os
          arquivos gerados. O sistema calcula a próxima versão automaticamente.
        </p>
      </div>

      {/* Seletor de tipo */}
      <div>
        <label className="block text-xs uppercase tracking-wider text-white/40 font-bold mb-2">
          Qual desenho?
        </label>
        <div className={`grid gap-3 grid-cols-1 ${tiposDisponiveis.length > 1 ? 'md:grid-cols-2' : ''} ${tiposDisponiveis.length > 2 ? 'md:grid-cols-3' : ''}`}>
          {tiposDisponiveis.map(t => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTipoSelecionado(t.id)}
              className={`text-left p-3 rounded-lg border transition ${
                tipoSelecionado === t.id
                  ? 'bg-sol/15 border-sol/60'
                  : 'bg-white/[0.02] border-white/10 hover:border-white/20'
              }`}
            >
              <div className="flex items-center justify-between mb-1">
                <span className="font-bold text-white text-sm">{t.label}</span>
                {tipoSelecionado === t.id && <span className="text-sol">✓</span>}
              </div>
              <p className="text-[11px] text-white/60">{t.desc}</p>
            </button>
          ))}
        </div>
      </div>

      <form ref={formRef} onSubmit={handleSubmit} className="space-y-4">
        <FileInputRow
          nome="arquivo_pdf"
          label="PDF"
          obrigatorio
          accept="application/pdf,.pdf"
          exemploNome={pdfName}
          onFileName={setPdfName}
          hint="Prancha finalizada — o que vai pra CELESC"
        />
        <FileInputRow
          nome="arquivo_dxf"
          label="DXF (AutoCAD)"
          accept=".dxf"
          exemploNome={dxfName}
          onFileName={setDxfName}
          hint="Opcional — pra edição em AutoCAD/QCAD"
        />
        <FileInputRow
          nome="arquivo_svg"
          label="SVG"
          accept="image/svg+xml,.svg"
          exemploNome={svgName}
          onFileName={setSvgName}
          hint="Opcional — pra preview inline aqui na tela"
        />

        <div className="flex items-center justify-between gap-4 pt-2 border-t border-white/5">
          <div className="text-[10px] text-white/40">
            {!configOk && <span className="text-coral">⚠ Config empresa incompleta — cadastre RT antes.</span>}
          </div>
          <button
            type="submit"
            disabled={pending || !configOk || !pdfName}
            className="px-6 py-3 bg-sol text-noite font-bold text-sm rounded-lg disabled:opacity-40 disabled:cursor-not-allowed whitespace-nowrap"
          >
            {pending ? '⏳ Enviando…' : '📤 Enviar diagrama'}
          </button>
        </div>

        {erro && (
          <div className="bg-coral/10 border border-coral/30 rounded-lg p-3 text-sm text-coral">
            ❌ {erro}
          </div>
        )}
        {sucesso && (
          <div className="bg-verde/10 border border-verde/30 rounded-lg p-3 text-sm text-verde">
            {sucesso}
          </div>
        )}
      </form>
    </section>
  )
}

function FileInputRow({
  nome,
  label,
  obrigatorio,
  accept,
  exemploNome,
  onFileName,
  hint,
}: {
  nome: string
  label: string
  obrigatorio?: boolean
  accept: string
  exemploNome: string
  onFileName: (n: string) => void
  hint: string
}) {
  const id = `file-${nome}`
  return (
    <div className="flex items-start gap-3">
      <div className="min-w-[110px]">
        <label htmlFor={id} className="text-xs font-bold text-white">
          {label}
          {obrigatorio && <span className="text-coral ml-1">*</span>}
        </label>
        <p className="text-[10px] text-white/40">{hint}</p>
      </div>
      <div className="flex-1">
        <label
          htmlFor={id}
          className="flex items-center gap-2 px-3 py-2 bg-noite/60 border border-dashed border-white/20 rounded-lg cursor-pointer hover:border-sol/40 hover:bg-noite/80 transition"
        >
          <span className="text-xs text-white/60">
            {exemploNome ? '📎 ' + exemploNome : '＋ Escolher arquivo'}
          </span>
        </label>
        <input
          id={id}
          type="file"
          name={nome}
          accept={accept}
          required={obrigatorio}
          onChange={(e) => onFileName(e.currentTarget.files?.[0]?.name || '')}
          className="hidden"
        />
      </div>
    </div>
  )
}

function BlocoVersoes({ diagramas }: { diagramas: Diagrama[] }) {
  return (
    <section>
      <h2 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
        📁 Versões enviadas
        <span className="text-xs font-normal text-white/40">({diagramas.length})</span>
      </h2>
      {diagramas.length === 0 ? (
        <div className="text-sm text-white/40 py-6 text-center bg-white/[0.02] border border-dashed border-white/10 rounded-lg">
          Nenhum diagrama enviado ainda.
        </div>
      ) : (
        <div className="space-y-2">
          {diagramas.map(d => <DiagramaCard key={d.id} d={d} />)}
        </div>
      )}
    </section>
  )
}

function DiagramaCard({ d }: { d: Diagrama }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [erro, setErro] = useState<string | null>(null)

  const dataFmt = new Date(d.created_at).toLocaleString('pt-BR', {
    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
  })

  const statusCor =
    d.status === 'pronto' ? 'text-verde bg-verde/10 border-verde/30'
      : d.status === 'gerando' ? 'text-sol bg-sol/10 border-sol/30'
      : 'text-coral bg-coral/10 border-coral/30'

  function excluir() {
    if (!confirm(`Excluir v${d.versao} desse tipo? Apaga PDF, DXF e SVG do storage — não dá pra desfazer.`)) return
    setErro(null)
    startTransition(async () => {
      const res = await excluirDiagramaAction(d.id)
      if (!res.sucesso) setErro(res.erro || 'Falha ao excluir')
      else router.refresh()
    })
  }

  return (
    <div className="bg-white/[0.03] border border-white/10 rounded-lg p-4">
      <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
        <div className="flex items-center gap-3 flex-wrap">
          <span className="text-xs font-mono text-white/40">v{d.versao}</span>
          <span className="text-sm font-bold text-white capitalize">
            {d.tipo_desenho.replace('_', ' ')}
          </span>
          <span className={`text-[10px] uppercase font-bold px-2 py-0.5 rounded-full border ${statusCor}`}>
            {d.status}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-white/40">{dataFmt}</span>
          <button
            type="button"
            onClick={excluir}
            disabled={pending}
            aria-label="Excluir esta versão"
            title="Excluir esta versão"
            className="text-[10px] px-2 py-1 rounded border font-bold disabled:opacity-40 bg-coral/10 border-coral/30 text-coral hover:bg-coral/20"
          >
            🗑
          </button>
        </div>
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
              <img src={d.url_svg} alt={`${d.tipo_desenho} v${d.versao}`} className="w-full h-auto" />
            </div>
          )}
          {!d.url_svg && d.url_pdf && (
            <div className="mt-3 aspect-[297/210] w-full">
              <iframe src={d.url_pdf} title={`${d.tipo_desenho} v${d.versao}`} className="w-full h-full rounded border border-white/10" />
            </div>
          )}
          <div className="mt-3 flex flex-wrap gap-2">
            {d.url_pdf && (
              <a href={d.url_pdf} target="_blank" rel="noreferrer" className="text-xs px-3 py-1.5 bg-sol text-noite font-bold rounded-md">
                📄 Baixar PDF
              </a>
            )}
            {d.url_dxf && (
              <a href={d.url_dxf} target="_blank" rel="noreferrer" className="text-xs px-3 py-1.5 bg-weg-azul text-white font-bold rounded-md">
                ✏️ Baixar DXF
              </a>
            )}
            {d.url_svg && (
              <a href={d.url_svg} target="_blank" rel="noreferrer" className="text-xs px-3 py-1.5 bg-white/5 border border-white/10 rounded-md text-white hover:bg-white/10">
                🖼️ Abrir SVG
              </a>
            )}
          </div>
          <details className="text-[10px] text-white/40 mt-2">
            <summary className="cursor-pointer hover:text-white/60">💡 Preciso do DWG? (Autodesk)</summary>
            <p className="mt-1 text-white/50 leading-relaxed">
              O DWG é formato proprietário Autodesk. Baixa o DXF e converta grátis com o
              <a href="https://www.opendesign.com/guestfiles/oda_file_converter" target="_blank" rel="noreferrer" className="text-sol hover:underline"> ODA File Converter</a>
              — abre no AutoCAD 100% compatível.
            </p>
          </details>
        </>
      )}

      {erro && <p className="text-[10px] text-coral mt-2">⚠️ {erro}</p>}
    </div>
  )
}
