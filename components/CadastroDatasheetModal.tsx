'use client'

import { useState, useRef, useTransition } from 'react'
import { createClient } from '@/lib/supabase/client'
import { criarProdutoViaDatasheetAction, type CategoriaProduto } from '@/app/admin/catalogo/actions'

const CATEGORIAS: { chave: CategoriaProduto; emoji: string; label: string }[] = [
  { chave: 'placa',         emoji: '☀️', label: 'Placa fotovoltaica' },
  { chave: 'inversor',      emoji: '⚡', label: 'Inversor' },
  { chave: 'bateria',       emoji: '🔋', label: 'Bateria / BESS' },
  { chave: 'estrutura',     emoji: '🏗️', label: 'Estrutura' },
  { chave: 'cabo_cc',       emoji: '🔌', label: 'Cabo CC' },
  { chave: 'cabo_ca',       emoji: '🔌', label: 'Cabo CA' },
  { chave: 'conector',      emoji: '🔗', label: 'Conector' },
  { chave: 'string_box',    emoji: '📦', label: 'String Box' },
  { chave: 'disjuntor',     emoji: '⚙️', label: 'Disjuntor' },
  { chave: 'dps',           emoji: '⚡', label: 'DPS' },
  { chave: 'quadro',        emoji: '🗄️', label: 'Quadro' },
  { chave: 'smart_meter',   emoji: '📊', label: 'Smart Meter' },
  { chave: 'monitoramento', emoji: '📡', label: 'Monitoramento' },
  { chave: 'outro',         emoji: '📦', label: 'Outro' },
]

type SpecsExtraidas = Record<string, unknown>

type ExtracaoResposta = {
  fabricante?: string
  modelo?: string
  descricao_curta?: string
  subcategoria?: string
  codigo_sugerido?: string | null
  specs?: SpecsExtraidas
}

export function CadastroDatasheetModal({
  onClose,
  onCreated,
}: {
  onClose: () => void
  onCreated: () => void
}) {
  const [pending, startTransition] = useTransition()
  const [extraindo, setExtraindo] = useState(false)
  const [salvando, setSalvando] = useState(false)
  const [categoria, setCategoria] = useState<CategoriaProduto>('placa')
  const [arquivo, setArquivo] = useState<File | null>(null)
  const [extraido, setExtraido] = useState<ExtracaoResposta | null>(null)
  // Campos editáveis (pré-preenchidos pela IA)
  const [fabricante, setFabricante] = useState('')
  const [modelo, setModelo] = useState('')
  const [descricao, setDescricao] = useState('')
  const [subcategoria, setSubcategoria] = useState('')
  const [codigoWeg, setCodigoWeg] = useState('')
  const [specsJson, setSpecsJson] = useState('')
  const [precoTabela, setPrecoTabela] = useState('')
  const [erro, setErro] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const ehWeg = fabricante.trim().toUpperCase().startsWith('WEG')
  const custoCalc = ehWeg && precoTabela
    ? (parseFloat(precoTabela.replace(',', '.')) * 0.4182)
    : (precoTabela ? parseFloat(precoTabela.replace(',', '.')) : 0)

  async function handleExtrair() {
    setErro(null)
    if (!arquivo) { setErro('Anexe o PDF do datasheet primeiro'); return }
    if (arquivo.type !== 'application/pdf') { setErro('Precisa ser PDF (não imagem)'); return }

    setExtraindo(true)
    try {
      const fd = new FormData()
      fd.append('arquivo', arquivo)
      fd.append('categoria', categoria)
      const res = await fetch('/api/extrair-datasheet', { method: 'POST', body: fd })
      const json = await res.json()
      if (!res.ok || !json.sucesso) {
        throw new Error(json.erro || 'IA não conseguiu extrair')
      }
      const e = json as ExtracaoResposta
      setExtraido(e)
      setFabricante(e.fabricante || '')
      setModelo(e.modelo || '')
      setDescricao(e.descricao_curta || '')
      setSubcategoria(e.subcategoria || '')
      setCodigoWeg(e.codigo_sugerido || '')
      setSpecsJson(JSON.stringify(e.specs || {}, null, 2))
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Falha na extração')
    } finally {
      setExtraindo(false)
    }
  }

  async function handleSalvar() {
    setErro(null)
    if (!modelo.trim()) { setErro('Modelo obrigatório'); return }
    if (!fabricante.trim()) { setErro('Fabricante obrigatório'); return }
    if (!descricao.trim()) { setErro('Descrição obrigatória'); return }

    let specsObj: Record<string, unknown> = {}
    try {
      specsObj = specsJson.trim() ? JSON.parse(specsJson) : {}
    } catch {
      setErro('JSON de specs inválido — corrija a sintaxe')
      return
    }

    setSalvando(true)
    try {
      // 1. Upload do PDF pro storage pra ficar como url_datasheet
      let urlDatasheet: string | undefined
      if (arquivo) {
        const supabase = createClient()
        const codigo = codigoWeg.trim() || `SPIN-${Date.now().toString(36).toUpperCase()}`
        const path = `${codigo}-${Date.now()}.pdf`
        const { error: upErr } = await supabase.storage
          .from('datasheets')
          .upload(path, arquivo, { contentType: 'application/pdf', upsert: false })
        if (!upErr) {
          const { data } = supabase.storage.from('datasheets').getPublicUrl(path)
          urlDatasheet = data.publicUrl
        }
        // Se upload falhar (bucket não existe/permissão), continua mesmo assim — só sem PDF anexo
      }

      startTransition(async () => {
        const precoNum = precoTabela.trim() ? parseFloat(precoTabela.replace(',', '.')) : undefined
        const res = await criarProdutoViaDatasheetAction({
          categoria,
          modelo: modelo.trim(),
          fabricante: fabricante.trim(),
          codigo_weg: codigoWeg.trim() || undefined,
          subcategoria: subcategoria.trim() || undefined,
          descricao_curta: descricao.trim(),
          specs: specsObj,
          preco_tabela_weg: (precoNum && !isNaN(precoNum)) ? precoNum : undefined,
          url_datasheet: urlDatasheet,
        })
        if ('erro' in res) {
          setErro(res.erro)
          setSalvando(false)
          return
        }
        onCreated()
        onClose()
      })
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Erro ao salvar')
      setSalvando(false)
    }
  }

  const podeExtrair = !!arquivo && !extraindo && !extraido
  const podeSalvar = !!extraido && !salvando && !pending && !!modelo.trim() && !!fabricante.trim() && !!descricao.trim()

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-noite border border-white/20 rounded-xl p-6 max-w-2xl w-full space-y-4 shadow-2xl max-h-[92vh] overflow-y-auto">
        <div className="flex items-center justify-between">
          <h3 className="text-xl font-bold text-white">📄 Cadastrar via datasheet (IA)</h3>
          <button onClick={onClose} className="text-white/60 hover:text-white text-xl">✕</button>
        </div>

        <p className="text-xs text-white/60 leading-relaxed">
          Escolha a categoria, anexe o PDF do datasheet e a IA extrai as specs automaticamente.
          Você revisa, digita o preço de tabela (sem desconto) e cadastra.
        </p>

        {/* Etapa 1 — Categoria */}
        <div>
          <label className="block text-xs font-semibold text-white/70 mb-2">1. Categoria *</label>
          <div className="grid grid-cols-4 gap-1.5">
            {CATEGORIAS.map(c => {
              const ativo = categoria === c.chave
              return (
                <button
                  key={c.chave}
                  type="button"
                  onClick={() => { setCategoria(c.chave); setExtraido(null) }}
                  disabled={extraindo || salvando}
                  className={`p-1.5 rounded border text-center transition disabled:opacity-40 ${
                    ativo ? 'bg-sol/15 border-sol text-white' : 'bg-white/[0.02] border-white/10 text-white/60 hover:border-white/30'
                  }`}
                >
                  <div className="text-base leading-none">{c.emoji}</div>
                  <div className="text-[9px] font-bold mt-0.5 truncate">{c.label}</div>
                </button>
              )
            })}
          </div>
        </div>

        {/* Etapa 2 — Upload PDF */}
        <div>
          <label className="block text-xs font-semibold text-white/70 mb-2">2. Datasheet PDF *</label>
          <input
            ref={inputRef}
            type="file"
            accept="application/pdf"
            className="hidden"
            onChange={e => { setArquivo(e.target.files?.[0] || null); setExtraido(null); setErro(null) }}
          />
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={extraindo || salvando}
            className={`w-full p-3 border-2 border-dashed rounded-lg text-center transition disabled:opacity-40 ${
              arquivo
                ? 'border-verde/40 bg-verde/5 text-verde hover:bg-verde/10'
                : 'border-white/20 text-white/60 hover:border-sol/40 hover:bg-white/[0.02]'
            }`}
          >
            {arquivo ? (
              <>
                <p className="text-sm font-bold">📄 {arquivo.name}</p>
                <p className="text-[10px] mt-0.5">{Math.round(arquivo.size / 1024)} KB — clique pra trocar</p>
              </>
            ) : (
              <>
                <p className="text-sm font-bold text-white">📎 Anexar PDF do datasheet</p>
                <p className="text-[10px] text-white/40 mt-0.5">Máx 32MB · qualquer fabricante</p>
              </>
            )}
          </button>
        </div>

        {/* Etapa 3 — Extrair via IA */}
        {podeExtrair && (
          <button
            type="button"
            onClick={handleExtrair}
            disabled={extraindo}
            className="w-full py-2.5 bg-weg-azul text-white font-bold text-sm rounded-lg hover:bg-weg-azul/90 disabled:opacity-40 transition"
          >
            🤖 Extrair specs com IA (Claude Vision)
          </button>
        )}
        {extraindo && (
          <div className="p-3 bg-weg-azul/10 border border-weg-azul/30 rounded-lg text-center text-xs text-weg-azul">
            🤖 Lendo o datasheet... isso leva ~10-20 segundos
          </div>
        )}

        {/* Etapa 4 — Revisão do que a IA extraiu */}
        {extraido && (
          <div className="space-y-3 p-4 rounded-lg bg-verde/5 border border-verde/20">
            <p className="text-[10px] uppercase tracking-wider font-bold text-verde">
              ✓ Specs extraídas · revise antes de salvar
            </p>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-white/70 mb-1">Fabricante *</label>
                <input type="text" value={fabricante} onChange={e => setFabricante(e.target.value)}
                  className="w-full px-3 py-2 bg-white/5 border border-white/20 rounded text-white text-sm focus:border-sol focus:outline-none" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-white/70 mb-1">Modelo *</label>
                <input type="text" value={modelo} onChange={e => setModelo(e.target.value)}
                  className="w-full px-3 py-2 bg-white/5 border border-white/20 rounded text-white text-sm focus:border-sol focus:outline-none" />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-white/70 mb-1">Descrição curta *</label>
              <input type="text" value={descricao} onChange={e => setDescricao(e.target.value)}
                className="w-full px-3 py-2 bg-white/5 border border-white/20 rounded text-white text-sm focus:border-sol focus:outline-none" />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-white/70 mb-1">Subcategoria</label>
                <input type="text" value={subcategoria} onChange={e => setSubcategoria(e.target.value)}
                  className="w-full px-3 py-2 bg-white/5 border border-white/20 rounded text-white text-sm focus:border-sol focus:outline-none" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-white/70 mb-1">SKU / Código</label>
                <input type="text" value={codigoWeg} onChange={e => setCodigoWeg(e.target.value)}
                  placeholder="Autogero se vazio" className="w-full px-3 py-2 bg-white/5 border border-white/20 rounded text-white text-sm focus:border-sol focus:outline-none" />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-white/70 mb-1">
                Specs (JSON extraído — edite se quiser corrigir algum valor)
              </label>
              <textarea
                rows={6}
                value={specsJson}
                onChange={e => setSpecsJson(e.target.value)}
                className="w-full px-3 py-2 bg-noite border border-white/20 rounded text-white text-xs font-mono focus:border-sol focus:outline-none resize-none"
              />
            </div>
          </div>
        )}

        {/* Etapa 5 — Preço */}
        {extraido && (
          <div className="p-4 rounded-lg bg-sol/5 border border-sol/20 space-y-3">
            <p className="text-[10px] uppercase tracking-wider font-bold text-sol">💰 Preço (sem desconto)</p>
            <div>
              <label className="block text-xs font-semibold text-white/70 mb-1">
                Preço de tabela (R$) — {ehWeg ? 'sistema aplicará desconto WEG 0,4182' : `fabricante ${fabricante || '?'} — sem fator, custo = tabela`}
              </label>
              <input type="number" inputMode="decimal" step="0.01" value={precoTabela} onChange={e => setPrecoTabela(e.target.value)}
                placeholder="Ex: 1370,36" className="w-full px-3 py-2 bg-white/5 border border-white/20 rounded text-white text-sm focus:border-sol focus:outline-none" />
              {precoTabela && !isNaN(parseFloat(precoTabela.replace(',', '.'))) && (
                <p className="text-[10px] text-white/50 mt-1">
                  Custo Spin calculado: <strong className="text-verde">R$ {custoCalc.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</strong>
                  {ehWeg && <span className="text-white/40"> (venda × 0,4182)</span>}
                </p>
              )}
            </div>
          </div>
        )}

        {erro && (
          <div className="p-2.5 bg-coral/10 border border-coral/30 rounded text-xs text-coral">
            ⚠️ {erro}
          </div>
        )}

        <div className="flex gap-2 pt-1">
          <button onClick={onClose} disabled={salvando || pending}
            className="flex-1 py-2 bg-white/5 border border-white/10 text-white/70 text-sm rounded-lg hover:bg-white/10 transition disabled:opacity-40">
            Cancelar
          </button>
          <button onClick={handleSalvar} disabled={!podeSalvar}
            className="flex-1 py-2 bg-sol text-noite text-sm font-bold rounded-lg hover:bg-sol/90 disabled:opacity-40 transition">
            {salvando || pending ? 'Salvando...' : '✓ Cadastrar produto'}
          </button>
        </div>
      </div>
    </div>
  )
}
