'use client'

import { useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

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

  const [filtroCategoria, setFiltroCategoria] = useState<string>('todos')
  const [filtroDatasheet, setFiltroDatasheet] = useState<'todos' | 'com' | 'sem'>('todos')
  const [busca, setBusca] = useState('')

  const produtosVisiveis = produtos.filter(p => {
    if (filtroCategoria !== 'todos' && p.categoria !== filtroCategoria) return false
    if (filtroDatasheet === 'com' && !p.url_datasheet) return false
    if (filtroDatasheet === 'sem' && p.url_datasheet) return false
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
        <h2 className="text-lg font-bold text-white mb-3">📄 Datasheets dos produtos</h2>

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
            <option value="todos">Todos</option>
            <option value="sem">Sem datasheet</option>
            <option value="com">Com datasheet</option>
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
            <ProdutoDatasheetRow key={p.id} produto={p} onUpload={enviarDatasheet} />
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

function ProdutoDatasheetRow({
  produto,
  onUpload,
}: {
  produto: Produto
  onUpload: (produtoId: string, codigoWeg: string, file: File) => Promise<void>
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [enviando, setEnviando] = useState(false)

  async function handleFile(f: File) {
    setEnviando(true)
    try {
      await onUpload(produto.id, produto.codigo_weg, f)
    } finally {
      setEnviando(false)
    }
  }

  return (
    <div className="bg-white/[0.02] border border-white/10 rounded p-2.5 flex items-center gap-3 text-xs">
      <span className="text-[10px] font-mono text-white/40 w-20">{produto.codigo_weg}</span>
      <span className="text-white/60 w-24 text-[10px] uppercase">{produto.categoria}</span>
      <span className="text-white flex-1 truncate">{produto.modelo}</span>

      {produto.url_datasheet ? (
        <>
          <a
            href={produto.url_datasheet}
            target="_blank"
            rel="noreferrer"
            className="text-[10px] text-verde hover:underline"
          >
            ✓ Ver PDF
          </a>
          <button
            onClick={() => inputRef.current?.click()}
            className="text-[10px] text-white/40 hover:text-white/60"
          >
            Trocar
          </button>
        </>
      ) : (
        <button
          onClick={() => inputRef.current?.click()}
          disabled={enviando}
          className="text-[10px] px-2 py-1 bg-sol/10 border border-sol/30 rounded text-sol hover:bg-sol/20 disabled:opacity-40"
        >
          {enviando ? '⏳ Enviando...' : '📤 Anexar'}
        </button>
      )}

      <input
        ref={inputRef}
        type="file"
        accept="application/pdf"
        className="hidden"
        onChange={e => {
          const f = e.target.files?.[0]
          if (f) handleFile(f)
          if (inputRef.current) inputRef.current.value = ''
        }}
      />
    </div>
  )
}
