'use client'

import { useState, useRef, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { togglarAtivoProdutoAction, criarProdutoManualAction, type CategoriaProduto } from '@/app/admin/catalogo/actions'
import { EditarProdutoModal, type ProdutoParaEdicao } from '@/components/EditarProdutoModal'
import { CadastroDatasheetModal } from '@/components/CadastroDatasheetModal'

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
  porCategoria?: Record<string, number>
}

/** Categorias que podem aparecer nos badges — bate com o enum categoria_principal + filtro do dropdown. */
const CATEGORIA_INFO: Record<string, { label: string; emoji: string; cor: string }> = {
  placa:         { label: 'Placas',         emoji: '☀️', cor: 'text-sol       bg-sol/10       border-sol/30' },
  inversor:      { label: 'Inversores',    emoji: '⚡', cor: 'text-weg-azul  bg-weg-azul/10  border-weg-azul/30' },
  bateria:       { label: 'Baterias',       emoji: '🔋', cor: 'text-verde    bg-verde/10     border-verde/30' },
  estrutura:     { label: 'Estruturas',     emoji: '🏗️', cor: 'text-white/70 bg-white/10     border-white/20' },
  cabo_cc:       { label: 'Cabos CC',       emoji: '🔌', cor: 'text-white/70 bg-white/10     border-white/20' },
  cabo_ca:       { label: 'Cabos CA',       emoji: '🔌', cor: 'text-white/70 bg-white/10     border-white/20' },
  conector:      { label: 'Conectores',     emoji: '🔗', cor: 'text-white/70 bg-white/10     border-white/20' },
  string_box:    { label: 'String Boxes',   emoji: '📦', cor: 'text-white/70 bg-white/10     border-white/20' },
  disjuntor:     { label: 'Disjuntores',    emoji: '⚙️', cor: 'text-coral    bg-coral/10     border-coral/30' },
  dps:           { label: 'DPS',            emoji: '⚡', cor: 'text-coral    bg-coral/10     border-coral/30' },
  eletroduto:    { label: 'Eletrodutos',    emoji: '🟫', cor: 'text-white/70 bg-white/10     border-white/20' },
  aterramento:   { label: 'Aterramento',    emoji: '⏚',  cor: 'text-white/70 bg-white/10     border-white/20' },
  quadro:        { label: 'Quadros',        emoji: '🗄️', cor: 'text-white/70 bg-white/10     border-white/20' },
  smart_meter:   { label: 'Smart Meters',   emoji: '📊', cor: 'text-verde    bg-verde/10     border-verde/30' },
  monitoramento: { label: 'Monitoramento',  emoji: '📡', cor: 'text-weg-azul bg-weg-azul/10  border-weg-azul/30' },
  frete:         { label: 'Frete',          emoji: '🚚', cor: 'text-white/60 bg-white/5      border-white/10' },
  outro:         { label: 'Outros',         emoji: '📦', cor: 'text-white/60 bg-white/5      border-white/10' },
}

// Estilo inline pras <option> — Chrome/Windows ignora className em <option>,
// mas honra style inline. Sem isso, dropdown aberto renderiza branco no branco.
const OPT_STYLE: React.CSSProperties = { backgroundColor: '#050B16', color: '#ffffff' }
const OPTGROUP_STYLE: React.CSSProperties = { backgroundColor: '#050B16', color: '#FFC300', fontWeight: 'bold' }

export function CatalogoClient({ historico, produtos, porCategoria }: Props) {
  const router = useRouter()
  const [enviandoPlanilha, setEnviandoPlanilha] = useState(false)
  const [enviandoEstoque, setEnviandoEstoque] = useState(false)
  const [resultado, setResultado] = useState<string | null>(null)
  const [erro, setErro] = useState<string | null>(null)

  const inputPlanilhaRef = useRef<HTMLInputElement>(null)
  const inputEstoqueRef = useRef<HTMLInputElement>(null)

  /** Parse resiliente: server pode retornar HTML de timeout/500, não só JSON */
  async function parseResp(res: Response): Promise<{ ok: boolean; data: Record<string, unknown>; erro?: string }> {
    const text = await res.text()
    try {
      const data = JSON.parse(text)
      return { ok: res.ok, data, erro: res.ok ? undefined : (data.erro || 'Erro ao processar') }
    } catch {
      if (res.status === 504 || res.status === 408) {
        return { ok: false, data: {}, erro: 'Servidor demorou demais (timeout). O processamento pode estar rodando em segundo plano — recarregue em ~30s.' }
      }
      const preview = text.slice(0, 100).replace(/<[^>]+>/g, '').trim()
      return { ok: false, data: {}, erro: `Servidor retornou erro (HTTP ${res.status}): ${preview || 'sem detalhes'}` }
    }
  }

  async function enviarPlanilha(file: File) {
    setEnviandoPlanilha(true)
    setErro(null)
    setResultado(null)
    try {
      const formData = new FormData()
      formData.append('arquivo', file)
      const res = await fetch('/api/importar-planilha-weg', { method: 'POST', body: formData })
      const { ok, data, erro } = await parseResp(res)
      if (!ok) throw new Error(erro)
      setResultado(`✅ Planilha processada: ${data.produtos_criados} novos + ${data.produtos_atualizados} atualizados = ${data.total_processados} produtos.`)
      router.refresh()
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Falha ao processar planilha'
      setErro(msg)
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
      const { ok, data, erro } = await parseResp(res)
      if (!ok) throw new Error(erro)
      setResultado(`✅ Estoque atualizado: ${data.produtos_atualizados} produtos afetados (${data.total_skus_no_pdf} SKUs no PDF).`)
      router.refresh()
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Falha ao atualizar estoque'
      setErro(msg)
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
  const [filtroSubcategoria, setFiltroSubcategoria] = useState<string>('todas')
  const [abrindoNovoProduto, setAbrindoNovoProduto] = useState(false)
  const [abrindoDatasheet, setAbrindoDatasheet] = useState(false)
  const [filtroDatasheet, setFiltroDatasheet] = useState<'todos' | 'com' | 'sem'>('todos')
  const [filtroAtivo, setFiltroAtivo] = useState<'todos' | 'ativos' | 'inativos'>('ativos')
  const [busca, setBusca] = useState('')

  // Subcategorias disponíveis pra categoria filtrada, ordenadas A→Z
  const subcategoriasDaCat = filtroCategoria === 'todos'
    ? []
    : Array.from(
        new Set(
          produtos
            .filter(p => p.categoria === filtroCategoria && p.subcategoria)
            .map(p => p.subcategoria as string)
        )
      ).sort((a, b) => a.localeCompare(b, 'pt-BR'))

  const produtosVisiveis = produtos.filter(p => {
    if (filtroCategoria !== 'todos' && p.categoria !== filtroCategoria) return false
    if (filtroSubcategoria !== 'todas' && p.subcategoria !== filtroSubcategoria) return false
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

  // Último upload concluído por tipo (pra mostrar preview "capa" no card)
  const ultimaPlanilha = historico.find(h => h.tipo === 'planilha_precos' && h.status === 'concluido')
  const ultimoEstoque = historico.find(h => h.tipo === 'pdf_estoque' && h.status === 'concluido')

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
          <UploadCardSlot
            enviando={enviandoPlanilha}
            ultimo={ultimaPlanilha}
            corGradient="from-verde/20 via-verde/5 to-transparent"
            icone="📗"
            iconeLabel="Excel"
            labelEscolher="Escolher arquivo Excel"
            hintVazio='Aba lida: "Composição Preços"'
            hintProcessando="⏳ Processando planilha... (~15-30s)"
            onClick={() => inputPlanilhaRef.current?.click()}
          />
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
          <UploadCardSlot
            enviando={enviandoEstoque}
            ultimo={ultimoEstoque}
            corGradient="from-coral/20 via-coral/5 to-transparent"
            icone="📕"
            iconeLabel="PDF"
            labelEscolher="Escolher PDF"
            hintVazio="Lê códigos SAP + status por linha"
            hintProcessando="⏳ Processando PDF..."
            onClick={() => inputEstoqueRef.current?.click()}
          />
        </div>
      </section>

      {(resultado || erro) && (
        <div className={`p-4 rounded-lg border text-sm ${erro ? 'bg-coral/10 border-coral/30 text-coral' : 'bg-verde/10 border-verde/30 text-verde'}`}>
          {erro || resultado}
        </div>
      )}

      {/* Distribuição por categoria — badges clicáveis que aplicam o filtro */}
      {porCategoria && Object.keys(porCategoria).length > 0 && (
        <section>
          <div className="flex items-baseline justify-between mb-2">
            <h2 className="text-xs uppercase tracking-wider font-bold text-sol">
              📊 Produtos por categoria
            </h2>
            <span className="text-[10px] text-white/40">
              {Object.values(porCategoria).reduce((s, n) => s + n, 0)} produtos ativos ·
              clique num card pra filtrar
            </span>
          </div>
          <div className="grid grid-cols-3 md:grid-cols-5 lg:grid-cols-8 gap-2">
            {Object.entries(porCategoria)
              .sort((a, b) => b[1] - a[1])
              .map(([cat, qtd]) => {
                const info = CATEGORIA_INFO[cat] || { label: cat, emoji: '📦', cor: 'text-white/60 bg-white/5 border-white/10' }
                const ativo = filtroCategoria === cat
                return (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => setFiltroCategoria(ativo ? 'todos' : cat)}
                    className={`px-2.5 py-2 rounded-lg border text-left transition ${
                      ativo
                        ? 'bg-sol/15 border-sol text-white'
                        : `${info.cor} hover:opacity-100 opacity-90`
                    }`}
                    title={ativo ? 'Clique pra remover filtro' : `Filtrar por ${info.label}`}
                  >
                    <div className="flex items-baseline justify-between gap-1">
                      <span className="text-lg leading-none">{info.emoji}</span>
                      <span className="text-lg font-black leading-none">{qtd}</span>
                    </div>
                    <p className="text-[9px] uppercase tracking-wide font-bold mt-1 truncate">
                      {info.label}
                    </p>
                  </button>
                )
              })}
          </div>
        </section>
      )}

      {/* Botão de acesso ao histórico completo (era lista inline) */}
      <section>
        <a
          href="/admin/catalogo/historico"
          className="flex items-center justify-between gap-4 bg-white/[0.03] border border-white/10 hover:border-sol/40 hover:bg-white/[0.06] rounded-xl p-4 transition group"
        >
          <div className="flex items-center gap-3">
            <span className="text-2xl">📜</span>
            <div>
              <p className="text-sm font-bold text-white group-hover:text-sol transition">
                Histórico de uploads
              </p>
              <p className="text-xs text-white/50">
                {historico.length === 0
                  ? 'Nenhum upload registrado ainda'
                  : `${historico.length} upload${historico.length > 1 ? 's' : ''} registrado${historico.length > 1 ? 's' : ''}`}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {historico[0] && (
              <span className="text-[10px] text-white/40 hidden md:inline">
                último: {new Date(historico[0].created_at).toLocaleString('pt-BR', {
                  day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit',
                })}
              </span>
            )}
            <span className="text-white/40 group-hover:text-sol transition text-xl">→</span>
          </div>
        </a>
      </section>

      {/* Datasheets individuais */}
      <section>
        <div className="flex items-center justify-between gap-3 mb-3">
          <h2 className="text-lg font-bold text-white">📄 Produtos do catálogo</h2>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setAbrindoDatasheet(true)}
              className="px-3 py-2 bg-weg-azul text-white text-xs font-bold rounded-lg hover:bg-weg-azul/90 transition"
            >
              📄 Cadastrar via datasheet (IA)
            </button>
            <button
              onClick={() => setAbrindoNovoProduto(true)}
              className="px-3 py-2 bg-sol text-noite text-xs font-bold rounded-lg hover:bg-sol/90 transition"
            >
              ➕ Novo produto manual
            </button>
          </div>
        </div>
        <p className="text-xs text-white/50 mb-4">
          Para cada produto: anexar <strong className="text-white/80">datasheet PDF</strong>, <strong className="text-white/80">imagem PNG</strong>,
          ligar/desligar do <strong className="text-white/80">simulador de kits</strong>, ou ver <strong className="text-sol">pontos críticos elétricos</strong> extraídos do datasheet.
          <span className="text-white/40 ml-1">
            Use <strong className="text-sol">"Novo produto manual"</strong> pra itens fora da planilha WEG (outros fabricantes, materiais avulsos).
          </span>
        </p>

        {/* Filtros */}
        <div className="flex flex-wrap gap-3 mb-4">
          <select
            value={filtroCategoria}
            onChange={e => {
              setFiltroCategoria(e.target.value)
              setFiltroSubcategoria('todas')
            }}
            className="px-3 py-2 bg-noite border border-white/10 rounded text-sm text-white"
          >
            <option style={OPT_STYLE} value="todos">Todas categorias</option>
            <optgroup style={OPTGROUP_STYLE} label="Geracao">
              <option style={OPT_STYLE} value="placa">Placas fotovoltaicas</option>
              <option style={OPT_STYLE} value="inversor">Inversores</option>
              <option style={OPT_STYLE} value="bateria">Baterias (BESS)</option>
            </optgroup>
            <optgroup style={OPTGROUP_STYLE} label="Estrutura & CA">
              <option style={OPT_STYLE} value="estrutura">Estrutura</option>
              <option style={OPT_STYLE} value="cabo_cc">Cabos CC</option>
              <option style={OPT_STYLE} value="cabo_ca">Cabos CA</option>
              <option style={OPT_STYLE} value="conector">Conectores (MC4)</option>
              <option style={OPT_STYLE} value="string_box">String Box (SB, JBW)</option>
              <option style={OPT_STYLE} value="disjuntor">Disjuntores</option>
              <option style={OPT_STYLE} value="dps">DPS</option>
              <option style={OPT_STYLE} value="eletroduto">Eletrodutos</option>
              <option style={OPT_STYLE} value="aterramento">Aterramento</option>
              <option style={OPT_STYLE} value="quadro">Quadros (SmartGuard, TBW)</option>
              <option style={OPT_STYLE} value="smart_meter">Smart Meter (MMW03, DTSU)</option>
              <option style={OPT_STYLE} value="monitoramento">Monitoramento (EMBOX, Dongle)</option>
            </optgroup>
            <optgroup style={OPTGROUP_STYLE} label="Servicos">
              <option style={OPT_STYLE} value="mao_de_obra">Mao de obra</option>
              <option style={OPT_STYLE} value="projeto_engenharia">Projeto / ART</option>
              <option style={OPT_STYLE} value="frete">Frete</option>
              <option style={OPT_STYLE} value="identificacao">Identificacao</option>
              <option style={OPT_STYLE} value="outro">Outro</option>
            </optgroup>
          </select>

          {subcategoriasDaCat.length > 1 && (
            <select
              value={filtroSubcategoria}
              onChange={e => setFiltroSubcategoria(e.target.value)}
              className="px-3 py-2 bg-noite border border-sol/30 rounded text-sm text-white"
              title="Filtrar por subcategoria"
            >
              <option style={OPT_STYLE} value="todas">Subcategoria: Todas</option>
              {subcategoriasDaCat.map(s => (
                <option key={s} style={OPT_STYLE} value={s}>
                  {s.replace(/_/g, ' ')}
                </option>
              ))}
            </select>
          )}

          <select
            value={filtroDatasheet}
            onChange={e => setFiltroDatasheet(e.target.value as any)}
            className="px-3 py-2 bg-noite border border-white/10 rounded text-sm text-white"
          >
            <option style={OPT_STYLE} value="todos">Datasheet: Todos</option>
            <option style={OPT_STYLE} value="sem">Sem datasheet</option>
            <option style={OPT_STYLE} value="com">Com datasheet</option>
          </select>

          <select
            value={filtroAtivo}
            onChange={e => setFiltroAtivo(e.target.value as any)}
            className="px-3 py-2 bg-noite border border-white/10 rounded text-sm text-white"
          >
            <option style={OPT_STYLE} value="ativos">Só ativos</option>
            <option style={OPT_STYLE} value="inativos">Só inativos</option>
            <option style={OPT_STYLE} value="todos">Todos</option>
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

      {abrindoNovoProduto && (
        <ModalNovoProduto onFechar={() => setAbrindoNovoProduto(false)} />
      )}

      {abrindoDatasheet && (
        <CadastroDatasheetModal
          onClose={() => setAbrindoDatasheet(false)}
          onCreated={() => router.refresh()}
        />
      )}
    </div>
  )
}

/**
 * Modal pra cadastrar produto manual (fora da planilha WEG).
 * Campos: categoria + fabricante + modelo + descrição (obrigatórios) +
 * SKU/potência/preços (opcionais).
 */
function ModalNovoProduto({ onFechar }: { onFechar: () => void }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [categoria, setCategoria] = useState<CategoriaProduto>('outro')
  const [fabricante, setFabricante] = useState('WEG')
  const [modelo, setModelo] = useState('')
  const [descricao, setDescricao] = useState('')
  const [subcategoria, setSubcategoria] = useState('')
  const [codigoWeg, setCodigoWeg] = useState('')
  const [descricaoTecnica, setDescricaoTecnica] = useState('')
  // Campos específicos por categoria
  const [potenciaWp, setPotenciaWp] = useState('')
  const [areaM2, setAreaM2] = useState('')
  const [larguraMm, setLarguraMm] = useState('')
  const [tipoCelula, setTipoCelula] = useState('')
  const [potenciaKw, setPotenciaKw] = useState('')
  const [tensaoDesc, setTensaoDesc] = useState('')
  const [disjuntorEq, setDisjuntorEq] = useState('')
  const [entradasMppt, setEntradasMppt] = useState('')
  const [capacidadeKwh, setCapacidadeKwh] = useState('')
  // Preços
  const [precoVenda, setPrecoVenda] = useState('')
  const [precoCusto, setPrecoCusto] = useState('')
  const [erro, setErro] = useState<string | null>(null)

  const catInfoLocal = CATEGORIA_INFO[categoria] || { label: categoria, emoji: '📦', cor: '' }
  const ehWeg = fabricante.trim().toUpperCase().startsWith('WEG')

  // Botão "Aplicar desconto WEG" — mesma lógica da coluna 5 da planilha (0,4182)
  function aplicarDescontoWeg() {
    const venda = parseFloat(precoVenda.replace(',', '.'))
    if (isNaN(venda) || venda <= 0) { setErro('Preencha primeiro o Preço venda (tabela WEG)'); return }
    setErro(null)
    setPrecoCusto((venda * 0.4182).toFixed(2).replace('.', ','))
  }

  function num(s: string): number | undefined {
    const n = parseFloat(s.replace(',', '.'))
    return (!isNaN(n) && s.trim() !== '') ? n : undefined
  }

  function handleSalvar() {
    setErro(null)
    if (!fabricante.trim()) { setErro('Fabricante obrigatório'); return }
    if (!modelo.trim()) { setErro('Modelo obrigatório'); return }
    if (!descricao.trim()) { setErro('Descrição curta obrigatória'); return }

    startTransition(async () => {
      const res = await criarProdutoManualAction({
        categoria,
        modelo: modelo.trim(),
        fabricante: fabricante.trim(),
        codigo_weg: codigoWeg.trim() || undefined,
        subcategoria: subcategoria.trim() || undefined,
        descricao_curta: descricao.trim(),
        descricao_tecnica: descricaoTecnica.trim() || undefined,
        // Placa
        potencia_wp: categoria === 'placa' ? num(potenciaWp) : undefined,
        area_m2: categoria === 'placa' ? num(areaM2) : undefined,
        largura_mm: categoria === 'placa' ? num(larguraMm) : undefined,
        tipo_celula: categoria === 'placa' ? (tipoCelula.trim() || undefined) : undefined,
        // Inversor
        potencia_kw: (categoria === 'inversor' || categoria === 'bateria') ? num(potenciaKw) : undefined,
        tensao_desc: (categoria === 'inversor' || categoria === 'bateria') ? (tensaoDesc.trim() || undefined) : undefined,
        disjuntor_equivalente: categoria === 'inversor' ? (disjuntorEq.trim() || undefined) : undefined,
        entradas_mppt: categoria === 'inversor' ? num(entradasMppt) : undefined,
        // Bateria
        capacidade_kwh: categoria === 'bateria' ? num(capacidadeKwh) : undefined,
        preco_custo: num(precoCusto),
        preco_venda: num(precoVenda),
      })

      if ('erro' in res) { setErro(res.erro); return }
      onFechar()
      router.refresh()
    })
  }

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-noite border border-white/20 rounded-xl p-6 max-w-lg w-full space-y-4 shadow-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between">
          <h3 className="text-xl font-bold text-white">➕ Novo produto manual</h3>
          <button onClick={onFechar} className="text-white/60 hover:text-white text-xl">✕</button>
        </div>

        <p className="text-xs text-white/60 leading-relaxed">
          Cadastro pra itens <strong>fora da planilha WEG</strong> — outros fabricantes,
          serviços customizados, materiais avulsos. Só admin.
        </p>

        <div>
          <label className="block text-xs font-semibold text-white/70 mb-2">Categoria *</label>
          <div className="grid grid-cols-4 gap-1.5">
            {(Object.entries(CATEGORIA_INFO) as [CategoriaProduto, typeof CATEGORIA_INFO[string]][]).map(([k, info]) => {
              const ativo = categoria === k
              return (
                <button
                  key={k}
                  type="button"
                  onClick={() => setCategoria(k as CategoriaProduto)}
                  className={`p-1.5 rounded border text-center transition ${
                    ativo ? 'bg-sol/15 border-sol text-white' : 'bg-white/[0.02] border-white/10 text-white/60 hover:border-white/30'
                  }`}
                  title={info.label}
                >
                  <div className="text-base leading-none">{info.emoji}</div>
                  <div className="text-[9px] font-bold mt-0.5 truncate">{info.label}</div>
                </button>
              )
            })}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-semibold text-white/70 mb-1">Fabricante *</label>
            <input
              type="text"
              value={fabricante}
              onChange={e => setFabricante(e.target.value)}
              placeholder="Ex: Fronius, Growatt"
              className="w-full px-3 py-2 bg-white/5 border border-white/20 rounded text-white text-sm focus:border-sol focus:outline-none"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-white/70 mb-1">Modelo *</label>
            <input
              type="text"
              value={modelo}
              onChange={e => setModelo(e.target.value)}
              placeholder="Ex: Primo 5.0-1"
              className="w-full px-3 py-2 bg-white/5 border border-white/20 rounded text-white text-sm focus:border-sol focus:outline-none"
            />
          </div>
        </div>

        <div>
          <label className="block text-xs font-semibold text-white/70 mb-1">Descrição curta *</label>
          <input
            type="text"
            value={descricao}
            onChange={e => setDescricao(e.target.value)}
            placeholder="Como aparece na proposta"
            className="w-full px-3 py-2 bg-white/5 border border-white/20 rounded text-white text-sm focus:border-sol focus:outline-none"
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-semibold text-white/70 mb-1">Subcategoria</label>
            <input
              type="text"
              value={subcategoria}
              onChange={e => setSubcategoria(e.target.value)}
              placeholder="Ex: monofásico, tipo A"
              className="w-full px-3 py-2 bg-white/5 border border-white/20 rounded text-white text-sm focus:border-sol focus:outline-none"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-white/70 mb-1">SKU / Código</label>
            <input
              type="text"
              value={codigoWeg}
              onChange={e => setCodigoWeg(e.target.value)}
              placeholder="Se tiver (autogero senão)"
              className="w-full px-3 py-2 bg-white/5 border border-white/20 rounded text-white text-sm focus:border-sol focus:outline-none"
            />
          </div>
        </div>

        {/* CAMPOS ESPECÍFICOS POR CATEGORIA — espelham o parser da planilha WEG */}
        {categoria === 'placa' && (
          <div className="p-3 rounded-lg bg-sol/5 border border-sol/20 space-y-3">
            <p className="text-[10px] uppercase tracking-wider font-bold text-sol">☀️ Specs de módulo fotovoltaico</p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-white/70 mb-1">Potência (Wp) *</label>
                <input type="number" inputMode="decimal" step="1" value={potenciaWp} onChange={e => setPotenciaWp(e.target.value)}
                  placeholder="Ex: 615" className="w-full px-3 py-2 bg-white/5 border border-white/20 rounded text-white text-sm focus:border-sol focus:outline-none" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-white/70 mb-1">Tipo de célula</label>
                <input type="text" value={tipoCelula} onChange={e => setTipoCelula(e.target.value)}
                  placeholder="Ex: n-TYPE, PERC, n-TYPE BC" className="w-full px-3 py-2 bg-white/5 border border-white/20 rounded text-white text-sm focus:border-sol focus:outline-none" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-white/70 mb-1">Área (m²)</label>
                <input type="number" inputMode="decimal" step="0.001" value={areaM2} onChange={e => setAreaM2(e.target.value)}
                  placeholder="Ex: 2,701" className="w-full px-3 py-2 bg-white/5 border border-white/20 rounded text-white text-sm focus:border-sol focus:outline-none" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-white/70 mb-1">Largura (mm)</label>
                <input type="number" inputMode="numeric" step="1" value={larguraMm} onChange={e => setLarguraMm(e.target.value)}
                  placeholder="Ex: 1134" className="w-full px-3 py-2 bg-white/5 border border-white/20 rounded text-white text-sm focus:border-sol focus:outline-none" />
              </div>
            </div>
          </div>
        )}

        {(categoria === 'inversor' || categoria === 'bateria') && (
          <div className="p-3 rounded-lg bg-weg-azul/5 border border-weg-azul/20 space-y-3">
            <p className="text-[10px] uppercase tracking-wider font-bold text-weg-azul">
              ⚡ Specs de {categoria === 'inversor' ? 'inversor' : 'bateria'}
            </p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-white/70 mb-1">Potência (kW)</label>
                <input type="number" inputMode="decimal" step="0.1" value={potenciaKw} onChange={e => setPotenciaKw(e.target.value)}
                  placeholder="Ex: 5" className="w-full px-3 py-2 bg-white/5 border border-white/20 rounded text-white text-sm focus:border-sol focus:outline-none" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-white/70 mb-1">Tipo de rede / tensão</label>
                <input type="text" value={tensaoDesc} onChange={e => setTensaoDesc(e.target.value)}
                  placeholder="Ex: Monofásico 220V" className="w-full px-3 py-2 bg-white/5 border border-white/20 rounded text-white text-sm focus:border-sol focus:outline-none" />
              </div>
              {categoria === 'inversor' && (
                <>
                  <div>
                    <label className="block text-xs font-semibold text-white/70 mb-1">Disjuntor equivalente</label>
                    <input type="text" value={disjuntorEq} onChange={e => setDisjuntorEq(e.target.value)}
                      placeholder="Ex: MDWP-C32-2" className="w-full px-3 py-2 bg-white/5 border border-white/20 rounded text-white text-sm focus:border-sol focus:outline-none" />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-white/70 mb-1">Entradas MPPT</label>
                    <input type="number" inputMode="numeric" step="1" value={entradasMppt} onChange={e => setEntradasMppt(e.target.value)}
                      placeholder="Ex: 2" className="w-full px-3 py-2 bg-white/5 border border-white/20 rounded text-white text-sm focus:border-sol focus:outline-none" />
                  </div>
                </>
              )}
              {categoria === 'bateria' && (
                <div className="col-span-2">
                  <label className="block text-xs font-semibold text-white/70 mb-1">Capacidade (kWh)</label>
                  <input type="number" inputMode="decimal" step="0.1" value={capacidadeKwh} onChange={e => setCapacidadeKwh(e.target.value)}
                    placeholder="Ex: 10" className="w-full px-3 py-2 bg-white/5 border border-white/20 rounded text-white text-sm focus:border-sol focus:outline-none" />
                </div>
              )}
            </div>
          </div>
        )}

        {/* Descrição técnica livre pra outras categorias */}
        {categoria !== 'placa' && categoria !== 'inversor' && categoria !== 'bateria' && (
          <div>
            <label className="block text-xs font-semibold text-white/70 mb-1">Descrição técnica (opcional)</label>
            <textarea rows={2} value={descricaoTecnica} onChange={e => setDescricaoTecnica(e.target.value)}
              placeholder="Detalhes técnicos que ficam no specs.descricao"
              className="w-full px-3 py-2 bg-white/5 border border-white/20 rounded text-white text-sm focus:border-sol focus:outline-none resize-none" />
          </div>
        )}

        {/* PREÇOS — venda primeiro (referência); custo pode vir auto do desconto WEG */}
        <div className="p-3 rounded-lg bg-verde/5 border border-verde/20 space-y-3">
          <p className="text-[10px] uppercase tracking-wider font-bold text-verde">💰 Preços</p>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-white/70 mb-1">Preço venda / tabela (R$)</label>
              <input type="number" inputMode="decimal" step="0.01" value={precoVenda} onChange={e => setPrecoVenda(e.target.value)}
                placeholder="Ex: 1370,36" className="w-full px-3 py-2 bg-white/5 border border-white/20 rounded text-white text-sm focus:border-sol focus:outline-none" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-white/70 mb-1">Preço custo Spin (R$)</label>
              <input type="number" inputMode="decimal" step="0.01" value={precoCusto} onChange={e => setPrecoCusto(e.target.value)}
                placeholder="Ex: 573,08" className="w-full px-3 py-2 bg-white/5 border border-white/20 rounded text-white text-sm focus:border-sol focus:outline-none" />
            </div>
          </div>
          {ehWeg && (
            <button type="button" onClick={aplicarDescontoWeg}
              className="w-full py-1.5 text-xs bg-weg-azul/10 border border-weg-azul/30 text-weg-azul rounded hover:bg-weg-azul/20 transition font-semibold">
              💡 Aplicar desconto WEG 0,4182 (calcula custo = venda × 41,82%)
            </button>
          )}
          <p className="text-[10px] text-white/40 leading-relaxed">
            Preço venda = valor de tabela (mostrado como referência).
            Preço custo = o que a Spin realmente paga (planilha WEG traz na coluna 5 já com desconto).
          </p>
        </div>

        {erro && (
          <div className="p-2.5 bg-coral/10 border border-coral/30 rounded text-xs text-coral">
            ⚠️ {erro}
          </div>
        )}

        <div className="flex gap-2 pt-2">
          <button onClick={onFechar} className="flex-1 py-2 bg-white/5 border border-white/10 text-white/70 text-sm rounded-lg hover:bg-white/10 transition">
            Cancelar
          </button>
          <button
            onClick={handleSalvar}
            disabled={pending}
            className="flex-1 py-2 bg-sol text-noite text-sm font-bold rounded-lg hover:bg-sol/90 disabled:opacity-40 transition"
          >
            {pending ? 'Salvando...' : `${catInfoLocal.emoji} Cadastrar ${catInfoLocal.label}`}
          </button>
        </div>
      </div>
    </div>
  )
}

/**
 * Slot de upload no card. Três estados:
 *  - enviando:  spinner + "Processando..."
 *  - ultimo:    "capa" gradient com nome + data + badge stats; botão discreto "Substituir"
 *  - vazio:     dashed border com CTA "Escolher arquivo"
 */
function UploadCardSlot({
  enviando, ultimo, corGradient, icone, iconeLabel,
  labelEscolher, hintVazio, hintProcessando, onClick,
}: {
  enviando: boolean
  ultimo?: HistoricoItem
  corGradient: string
  icone: string
  iconeLabel: string
  labelEscolher: string
  hintVazio: string
  hintProcessando: string
  onClick: () => void
}) {
  if (enviando) {
    return (
      <div className="w-full p-6 border-2 border-dashed border-sol/40 rounded-lg text-center bg-sol/5">
        <p className="text-sm text-sol font-semibold">{hintProcessando}</p>
      </div>
    )
  }

  if (ultimo) {
    const data = new Date(ultimo.created_at).toLocaleString('pt-BR', {
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    })
    const stats: string[] = []
    if (ultimo.produtos_criados > 0) stats.push(`+${ultimo.produtos_criados} novos`)
    if (ultimo.produtos_atualizados > 0) stats.push(`✎ ${ultimo.produtos_atualizados} atualizados`)

    return (
      <div className="space-y-2">
        <div className={`relative w-full rounded-lg overflow-hidden border border-white/10 bg-gradient-to-br ${corGradient}`}>
          <div className="p-4 flex items-start gap-3">
            {/* Icone "capa" */}
            <div className="flex-shrink-0 w-14 h-16 bg-white/5 border border-white/10 rounded-md flex flex-col items-center justify-center shadow-lg">
              <span className="text-3xl leading-none">{icone}</span>
              <span className="text-[8px] text-white/50 font-bold uppercase mt-0.5">{iconeLabel}</span>
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5 mb-1">
                <span className="text-[9px] uppercase font-bold text-verde bg-verde/15 border border-verde/30 px-1.5 py-0.5 rounded">
                  ✓ Ativo
                </span>
                <span className="text-[10px] text-white/50">
                  Enviado em <strong className="text-white/80">{data}</strong>
                </span>
              </div>
              <p className="text-sm font-bold text-white truncate leading-tight" title={ultimo.arquivo_nome_original}>
                {ultimo.arquivo_nome_original}
              </p>
              {stats.length > 0 && (
                <p className="text-[10px] text-white/60 mt-1">{stats.join(' · ')}</p>
              )}
            </div>
          </div>
        </div>
        <button
          onClick={onClick}
          className="w-full py-2 text-xs text-white/60 hover:text-white border border-white/10 hover:border-white/30 rounded-md transition"
        >
          🔄 Substituir por novo arquivo
        </button>
      </div>
    )
  }

  return (
    <button
      onClick={onClick}
      className="w-full p-4 border-2 border-dashed border-white/20 rounded-lg text-center hover:border-sol/40 hover:bg-white/[0.02] transition"
    >
      <p className="text-sm font-bold text-white">📤 {labelEscolher}</p>
      <p className="text-xs text-white/40 mt-1">{hintVazio}</p>
    </button>
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
  const [editando, setEditando] = useState(false)
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
        <div className="w-40 shrink-0 flex flex-col leading-tight">
          <span className="text-white/70 text-[10px] uppercase tracking-wide">{produto.categoria}</span>
          {produto.subcategoria && produto.subcategoria !== 'sem_categoria' && (
            <span className={`text-[9px] uppercase tracking-wide ${
              produto.subcategoria === 'inversor_bombeamento' ? 'text-coral/80'
              : produto.subcategoria === 'inversor_string' ? 'text-sol/80'
              : produto.subcategoria === 'microinversor' ? 'text-weg-azul/80'
              : 'text-white/40'
            }`}>
              {produto.subcategoria.replace(/_/g, ' ')}
            </span>
          )}
        </div>
        <span className="text-white flex-1 truncate">{produto.modelo}</span>

        {/* Botão Editar */}
        <button
          onClick={() => setEditando(true)}
          title="Editar dados deste produto"
          className="shrink-0 text-[10px] px-2 py-1 rounded border bg-white/[0.02] border-white/10 text-white/60 hover:border-sol/30 hover:text-sol transition"
        >
          ✏ Editar
        </button>

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

      {/* Modal de edição */}
      {editando && (
        <EditarProdutoModal
          produto={{
            id: produto.id,
            categoria: produto.categoria as any,
            modelo: produto.modelo,
            fabricante: (produto as any).fabricante || '',
            subcategoria: produto.subcategoria,
            descricao_curta: (produto as any).descricao_curta || '',
            descricao_tecnica: (produto as any).descricao_tecnica || null,
            codigo_weg: produto.codigo_weg || null,
            codigo_interno_spin: (produto as any).codigo_interno_spin || null,
            ativo: produto.ativo,
            disponivel_estoque: (produto as any).disponivel_estoque ?? true,
            specs: produto.specs,
            preco_venda_atual: (produto as any).preco_venda,
          } as ProdutoParaEdicao}
          onFechar={() => setEditando(false)}
        />
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
  } else if (categoria === 'cabo' || categoria === 'cabo_cc' || categoria === 'cabo_ca') {
    add('Bitola', fmt(specs.bitola_mm2, ' mm²'), true)
    add('Isolação', specs.isolacao, true)
    add('Tensão máx.', fmt(specs.tensao_max_v, ' V'))
    add('Cor', specs.cor)
    add('Embalagem', fmt(specs.embalagem_m, ' m'))
  } else if (categoria === 'controlador') {
    // EMBOX / controlador de paralelismo
    add('Modelo', specs.modelo)
    add('Qtd inversores suportados', specs.qtd_inversores_max, true)
    add('Potência gerenciada', fmt(specs.potencia_max_kw, ' kW'), true)
    add('Comunicação', Array.isArray(specs.comunicacao) ? specs.comunicacao.join(', ') : specs.comunicacao)
    add('Tensão alimentação', fmt(specs.tensao_v, ' V'))
    add('Grau proteção', specs.ip_protecao)
    add('Zero export', specs.zero_export ? 'SIM' : '—')
    add('Peak shaving', specs.peak_shaving ? 'SIM' : '—')
    add('Anti-ilhamento', specs.anti_ilhamento ? 'SIM' : '—')
  } else if (categoria === 'multimedidor') {
    // MMW03-M22CH — medidor de qualidade + detector de queda
    add('Modelo', specs.modelo)
    add('Tensão nominal', fmt(specs.tensao_nominal_v, ' V'), true)
    add('Corrente máx.', fmt(specs.corrente_max_a, ' A'), true)
    add('Fases', specs.fases, true)
    add('Classe precisão', specs.classe_precisao)
    add('Grandezas medidas', Array.isArray(specs.grandezas) ? specs.grandezas.join(', ') : specs.grandezas)
    add('Comunicação', Array.isArray(specs.comunicacao) ? specs.comunicacao.join(', ') : specs.comunicacao)
    add('Detecta queda', specs.detecta_queda ? 'SIM (dispara EPS)' : '—', true)
    add('Grau proteção', specs.ip_protecao)
    add('Precisa TC/TP?', specs.precisa_tc_tp ? 'SIM (Grupo A)' : 'NÃO (Grupo B)')
  } else if (categoria === 'caixa_juncao') {
    // JBW 41DC 50A W0 — junta strings/baterias
    add('Modelo', specs.modelo)
    add('Corrente máx.', fmt(specs.corrente_max_a, ' A'), true)
    add('Tensão máx.', fmt(specs.tensao_max_v, ' V'), true)
    add('Entradas', specs.qtd_entradas, true)
    add('Saídas', specs.qtd_saidas)
    add('Tipo (CC/CA)', specs.tipo)
    add('Tem fusível?', specs.tem_fusivel ? 'SIM' : 'NÃO')
    add('Tem disjuntor?', specs.tem_disjuntor ? 'SIM' : 'NÃO')
    add('Tem DPS?', specs.tem_dps ? 'SIM' : 'NÃO')
    add('Grau proteção', specs.ip_protecao)
  } else if (categoria === 'estrutura') {
    add('Material', specs.material, true)
    add('Formato', specs.formato)
    add('Comprimento', fmt(specs.comprimento_mm, ' mm'))
    add('Capacidade carga', fmt(specs.capacidade_kg, ' kg'), true)
    add('Telhado compatível', Array.isArray(specs.telhado_compativel) ? specs.telhado_compativel.join(', ') : specs.telhado_compativel)
  } else {
    // Generico — despeja tudo que tiver
    for (const [k, v] of Object.entries(specs)) {
      if (v == null || v === '' || typeof v === 'object') continue
      add(k.replace(/_/g, ' '), v)
    }
  }

  return linhas
}
