'use client'

import { useState, useRef, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { togglarAtivoProdutoAction } from '@/app/admin/catalogo/actions'

type HistoricoItem = {
  id: string
  tipo: string
  arquivo_nome_original: string
  status: string
  produtos_atualizados: number
  produtos_criados: number
  erro_mensagem: string | null
  created_at: string
  processado_em: string | null
}

type Produto = {
  id: string
  codigo_weg: string
  modelo: string
  categoria: string
  subcategoria: string | null
  url_datasheet: string | null
  url_imagem: string | null
  ativo: boolean
  specs: any
}

type Props = {
  historico: HistoricoItem[]
  produtos: Produto[]
}

export function CatalogoClient({ historico, produtos }: Props) {
  const router = useRouter()
  const [enviandoPlanilha, setEnviandoPlanilha] = useState(false)
  const [enviandoEstoque, setEnviandoEstoque] = useState(false)
  const [resultado, setResultado] = useState<string | null>(null)
  const [erro, setErro] = useState<string | null>(null)

  const inputPlanilhaRef = useRef<HTMLInputElement>(null)
  const inputEstoqueRef = useRef<HTMLInputElement>(null)

  async function enviarPlanilha(file: File) {
    setEnviandoPlanilha(true)
    setErro(null)
    setResultado(null)
    try {
      const formData = new FormData()
      formData.append('arquivo', file)
      const res = await fetch('/api/importar-planilha-weg', { method: 'POST', body: formData })
      const json = await res.json()
      if (!res.ok) throw new Error(json.erro || 'Erro ao processar')
      setResultado(`✅ Planilha processada: ${json.produtos_criados} novos + ${json.produtos_atualizados} atualizados = ${json.total_processados} produtos.`)
      router.refresh()
    } catch (e: any) {
      setErro(e.message || 'Falha ao processar planilha')
    } finally {
      setEnviandoPlanilha(false)
    }
  }

  async function enviarEstoque(file: File) {
    setEnviandoEstoque(true)
    setErro(null)
    setResultado(null)
    try {
      const formData = new FormData()
      formData.append('arquivo', file)
      const res = await fetch('/api/atualizar-estoque', { method: 'POST', body: formData })
      const json = await res.json()
      if (!res.ok) throw new Error(json.erro || 'Erro ao processar')
      setResultado(`✅ Estoque atualizado: ${json.produtos_atualizados} produtos afetados (${json.total_skus_no_pdf} SKUs no PDF).`)
      router.refresh()
    } catch (e: any) {
      setErro(e.message || 'Falha ao atualizar estoque')
    } finally {
      setEnviandoEstoque(false)
    }
  }

  async function enviarDatasheet(produtoId: string, codigoWeg: string, file: File) {
    setErro(null)
    setResultado(null)
    try {
      const supabase = createClient()
      const path = `${codigoWeg}-${Date.now()}.pdf`
      const { error: upErr } = await supabase.storage
        .from('datasheets')
        .upload(path, file, { contentType: 'application/pdf', upsert: true })
      if (upErr) throw upErr
      const { data: urlData } = supabase.storage.from('datasheets').getPublicUrl(path)
      const publicUrl = urlData.publicUrl

      const { error: updErr } = await supabase
        .from('produtos')
        .update({ url_datasheet: publicUrl })
        .eq('id', produtoId)
      if (updErr) throw updErr

      setResultado(`✅ Datasheet ${codigoWeg} anexado.`)
      router.refresh()
    } catch (e: any) {
      setErro(e.message || 'Falha ao anexar datasheet')
    }
  }

  async function enviarImagem(produtoId: string, codigoWeg: string, file: File) {
    setErro(null)
    setResultado(null)
    try {
      const supabase = createClient()
      const ext = file.name.split('.').pop()?.toLowerCase() || 'png'
      if (!['png', 'jpg', 'jpeg', 'webp'].includes(ext)) {
        throw new Error('Formato não aceito. Use PNG, JPG ou WEBP.')
      }
      const path = `${codigoWeg}-${Date.now()}.${ext}`
      const { error: upErr } = await supabase.storage
        .from('produtos-imagens')
        .upload(path, file, { contentType: file.type, upsert: true })
      if (upErr) throw upErr
      const { data: urlData } = supabase.storage.from('produtos-imagens').getPublicUrl(path)
      const publicUrl = urlData.publicUrl

      const { error: updErr } = await supabase
        .from('produtos')
        .update({ url_imagem: publicUrl })
        .eq('id', produtoId)
      if (updErr) throw updErr

      setResultado(`🖼️ Imagem ${codigoWeg} anexada.`)
      router.refresh()
    } catch (e: any) {
      setErro(e.message || 'Falha ao anexar imagem')
    }
  }

  const [filtroCategoria, setFiltroCategoria] = useState<string>('todos')
  const [filtroDatasheet, setFiltroDatasheet] = useState<'todos' | 'com' | 'sem'>('todos')
  const [filtroAtivo, setFiltroAtivo] = useState<'todos' | 'ativos' | 'inativos'>('ativos')
  const [busca, setBusca] = useState('')

  const produtosVisiveis = produtos.filter(p => {
    if (filtroCategoria !== 'todos' && p.categoria !== filtroCategoria) return false
    if (filtroDatasheet === 'com' && !p.url_datasheet) return false
    if (filtroDatasheet === 'sem' && p.url_datasheet) return false
    if (filtroAtivo === 'ativos' && !p.ativo) return false
    if (filtroAtivo === 'inativos' && p.ativo) return false
    if (busca) {
      const q = busca.toLowerCase()
      if (!p.modelo.toLowerCase().includes(q) && !p.codigo_weg.includes(q)) return false
    }
    return true
  })

  return (
    <div className="space-y-8">
      {/* Uploads principais */}
      <section className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Planilha */}
        <div className="bg-white/[0.03] border border-white/10 rounded-xl p-6">
          <div className="flex items-center gap-3 mb-3">
            <span className="text-3xl">📊</span>
            <div>
              <h2 className="text-lg font-bold text-white">Planilha de preços WEG</h2>
              <p className="text-xs text-white/50">Excel .xlsx — atualiza produtos + preços vigentes</p>
            </div>
          </div>
          <input
            ref={inputPlanilhaRef}
            type="file"
            accept=".xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            className="hidden"
            onChange={e => {
              const f = e.target.files?.[0]
              if (f) enviarPlanilha(f)
              if (inputPlanilhaRef.current) inputPlanilhaRef.current.value = ''
            }}
          />
          <button
            onClick={() => inputPlanilhaRef.current?.click()}
            disabled={enviandoPlanilha}
            className="w-full p-4 border-2 border-dashed border-white/20 rounded-lg text-center hover:border-sol/40 hover:bg-white/[0.02] transition disabled:opacity-40"
          >
            {enviandoPlanilha ? (
              <p className="text-sm text-sol">⏳ Processando planilha... (~15-30s)</p>
            ) : (
              <>
                <p className="text-sm font-bold text-white">📤 Escolher arquivo Excel</p>
                <p className="text-xs text-white/40 mt-1">Aba lida: "Composição Preços"</p>
              </>
            )}
          </button>
        </div>

        {/* PDF estoque */}
        <div className="bg-white/[0.03] border border-white/10 rounded-xl p-6">
          <div className="flex items-center gap-3 mb-3">
            <span className="text-3xl">📦</span>
            <div>
              <h2 className="text-lg font-bold text-white">Informativo de estoque WEG</h2>
              <p className="text-xs text-white/50">PDF — marca 🟢 disponível / 🔴 indisponível</p>
            </div>
          </div>
          <input
            ref={inputEstoqueRef}
            type="file"
            accept="application/pdf"
            className="hidden"
            onChange={e => {
              const f = e.target.files?.[0]
              if (f) enviarEstoque(f)
              if (inputEstoqueRef.current) inputEstoqueRef.current.value = ''
            }}
          />
          <button
            onClick={() => inputEstoqueRef.current?.click()}
            disabled={enviandoEstoque}
            className="w-full p-4 border-2 border-dashed border-white/20 rounded-lg text-center hover:border-sol/40 hover:bg-white/[0.02] transition disabled:opacity-40"
          >
            {enviandoEstoque ? (
              <p className="text-sm text-sol">⏳ Processando PDF...</p>
            ) : (
              <>
                <p className="text-sm font-bold text-white">📤 Escolher PDF</p>
                <p className="text-xs text-white/40 mt-1">Lê códigos SAP + status por linha</p>
              </>
            )}
          </button>
        </div>
      </section>

      {(resultado || erro) && (
        <div className={`p-4 rounded-lg border text-sm ${erro ? 'bg-coral/10 border-coral/30 text-coral' : 'bg-verde/10 border-verde/30 text-verde'}`}>
          {erro || resultado}
        </div>
      )}

      {/* Histórico */}
      <section>
        <h2 className="text-lg font-bold text-white mb-3">📜 Histórico de uploads</h2>
        {historico.length === 0 ? (
          <p className="text-xs text-white/40">Nenhum upload registrado ainda.</p>
        ) : (
          <div className="space-y-2">
            {historico.map(h => (
              <HistoricoRow key={h.id} item={h} />
            ))}
          </div>
        )}
      </section>

      {/* Datasheets individuais */}
      <section>
        <h2 className="text-lg font-bold text-white mb-3">📄 Produtos do catálogo</h2>
        <p className="text-xs text-white/50 mb-4">
          Para cada produto: anexar <strong className="text-white/80">datasheet PDF</strong>, <strong className="text-white/80">imagem PNG</strong>,
          ligar/desligar do <strong className="text-white/80">simulador de kits</strong>, ou ver <strong className="text-sol">pontos críticos elétricos</strong> extraídos do datasheet.
        </p>

        {/* Filtros */}
        <div className="flex flex-wrap gap-3 mb-4">
          <select
            value={filtroCategoria}
            onChange={e => setFiltroCategoria(e.target.value)}
            className="px-3 py-2 bg-white/[0.03] border border-white/10 rounded text-sm text-white"
          >
            <option value="todos">Todas categorias</option>
            <option value="placa">Placas</option>
            <option value="inversor">Inversores</option>
            <option value="monitoramento">Monitoramento</option>
          </select>

          <select
            value={filtroDatasheet}
            onChange={e => setFiltroDatasheet(e.target.value as any)}
            className="px-3 py-2 bg-white/[0.03] border border-white/10 rounded text-sm text-white"
          >
            <option value="todos">Datasheet: Todos</option>
            <option value="sem">Sem datasheet</option>
            <option value="com">Com datasheet</option>
          </select>

          <select
            value={filtroAtivo}
            onChange={e => setFiltroAtivo(e.target.value as any)}
            className="px-3 py-2 bg-white/[0.03] border border-white/10 rounded text-sm text-white"
          >
            <option value="ativos">🟢 Só ativos</option>
            <option value="inativos">⚫ Só inativos</option>
            <option value="todos">Todos</option>
          </select>

          <input
            type="text"
            value={busca}
            onChange={e => setBusca(e.target.value)}
            placeholder="Buscar modelo ou SKU"
            className="flex-1 min-w-[200px] px-3 py-2 bg-white/[0.03] border border-white/10 rounded text-sm text-white placeholder:text-white/30"
          />

          <span className="text-xs text-white/40 self-center">
            {produtosVisiveis.length} de {produtos.length}
          </span>
        </div>

        <div className="space-y-1.5">
          {produtosVisiveis.map(p => (
            <ProdutoRow
              key={p.id}
              produto={p}
              onUploadDatasheet={enviarDatasheet}
              onUploadImagem={enviarImagem}
              onErro={setErro}
              onSucesso={setResultado}
            />
          ))}
        </div>
      </section>
    </div>
  )
}

function HistoricoRow({ item }: { item: HistoricoItem }) {
  const data = new Date(item.created_at).toLocaleString('pt-BR', {
    day: '2-digit', month: '2-digit', year: '2-digit',
    hour: '2-digit', minute: '2-digit',
  })
  const tipoLabel = item.tipo === 'planilha_precos' ? '📊 Planilha' : item.tipo === 'pdf_estoque' ? '📦 Estoque' : '📄 Datasheet'
  const statusCor = item.status === 'concluido' ? 'text-verde bg-verde/10 border-verde/30'
    : item.status === 'processando' ? 'text-sol bg-sol/10 border-sol/30'
    : 'text-coral bg-coral/10 border-coral/30'

  return (
    <div className="bg-white/[0.02] border border-white/10 rounded-lg p-3 flex items-center gap-3 text-xs">
      <span className="text-[10px] text-white/40 font-mono w-20">{data}</span>
      <span className="text-white/60 w-24">{tipoLabel}</span>
      <span className="text-white/80 flex-1 truncate">{item.arquivo_nome_original}</span>
      <span className={`text-[10px] uppercase font-bold px-2 py-0.5 rounded border ${statusCor}`}>
        {item.status}
      </span>
      {item.status === 'concluido' && (
        <span className="text-[10px] text-white/60">
          {item.produtos_criados > 0 && <>+{item.produtos_criados} novos · </>}
          {item.produtos_atualizados > 0 && <>✎ {item.produtos_atualizados}</>}
        </span>
      )}
      {item.erro_mensagem && (
        <span className="text-[10px] text-coral truncate max-w-xs">{item.erro_mensagem}</span>
      )}
    </div>
  )
}

function ProdutoRow({
  produto,
  onUploadDatasheet,
  onUploadImagem,
  onErro,
  onSucesso,
}: {
  produto: Produto
  onUploadDatasheet: (produtoId: string, codigoWeg: string, file: File) => Promise<void>
  onUploadImagem: (produtoId: string, codigoWeg: string, file: File) => Promise<void>
  onErro: (msg: string | null) => void
  onSucesso: (msg: string | null) => void
}) {
  const inputPdfRef = useRef<HTMLInputElement>(null)
  const inputImgRef = useRef<HTMLInputElement>(null)
  const [enviandoPdf, setEnviandoPdf] = useState(false)
  const [enviandoImg, setEnviandoImg] = useState(false)
  const [ativoLocal, setAtivoLocal] = useState(produto.ativo)
  const [mostrarSpecs, setMostrarSpecs] = useState(false)
  const [pending, startTransition] = useTransition()

  async function handlePdf(f: File) {
    setEnviandoPdf(true)
    try { await onUploadDatasheet(produto.id, produto.codigo_weg, f) }
    finally { setEnviandoPdf(false) }
  }
  async function handleImg(f: File) {
    setEnviandoImg(true)
    try { await onUploadImagem(produto.id, produto.codigo_weg, f) }
    finally { setEnviandoImg(false) }
  }

  function togglarAtivo() {
    startTransition(async () => {
      const novoStatus = !ativoLocal
      setAtivoLocal(novoStatus)
      const res = await togglarAtivoProdutoAction(produto.id, novoStatus)
      if ('erro' in res && res.erro) {
        setAtivoLocal(!novoStatus)
        onErro(res.erro)
      } else {
        onSucesso(novoStatus ? `🟢 ${produto.modelo} ATIVADO no simulador de kits` : `⚫ ${produto.modelo} desativado`)
      }
    })
  }

  const opacityClass = ativoLocal ? '' : 'opacity-50'

  return (
    <div>
      <div className={`bg-white/[0.02] border rounded p-2.5 flex items-center gap-3 text-xs transition-all ${
        ativoLocal ? 'border-white/10' : 'border-white/5 bg-white/[0.01]'
      } ${opacityClass}`}>
        {/* Toggle ativo/inativo */}
        <button
          onClick={togglarAtivo}
          disabled={pending}
          title={ativoLocal ? 'Ativo — aparece nos kits. Clica pra desativar.' : 'Inativo — não aparece nos kits. Clica pra ativar.'}
          className={`shrink-0 w-9 h-5 rounded-full transition-all relative ${
            ativoLocal ? 'bg-verde' : 'bg-white/10'
          } ${pending ? 'opacity-50' : 'hover:opacity-80'}`}
        >
          <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all ${
            ativoLocal ? 'left-4' : 'left-0.5'
          }`} />
        </button>

        {/* Miniatura da imagem se houver */}
        {produto.url_imagem ? (
          <img
            src={produto.url_imagem}
            alt={produto.modelo}
            className="shrink-0 w-10 h-10 object-contain bg-white/[0.02] border border-white/10 rounded"
          />
        ) : (
          <div className="shrink-0 w-10 h-10 border border-dashed border-white/10 rounded flex items-center justify-center text-white/20 text-lg">
            🖼️
          </div>
        )}

        <span className="text-[10px] font-mono text-white/40 w-20 shrink-0">{produto.codigo_weg}</span>
        <span className="text-white/60 w-24 text-[10px] uppercase shrink-0">{produto.categoria}</span>
        <span className="text-white flex-1 truncate">{produto.modelo}</span>

        {/* Botão Pontos Críticos */}
        <button
          onClick={() => setMostrarSpecs(!mostrarSpecs)}
          title="Ver pontos críticos elétricos do datasheet"
          className={`shrink-0 text-[10px] px-2 py-1 rounded border transition ${
            mostrarSpecs
              ? 'bg-sol/20 border-sol/40 text-sol'
              : 'bg-white/[0.02] border-white/10 text-white/60 hover:border-sol/30 hover:text-sol'
          }`}
        >
          ⚡ Pontos críticos
        </button>

        {/* Botão Datasheet PDF */}
        {produto.url_datasheet ? (
          <div className="flex items-center gap-1 shrink-0">
            <a
              href={produto.url_datasheet}
              target="_blank"
              rel="noreferrer"
              className="text-[10px] text-verde hover:underline"
            >
              📄 Ver PDF
            </a>
            <button
              onClick={() => inputPdfRef.current?.click()}
              className="text-[10px] text-white/40 hover:text-white/60"
            >
              trocar
            </button>
          </div>
        ) : (
          <button
            onClick={() => inputPdfRef.current?.click()}
            disabled={enviandoPdf}
            className="shrink-0 text-[10px] px-2 py-1 bg-sol/10 border border-sol/30 rounded text-sol hover:bg-sol/20 disabled:opacity-40"
          >
            {enviandoPdf ? '⏳' : '📄 PDF'}
          </button>
        )}

        {/* Botão Imagem PNG */}
        <button
          onClick={() => inputImgRef.current?.click()}
          disabled={enviandoImg}
          className={`shrink-0 text-[10px] px-2 py-1 rounded border disabled:opacity-40 ${
            produto.url_imagem
              ? 'bg-verde/10 border-verde/30 text-verde hover:bg-verde/20'
              : 'bg-weg-azul/10 border-weg-azul/30 text-weg-azul hover:bg-weg-azul/20'
          }`}
          title={produto.url_imagem ? 'Trocar imagem' : 'Anexar imagem PNG'}
        >
          {enviandoImg ? '⏳' : produto.url_imagem ? '🖼️ ✓' : '🖼️ PNG'}
        </button>

        <input
          ref={inputPdfRef}
          type="file"
          accept="application/pdf"
          className="hidden"
          onChange={e => {
            const f = e.target.files?.[0]
            if (f) handlePdf(f)
            if (inputPdfRef.current) inputPdfRef.current.value = ''
          }}
        />
        <input
          ref={inputImgRef}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          className="hidden"
          onChange={e => {
            const f = e.target.files?.[0]
            if (f) handleImg(f)
            if (inputImgRef.current) inputImgRef.current.value = ''
          }}
        />
      </div>

      {/* Painel expansível de Pontos Críticos */}
      {mostrarSpecs && (
        <PontosCriticosPainel produto={produto} onFechar={() => setMostrarSpecs(false)} />
      )}
    </div>
  )
}

function PontosCriticosPainel({ produto, onFechar }: { produto: Produto; onFechar: () => void }) {
  const specs = produto.specs || {}
  const linhas = extrairPontosCriticos(produto.categoria, specs)

  return (
    <div className="ml-16 mt-1 mb-2 p-4 bg-sol/5 border border-sol/20 rounded-lg">
      <div className="flex items-start justify-between mb-3">
        <div>
          <p className="text-xs font-bold text-sol uppercase tracking-wider">⚡ Pontos críticos elétricos</p>
          <p className="text-[10px] text-white/50">
            {produto.modelo} · {produto.codigo_weg} · extraído do datasheet
          </p>
        </div>
        <div className="flex items-center gap-2">
          {produto.url_datasheet && (
            <a
              href={produto.url_datasheet}
              target="_blank"
              rel="noreferrer"
              className="text-[10px] px-2 py-1 bg-verde/10 border border-verde/30 rounded text-verde hover:bg-verde/20"
            >
              📄 Datasheet completo
            </a>
          )}
          <button
            onClick={onFechar}
            className="text-[10px] text-white/40 hover:text-white/70"
          >
            ✕ Fechar
          </button>
        </div>
      </div>

      {linhas.length === 0 ? (
        <p className="text-xs text-white/50 italic">
          Nenhuma especificação técnica cadastrada. Anexe o datasheet e importe pelo Excel WEG.
        </p>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
          {linhas.map(({ label, valor, destaque }) => (
            <div
              key={label}
              className={`bg-noite/50 border rounded p-2 ${
                destaque ? 'border-sol/40' : 'border-white/10'
              }`}
            >
              <p className="text-[9px] uppercase tracking-wider text-white/40">{label}</p>
              <p className={`text-sm font-bold ${destaque ? 'text-sol' : 'text-white'}`}>{valor}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

/**
 * Extrai os pontos críticos elétricos por categoria a partir do JSONB specs.
 * "destaque=true" pra os campos mais importantes que impactam dimensionamento.
 */
function extrairPontosCriticos(
  categoria: string,
  specs: any,
): Array<{ label: string; valor: string; destaque?: boolean }> {
  if (!specs || typeof specs !== 'object') return []
  const linhas: Array<{ label: string; valor: string; destaque?: boolean }> = []

  const fmt = (n: any, unidade = '') => {
    if (n == null || n === '') return null
    if (typeof n === 'number') return `${n}${unidade}`
    return `${n}${unidade}`
  }
  const add = (label: string, valor: any, destaque = false) => {
    if (valor == null || valor === '' || valor === undefined) return
    linhas.push({ label, valor: String(valor), destaque })
  }

  if (categoria === 'placa') {
    add('Potência (Wp)', fmt(specs.potencia_w, ' Wp'), true)
    add('Tensão circuito aberto (Voc)', fmt(specs.voc_v, ' V'), true)
    add('Tensão máx. potência (Vmp)', fmt(specs.vmp_v, ' V'))
    add('Corrente curto-circuito (Isc)', fmt(specs.isc_a, ' A'), true)
    add('Corrente máx. potência (Imp)', fmt(specs.imp_a, ' A'))
    add('Eficiência', fmt(specs.eficiencia_perc, '%'))
    add('Tecnologia', specs.tecnologia)
    if (specs.dimensoes_mm) {
      const d = specs.dimensoes_mm
      add('Dimensões (LxCxH)', `${d.l || '—'} × ${d.c || '—'} × ${d.h || '—'} mm`)
    }
    add('Peso', fmt(specs.peso_kg, ' kg'))
    add('Garantia produto', fmt(specs.garantia_produto_anos, ' anos'))
    add('Garantia geração', fmt(specs.garantia_geracao_anos, ' anos'))
    add('Inmetro', specs.classe_a_inmetro ? 'Classe A' : specs.certificacao_inmetro || '—')
  } else if (categoria === 'inversor') {
    add('Potência CA nominal', fmt(specs.potencia_nominal_ca_kw, ' kW'), true)
    add('Potência CC máx.', fmt(specs.potencia_max_cc_kwp, ' kWp'), true)
    add('Qtd. MPPTs', specs.qtd_mppt, true)
    add('Entradas por MPPT', specs.qtd_entradas_por_mppt)
    add('Tensão partida', fmt(specs.tensao_partida_v, ' V'))
    if (specs.faixa_mppt_v) {
      const f = specs.faixa_mppt_v
      add('Faixa MPPT', `${f.min || '—'} – ${f.max || '—'} V`, true)
    }
    add('Tensão CC máx.', fmt(specs.tensao_max_cc_v, ' V'), true)
    add('Corrente máx MPPT', fmt(specs.corrente_max_mppt_a, ' A'))
    add('Tensão saída', specs.tensao_saida)
    add('Fases', specs.fases)
    add('Eficiência máx.', fmt(specs.eficiencia_max_perc, '%'))
    add('Grau proteção', specs.ip_protecao)
    add('Garantia', fmt(specs.garantia_anos, ' anos'))
    add('Suporta BESS', specs.suporta_bess ? 'SIM' : 'NÃO')
    add('Anti-injeção', specs.tem_anti_injecao ? 'SIM' : 'NÃO')
    if (Array.isArray(specs.comunicacao) && specs.comunicacao.length > 0) {
      add('Comunicação', specs.comunicacao.join(', '))
    }
  } else if (categoria === 'bateria') {
    add('Capacidade', fmt(specs.capacidade_kwh, ' kWh'), true)
    add('Potência', fmt(specs.potencia_kw, ' kW'), true)
    add('Tensão', fmt(specs.tensao_v, ' V'))
    add('Tecnologia', specs.tecnologia, true)
    add('Ciclos garantidos', specs.ciclos_garantidos)
    add('C-Rate', specs.c_rate)
    add('Eficiência round-trip', fmt(specs.eficiencia_round_trip_perc, '%'))
    add('Vida útil', fmt(specs.tempo_vida_anos, ' anos'))
    add('Garantia', fmt(specs.garantia_anos, ' anos'))
    add('Grau proteção', specs.ip_protecao)
  } else if (categoria === 'disjuntor') {
    add('Corrente', fmt(specs.corrente_a, ' A'), true)
    add('Polos', specs.polos, true)
    add('Curva', specs.curva)
    add('Tensão', fmt(specs.tensao_v, ' V'))
  } else if (categoria === 'dps') {
    add('Classe', specs.classe, true)
    add('Corrente máx.', fmt(specs.corrente_max_a, ' kA'), true)
    add('Tensão', fmt(specs.tensao_v, ' V'))
  } else if (categoria === 'cabo') {
    add('Bitola', fmt(specs.bitola_mm2, ' mm²'), true)
    add('Isolação', specs.isolacao, true)
    add('Tensão máx.', fmt(specs.tensao_max_v, ' V'))
    add('Cor', specs.cor)
    add('Embalagem', fmt(specs.embalagem_m, ' m'))
  } else {
    // Generico — despeja tudo que tiver
    for (const [k, v] of Object.entries(specs)) {
      if (v == null || v === '' || typeof v === 'object') continue
      add(k.replace(/_/g, ' '), v)
    }
  }

  return linhas
}
