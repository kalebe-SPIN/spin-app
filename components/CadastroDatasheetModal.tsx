'use client'

import { useEffect, useState, useRef, useTransition } from 'react'
import { createPortal } from 'react-dom'
import { criarProdutoViaDatasheetAction, type CategoriaProduto } from '@/app/admin/catalogo/actions'
import { lerDatasheet, subirDatasheet, ehFabricanteWeg, FATOR_CUSTO_WEG, type DadosDatasheet } from '@/lib/catalogo/datasheet-cliente'

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

/**
 * Inversor solar precisa da subcategoria certa pra aparecer nas propostas
 * (o fluxo filtra por ela) — não vale o texto livre que a IA sugere.
 */
const SUBCATEGORIAS_INVERSOR = [
  { valor: 'inversor_hibrido', rotulo: 'Inversor híbrido' },
  { valor: 'inversor_string', rotulo: 'Inversor string' },
  { valor: 'microinversor', rotulo: 'Microinversor' },
]
const subcategoriaInversorDe = (texto: string | null | undefined, padrao?: string) => {
  const t = String(texto || '').toLowerCase()
  if (/micro/.test(t)) return 'microinversor'
  if (/h[ií]brid/.test(t)) return 'inversor_hibrido'
  if (/string|on.?grid|trif|monof/.test(t)) return 'inversor_string'
  return padrao || 'inversor_string'
}

/** "1.370,36" (pt-BR) ou "1370.36" → número; vazio → NaN */
const lerValor = (s: string) => {
  const t = s.trim()
  if (!t) return NaN
  if (!t.includes(',') && /^\d+\.\d{1,2}$/.test(t)) return parseFloat(t)
  return parseFloat(t.replace(/\./g, '').replace(',', '.'))
}

export function CadastroDatasheetModal({
  onClose,
  onCreated,
  categoriaInicial,
  subcategoriaInversor,
}: {
  onClose: () => void
  onCreated: (produtoId?: string) => void
  /** Categoria já marcada ao abrir (ex.: "inversor" a partir da proposta) */
  categoriaInicial?: CategoriaProduto
  /** Subcategoria padrão de inversor (string, micro ou híbrido, conforme a proposta) */
  subcategoriaInversor?: string
}) {
  const [pending, startTransition] = useTransition()
  const [extraindo, setExtraindo] = useState(false)
  const [salvando, setSalvando] = useState(false)
  const [categoria, setCategoria] = useState<CategoriaProduto>(categoriaInicial || 'placa')
  const [arquivo, setArquivo] = useState<File | null>(null)
  const [extraido, setExtraido] = useState<DadosDatasheet | null>(null)
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
  // Vai direto no <body>: dentro de popup com desfoque o "fixed" ficaria preso no cartão
  const [montado, setMontado] = useState(false)
  useEffect(() => setMontado(true), [])

  const ehWeg = ehFabricanteWeg(fabricante)
  const precoNum = lerValor(precoTabela)
  const custoCalc = !isNaN(precoNum) ? (ehWeg ? precoNum * FATOR_CUSTO_WEG : precoNum) : 0

  function trocarCategoria(c: CategoriaProduto) {
    setCategoria(c); setExtraido(null)
    if (c === 'inversor') setSubcategoria(subcategoriaInversorDe(null, subcategoriaInversor))
  }

  async function handleExtrair() {
    setErro(null)
    if (!arquivo) { setErro('Anexe o PDF do datasheet primeiro'); return }
    setExtraindo(true)
    try {
      const e = await lerDatasheet(arquivo, categoria)
      if ('erro' in e) { setErro(e.erro); return }
      setExtraido(e)
      setFabricante(e.fabricante || '')
      setModelo(e.modelo || '')
      setDescricao(e.descricao_curta || '')
      setSubcategoria(categoria === 'inversor' ? subcategoriaInversorDe(`${e.subcategoria || ''} ${e.descricao_curta || ''}`, subcategoriaInversor) : (e.subcategoria || ''))
      setCodigoWeg(e.codigo_sugerido || '')
      setSpecsJson(JSON.stringify(e.specs || {}, null, 2))
    } finally {
      setExtraindo(false)
    }
  }

  /** Sem datasheet (ou a IA falhou): abre os campos pra preencher à mão */
  function preencherManual() {
    setErro(null)
    setExtraido({})
    if (categoria === 'inversor' && !subcategoria) setSubcategoria(subcategoriaInversorDe(null, subcategoriaInversor))
    if (!specsJson) setSpecsJson(categoria === 'placa' ? '{\n  "potencia_wp": null\n}' : categoria === 'inversor' ? '{\n  "potencia_kw": null,\n  "tensao_desc": null,\n  "entradas_mppt": null\n}' : categoria === 'bateria' ? '{\n  "capacidade_kwh": null\n}' : '{}')
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
    // Sem a potência o equipamento não entra no dimensionamento das propostas
    if (categoria === 'placa' && !(Number(specsObj.potencia_wp) > 0)) { setErro('Informe a potência da placa (specs → potencia_wp)'); return }
    if (categoria === 'inversor' && !(Number(specsObj.potencia_kw) > 0)) { setErro('Informe a potência do inversor (specs → potencia_kw)'); return }

    setSalvando(true)
    try {
      // 1. Upload do PDF pro storage pra ficar como url_datasheet (falhou → segue sem anexo)
      const urlDatasheet = arquivo ? await subirDatasheet(arquivo, codigoWeg.trim() || null) : null

      startTransition(async () => {
        const res = await criarProdutoViaDatasheetAction({
          categoria,
          modelo: modelo.trim(),
          fabricante: fabricante.trim(),
          codigo_weg: codigoWeg.trim() || undefined,
          subcategoria: subcategoria.trim() || undefined,
          descricao_curta: descricao.trim(),
          descricao_tecnica: extraido?.descricao_tecnica || undefined,
          specs: specsObj,
          preco_tabela_weg: (!isNaN(precoNum) && precoNum > 0) ? precoNum : undefined,
          url_datasheet: urlDatasheet || undefined,
        })
        if ('erro' in res) {
          setErro(res.erro)
          setSalvando(false)
          return
        }
        onCreated(res.produto_id)
        onClose()
      })
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Erro ao salvar')
      setSalvando(false)
    }
  }

  const podeExtrair = !!arquivo && !extraindo && !extraido
  const podeSalvar = !!extraido && !salvando && !pending && !!modelo.trim() && !!fabricante.trim() && !!descricao.trim()

  if (!montado) return null
  return createPortal(
    // Abre por cima dos popups de proposta (z-50/60) e não deixa o clique fechar o popup de baixo
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-[70] flex items-center justify-center p-4" onClick={(e) => e.stopPropagation()}>
      <div className="bg-noite border border-white/20 rounded-xl p-6 max-w-2xl w-full space-y-4 shadow-2xl max-h-[92vh] overflow-y-auto">
        <div className="flex items-center justify-between">
          <h3 className="text-xl font-bold text-white">📄 Cadastrar equipamento (datasheet)</h3>
          <button onClick={onClose} className="text-white/60 hover:text-white text-xl">✕</button>
        </div>

        <p className="text-xs text-white/60 leading-relaxed">
          Escolha a categoria, anexe o PDF do datasheet e a IA extrai as specs automaticamente.
          Você revisa, digita o preço de tabela (sem desconto) e cadastra. Sem datasheet, dá pra preencher à mão.
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
                  onClick={() => trocarCategoria(c.chave)}
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
          <label className="block text-xs font-semibold text-white/70 mb-2">2. Datasheet PDF</label>
          <input
            ref={inputRef}
            type="file"
            accept="application/pdf,image/png,image/jpeg,image/webp"
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

        {/* Etapa 3 — Extrair via IA (ou preencher à mão) */}
        {!extraido && !extraindo && (
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={handleExtrair}
              disabled={!podeExtrair}
              className="py-2.5 bg-weg-azul text-white font-bold text-sm rounded-lg hover:bg-weg-azul/90 disabled:opacity-40 transition"
            >
              🤖 Ler datasheet com IA
            </button>
            <button
              type="button"
              onClick={preencherManual}
              className="py-2.5 bg-white/[0.06] border border-white/15 text-white font-bold text-sm rounded-lg hover:bg-white/10 transition"
            >
              ✍️ Preencher à mão
            </button>
          </div>
        )}
        {extraindo && (
          <div className="p-3 border border-weg-azul/40 rounded-lg text-center text-xs text-white/80">
            🤖 Lendo o datasheet... isso leva ~10-20 segundos
          </div>
        )}

        {/* Etapa 4 — Revisão do que a IA extraiu */}
        {extraido && (
          <div className="space-y-3 p-4 rounded-lg border border-verde/30">
            <p className="text-[10px] uppercase tracking-wider font-bold text-white/70">
              {arquivo && Object.keys(extraido).length ? '✓ Specs extraídas · revise antes de salvar' : 'Dados do equipamento'}
            </p>
            {extraido.observacoes && <p className="text-[11px] text-white/55">IA: {extraido.observacoes}</p>}

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
                <label className="block text-xs font-semibold text-white/70 mb-1">Subcategoria{categoria === 'inversor' ? ' *' : ''}</label>
                {categoria === 'inversor' ? (
                  <select value={subcategoria} onChange={e => setSubcategoria(e.target.value)}
                    className="w-full px-3 py-2 bg-white/5 border border-white/20 rounded text-white text-sm focus:border-sol focus:outline-none">
                    {SUBCATEGORIAS_INVERSOR.map(s => <option key={s.valor} value={s.valor} className="bg-noite">{s.rotulo}</option>)}
                  </select>
                ) : (
                  <input type="text" value={subcategoria} onChange={e => setSubcategoria(e.target.value)}
                    className="w-full px-3 py-2 bg-white/5 border border-white/20 rounded text-white text-sm focus:border-sol focus:outline-none" />
                )}
              </div>
              <div>
                <label className="block text-xs font-semibold text-white/70 mb-1">SKU / Código</label>
                <input type="text" value={codigoWeg} onChange={e => setCodigoWeg(e.target.value)}
                  placeholder="Autogero se vazio" className="w-full px-3 py-2 bg-white/5 border border-white/20 rounded text-white text-sm focus:border-sol focus:outline-none" />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-white/70 mb-1">
                Specs (JSON — edite se quiser corrigir algum valor)
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
          <div className="p-4 rounded-lg border border-sol/30 space-y-3">
            <p className="text-[10px] uppercase tracking-wider font-bold text-white/70">💰 Preço (sem desconto)</p>
            <div>
              <label className="block text-xs font-semibold text-white/70 mb-1">
                Preço de tabela (R$) — {ehWeg ? `o sistema aplica o fator WEG ${String(FATOR_CUSTO_WEG).replace('.', ',')}` : `fabricante ${fabricante || '?'} — sem fator, custo = tabela`}
              </label>
              <input type="text" inputMode="decimal" value={precoTabela} onChange={e => setPrecoTabela(e.target.value)}
                placeholder="Ex.: 1.370,36" className="w-full px-3 py-2 bg-white/5 border border-white/20 rounded text-white text-sm focus:border-sol focus:outline-none" />
              {!isNaN(precoNum) && precoNum > 0 && (
                <p className="text-[10px] text-white/50 mt-1">
                  Custo Spin calculado: <strong className="text-white">{custoCalc.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</strong>
                  {ehWeg && <span className="text-white/40"> (tabela × {String(FATOR_CUSTO_WEG).replace('.', ',')})</span>}
                </p>
              )}
              {!(precoNum > 0) && <p className="text-[10px] text-white/45 mt-1">Sem preço o item fica cadastrado, mas não aparece nas propostas até ter preço.</p>}
            </div>
          </div>
        )}

        {erro && (
          <div className="p-2.5 border border-coral/40 rounded text-xs text-white/85">
            ⚠️ {erro}
          </div>
        )}

        <div className="flex gap-2 pt-1">
          <button onClick={onClose} disabled={salvando || pending}
            className="flex-1 py-2 bg-white/5 border border-white/10 text-white/70 text-sm rounded-lg hover:bg-white/10 transition disabled:opacity-40">
            Cancelar
          </button>
          <button onClick={handleSalvar} disabled={!podeSalvar}
            className="flex-1 py-2 bg-verde text-white text-sm font-bold rounded-lg hover:bg-verde/90 disabled:opacity-40 transition">
            {salvando || pending ? 'Salvando...' : '✓ Cadastrar produto'}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
