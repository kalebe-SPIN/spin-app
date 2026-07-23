'use client'

import { useState, useTransition, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import {
  gerarDiagramaAction,
  regenerarDiagramaAction,
  excluirDiagramaAction,
} from '@/app/projetos/[id]/diagrama/actions'
import { baixarComoPdf, baixarComoDxf } from '@/lib/diagrama/converter-svg'

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

type TipoDiagrama = 'unifilar_ongrid' | 'unifilar_hibrido' | 'padrao_entrada'
type OpcaoTipo = { id: TipoDiagrama; label: string; desc: string }

type Props = {
  projeto: any
  diagramasExistentes: Diagrama[]
  configOk: boolean
  tiposDisponiveis: OpcaoTipo[]
}

export function GeradorDiagramaClient({ projeto, diagramasExistentes, configOk, tiposDisponiveis }: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [erro, setErro] = useState<string | null>(null)

  // Primeira opcao vira selecao inicial (sempre tem pelo menos padrao_entrada)
  const [tipoSelecionado, setTipoSelecionado] = useState<TipoDiagrama>(
    tiposDisponiveis[0]?.id || 'padrao_entrada',
  )

  // Auto-refresh a cada 5s enquanto houver diagrama em 'gerando'
  useEffect(() => {
    const temGerando = diagramasExistentes.some(d => d.status === 'gerando')
    if (!temGerando) return
    const interval = setInterval(() => router.refresh(), 5000)
    return () => clearInterval(interval)
  }, [diagramasExistentes, router])

  function handleGerar() {
    setErro(null)
    startTransition(async () => {
      const result = await gerarDiagramaAction(projeto.id, tipoSelecionado, { modoPrevia: false })
      if (!result.sucesso) {
        setErro(result.erro || 'Erro ao gerar diagrama')
      } else {
        router.refresh()
      }
    })
  }

  return (
    <div className="space-y-8">
      {/* Escolha do tipo — só mostra opções que fazem sentido pro projeto */}
      <section className="bg-white/[0.03] border border-white/10 rounded-xl p-6">
        <h2 className="text-lg font-bold text-white mb-1">Qual desenho gerar?</h2>
        <p className="text-xs text-white/50 mb-4">
          Opções filtradas pelos itens deste projeto. Padrão de entrada sempre disponível.
        </p>
        <div className={`grid gap-3 grid-cols-1 ${tiposDisponiveis.length > 1 ? 'md:grid-cols-2' : ''} ${tiposDisponiveis.length > 2 ? 'md:grid-cols-3' : ''}`}>
          {tiposDisponiveis.map(t => (
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
            <button
              onClick={handleGerar}
              disabled={isPending || !configOk}
              className="px-6 py-3 bg-sol text-noite font-bold text-sm rounded-lg disabled:opacity-40 disabled:cursor-not-allowed whitespace-nowrap"
              title="Gera nova versão do diagrama com os dados atuais do projeto"
            >
              {isPending ? '⏳ Gerando...' : '🖨️ Gerar diagrama'}
            </button>
          </div>
        </div>

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

function BotoesDownload({ urlSvg, nomeBase }: { urlSvg: string; nomeBase: string }) {
  const [baixando, setBaixando] = useState<'pdf' | 'dxf' | null>(null)
  const [erro, setErro] = useState<string | null>(null)

  async function baixar(tipo: 'pdf' | 'dxf') {
    setErro(null)
    setBaixando(tipo)
    try {
      if (tipo === 'pdf') await baixarComoPdf(urlSvg, `${nomeBase}.pdf`)
      else await baixarComoDxf(urlSvg, `${nomeBase}.dxf`)
    } catch (e: any) {
      setErro(e.message || 'Erro ao converter')
    } finally {
      setBaixando(null)
    }
  }

  return (
    <div className="mt-3 space-y-2">
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => baixar('pdf')}
          disabled={baixando !== null}
          className="text-xs px-3 py-1.5 bg-sol text-noite font-bold rounded-md disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {baixando === 'pdf' ? '⏳ Gerando PDF...' : '📄 Baixar PDF'}
        </button>
        <button
          type="button"
          onClick={() => baixar('dxf')}
          disabled={baixando !== null}
          className="text-xs px-3 py-1.5 bg-weg-azul text-white font-bold rounded-md disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {baixando === 'dxf' ? '⏳ Convertendo...' : '✏️ Baixar DXF (AutoCAD)'}
        </button>
        <a
          href={urlSvg}
          target="_blank"
          rel="noreferrer"
          className="text-xs px-3 py-1.5 bg-white/5 border border-white/10 rounded-md text-white hover:bg-white/10"
        >
          🖼️ Abrir SVG
        </a>
      </div>
      {erro && (
        <p className="text-[10px] text-coral">⚠️ {erro}</p>
      )}
      <details className="text-[10px] text-white/40 mt-1">
        <summary className="cursor-pointer hover:text-white/60">💡 Preciso do DWG? (Autodesk)</summary>
        <p className="mt-1 text-white/50 leading-relaxed">
          O DWG é formato proprietário Autodesk. Baixa o DXF acima e converta grátis com o
          <a href="https://www.opendesign.com/guestfiles/oda_file_converter" target="_blank" rel="noreferrer"
             className="text-sol hover:underline"> ODA File Converter</a>
          — abre no AutoCAD 100% compatível.
        </p>
      </details>
    </div>
  )
}

function DiagramaCard({ d }: { d: Diagrama }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [mostrarRefino, setMostrarRefino] = useState(false)
  const [instrucao, setInstrucao] = useState('')
  const [erro, setErro] = useState<string | null>(null)

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

  function regenerar(instrucaoAjuste?: string) {
    setErro(null)
    startTransition(async () => {
      const res = await regenerarDiagramaAction(d.id, instrucaoAjuste)
      if (!res.sucesso) setErro(res.erro || 'Falha ao regenerar')
      else {
        setInstrucao('')
        setMostrarRefino(false)
        router.refresh()
      }
    })
  }

  function excluir() {
    if (!confirm(`Excluir v${d.versao} desse tipo? Não dá pra desfazer.`)) return
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
          <BotaoAcaoDiagrama
            titulo={d.status === 'pronto' ? '✏️ Refinar' : '🔄 Tentar de novo'}
            onClick={() => setMostrarRefino(!mostrarRefino)}
            disabled={pending}
            cor={d.status === 'pronto' ? 'sol' : 'weg-azul'}
          />
          <BotaoAcaoDiagrama
            titulo="🗑"
            onClick={excluir}
            disabled={pending}
            cor="coral"
            aria="Excluir esta versão"
          />
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

      {/* Campo de refinamento */}
      {mostrarRefino && (
        <div className="mt-3 p-3 bg-sol/5 border border-sol/30 rounded-lg">
          <p className="text-xs font-bold text-sol mb-2">
            {d.status === 'pronto' ? '✏️ O que ajustar nessa versão?' : '🔄 Regenerar diagrama'}
          </p>
          {d.status === 'pronto' && (
            <textarea
              value={instrucao}
              onChange={(e) => setInstrucao(e.target.value)}
              rows={3}
              placeholder="Ex: Aumentar espaço entre inversor e módulos, adicionar disjuntor 50A, corrigir tensão pra 380V trifásico..."
              className="w-full px-2 py-1.5 bg-noite border border-white/15 rounded text-white text-xs placeholder:text-white/30 mb-2"
            />
          )}
          {d.status !== 'pronto' && (
            <p className="text-[10px] text-white/60 mb-2">
              Gera uma nova versão do mesmo tipo — útil quando deu erro transitório do Claude.
            </p>
          )}
          <div className="flex items-center gap-2">
            <button
              onClick={() => regenerar(instrucao.trim() || undefined)}
              disabled={pending || (d.status === 'pronto' && !instrucao.trim())}
              className="px-3 py-1.5 bg-sol text-noite text-xs font-bold rounded hover:bg-sol/90 disabled:opacity-40"
            >
              {pending ? '⏳ Gerando...' : d.status === 'pronto' ? '🚀 Gerar refinada' : '🔄 Tentar de novo'}
            </button>
            <button
              onClick={() => { setMostrarRefino(false); setInstrucao('') }}
              disabled={pending}
              className="px-3 py-1.5 bg-white/5 border border-white/10 text-white/70 text-xs rounded hover:bg-white/10"
            >
              Cancelar
            </button>
          </div>
          {erro && <p className="text-[10px] text-coral mt-2">⚠️ {erro}</p>}
        </div>
      )}

      {!mostrarRefino && erro && (
        <p className="text-[10px] text-coral mt-2">⚠️ {erro}</p>
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
          {d.url_svg && (
            <BotoesDownload urlSvg={d.url_svg} nomeBase={`unifilar-${d.tipo_desenho}-v${d.versao}`} />
          )}
        </>
      )}
    </div>
  )
}

function BotaoAcaoDiagrama({
  titulo, onClick, disabled, cor, aria,
}: {
  titulo: string
  onClick: () => void
  disabled?: boolean
  cor: 'sol' | 'coral' | 'weg-azul'
  aria?: string
}) {
  const cores: Record<string, string> = {
    sol: 'bg-sol/10 border-sol/30 text-sol hover:bg-sol/20',
    coral: 'bg-coral/10 border-coral/30 text-coral hover:bg-coral/20',
    'weg-azul': 'bg-weg-azul/10 border-weg-azul/30 text-weg-azul hover:bg-weg-azul/20',
  }
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={aria}
      title={aria}
      className={`text-[10px] px-2 py-1 rounded border font-bold disabled:opacity-40 disabled:cursor-not-allowed transition ${cores[cor]}`}
    >
      {titulo}
    </button>
  )
}
