'use client'

import { useState, useTransition } from 'react'
import { fmtNum } from '@/lib/formatters'
import { useRouter } from 'next/navigation'
import { createBrowserClient } from '@supabase/ssr'
import { editarProdutoAction } from '@/app/admin/catalogo/actions'
import type { CategoriaProduto } from '@/app/admin/catalogo/actions'

export type ProdutoParaEdicao = {
  id: string
  categoria: CategoriaProduto
  modelo: string
  fabricante: string | null
  subcategoria: string | null
  descricao_curta: string | null
  descricao_tecnica: string | null
  codigo_weg: string | null
  codigo_interno_spin: string | null
  ativo: boolean
  disponivel_estoque: boolean
  specs: Record<string, any> | null
  preco_venda_atual?: number | null
  url_imagem?: string | null
  url_datasheet?: string | null
}

const CATEGORIAS: CategoriaProduto[] = [
  'placa', 'inversor', 'bateria', 'estrutura', 'cabo_cc', 'cabo_ca',
  'conector', 'string_box', 'disjuntor', 'dps', 'eletroduto',
  'aterramento', 'quadro', 'smart_meter', 'monitoramento',
  'mao_de_obra', 'projeto_engenharia', 'frete', 'identificacao', 'outro',
]

/**
 * Modal de edição de produto do catálogo. Aberto pelo botão ✏ ao lado
 * de "Pontos críticos" em cada linha. Só admin.
 */
export function EditarProdutoModal({
  produto, onFechar,
}: {
  produto: ProdutoParaEdicao
  onFechar: () => void
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [erro, setErro] = useState<string | null>(null)

  const [categoria, setCategoria] = useState<CategoriaProduto>(produto.categoria)
  const [modelo, setModelo] = useState(produto.modelo || '')
  const [fabricante, setFabricante] = useState(produto.fabricante || '')
  const [subcategoria, setSubcategoria] = useState(produto.subcategoria || '')
  const [descCurta, setDescCurta] = useState(produto.descricao_curta || '')
  const [descTec, setDescTec] = useState(produto.descricao_tecnica || '')
  const [codigoWeg, setCodigoWeg] = useState(produto.codigo_weg || '')
  const [codigoSpin, setCodigoSpin] = useState(produto.codigo_interno_spin || '')
  const [ativo, setAtivo] = useState(produto.ativo)
  const [disponivel, setDisponivel] = useState(produto.disponivel_estoque)
  const [precoVenda, setPrecoVenda] = useState<number>(produto.preco_venda_atual || 0)
  const [urlImagem, setUrlImagem] = useState<string>(produto.url_imagem || '')
  const [urlDatasheet, setUrlDatasheet] = useState<string>(produto.url_datasheet || '')
  const [uploadando, setUploadando] = useState(false)
  const [uploadandoPdf, setUploadandoPdf] = useState(false)

  const supabaseBrowser = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  )

  async function uploadImagem(file: File) {
    setUploadando(true)
    setErro(null)
    try {
      const ext = (file.name.split('.').pop() || 'png').toLowerCase()
      const path = `produtos/${produto.id}-${Date.now()}.${ext}`
      const { error: upErr } = await supabaseBrowser.storage
        .from('weg-catalogo')
        .upload(path, file, { cacheControl: '3600', upsert: true, contentType: file.type || 'image/png' })
      if (upErr) throw upErr
      const { data } = supabaseBrowser.storage.from('weg-catalogo').getPublicUrl(path)
      setUrlImagem(data.publicUrl)
    } catch (e: any) {
      setErro(`Falha no upload: ${e.message || e}`)
    } finally {
      setUploadando(false)
    }
  }

  const [extraindoSpecs, setExtraindoSpecs] = useState(false)
  const [avisoIa, setAvisoIa] = useState<string | null>(null)

  async function uploadDatasheet(file: File) {
    setUploadandoPdf(true); setErro(null); setAvisoIa(null)
    try {
      if (file.size > 20 * 1024 * 1024) throw new Error('PDF > 20MB')

      // 1. Sobe o arquivo no storage
      const path = `datasheets/${produto.id}-${Date.now()}.pdf`
      const { error: upErr } = await supabaseBrowser.storage
        .from('weg-catalogo')
        .upload(path, file, { cacheControl: '3600', upsert: true, contentType: 'application/pdf' })
      if (upErr) throw upErr
      const { data } = supabaseBrowser.storage.from('weg-catalogo').getPublicUrl(path)
      setUrlDatasheet(data.publicUrl)
      setUploadandoPdf(false)

      // 2. Kalebe 2026-08-31: pedir pra IA extrair specs do PDF e
      //    pré-preencher a ficha. Não sobrescreve campos já preenchidos.
      setExtraindoSpecs(true)
      const fd = new FormData()
      fd.append('arquivo', file)
      fd.append('categoria', categoria)
      const res = await fetch('/api/extrair-datasheet', { method: 'POST', body: fd })
      const json = await res.json()
      if (!res.ok || !json.sucesso) {
        setAvisoIa(`IA não conseguiu extrair specs: ${json.erro || res.statusText}. Arquivo foi anexado mesmo assim.`)
        return
      }

      const specs = (json.specs || {}) as any
      const preencherStr = (atual: string, novo: any): string =>
        (!atual || !atual.trim()) && novo != null && String(novo).trim() ? String(novo) : atual
      const preencherNum = (atual: number, novo: any): number =>
        (!atual || atual <= 0) && Number(novo) > 0 ? Number(novo) : atual

      setFabricante((v: string) => preencherStr(v, json.fabricante))
      setModelo((v: string) => preencherStr(v, json.modelo))
      setDescCurta((v: string) => preencherStr(v, json.descricao_curta))
      if (json.subcategoria) setSubcategoria((v: string) => v || json.subcategoria)
      if (json.codigo_sugerido) setCodigoWeg((v: string) => v || json.codigo_sugerido)

      // Specs por categoria — só preenche se veio da IA e o campo tá zerado
      if (categoria === 'placa') {
        setPotenciaWp((v: number) => preencherNum(v, specs.potencia_wp))
        setAreaM2((v: number) => preencherNum(v, specs.area_m2))
        setLarguraMm((v: number) => preencherNum(v, specs.largura_mm))
        setTipoCelula((v: string) => preencherStr(v, specs.tipo_celula))
      } else if (categoria === 'inversor') {
        setPotenciaKw((v: number) => preencherNum(v, specs.potencia_kw))
        setTensaoDesc((v: string) => preencherStr(v, specs.tensao_desc))
        setDisjuntor((v: string) => preencherStr(v, specs.disjuntor_equivalente))
        setEntradasMppt((v: number) => preencherNum(v, specs.entradas_mppt))
      } else if (categoria === 'bateria') {
        setCapacidadeKwh((v: number) => preencherNum(v, specs.capacidade_kwh))
        setPotenciaKw((v: number) => preencherNum(v, specs.potencia_kw))
        setTensaoDesc((v: string) => preencherStr(v, specs.tensao_desc))
      }

      setAvisoIa('✓ Specs extraídas do datasheet — revise antes de salvar')
    } catch (e: any) {
      setErro(`Falha: ${e.message || e}`)
    } finally {
      setUploadandoPdf(false)
      setExtraindoSpecs(false)
    }
  }

  const specs = produto.specs || {}
  // Placa
  const [potenciaWp, setPotenciaWp] = useState<number>(specs.potencia_wp || 0)
  const [areaM2, setAreaM2] = useState<number>(specs.area_m2 || 0)
  const [larguraMm, setLarguraMm] = useState<number>(specs.largura_mm || 0)
  const [tipoCelula, setTipoCelula] = useState(specs.tipo_celula || '')
  // Inversor
  const [potenciaKw, setPotenciaKw] = useState<number>(specs.potencia_kw || 0)
  const [tensaoDesc, setTensaoDesc] = useState(specs.tensao_desc || '')
  const [disjuntor, setDisjuntor] = useState(specs.disjuntor_equivalente || '')
  const [entradasMppt, setEntradasMppt] = useState<number>(specs.entradas_mppt || 0)
  // Bateria
  const [capacidadeKwh, setCapacidadeKwh] = useState<number>(specs.capacidade_kwh || 0)

  function salvar() {
    setErro(null)
    startTransition(async () => {
      const r = await editarProdutoAction(produto.id, {
        categoria,
        modelo: modelo.trim(),
        fabricante: fabricante.trim(),
        subcategoria: subcategoria || undefined,
        descricao_curta: descCurta.trim(),
        descricao_tecnica: descTec || undefined,
        codigo_weg: codigoWeg || undefined,
        codigo_interno_spin: codigoSpin || undefined,
        ativo,
        disponivel_estoque: disponivel,
        // specs por categoria (a action ignora as que não fazem sentido)
        potencia_wp: potenciaWp > 0 ? potenciaWp : undefined,
        area_m2: areaM2 > 0 ? areaM2 : undefined,
        largura_mm: larguraMm > 0 ? larguraMm : undefined,
        tipo_celula: tipoCelula || undefined,
        potencia_kw: potenciaKw > 0 ? potenciaKw : undefined,
        tensao_desc: tensaoDesc || undefined,
        disjuntor_equivalente: disjuntor || undefined,
        entradas_mppt: entradasMppt > 0 ? entradasMppt : undefined,
        capacidade_kwh: capacidadeKwh > 0 ? capacidadeKwh : undefined,
        preco_venda: precoVenda > 0 ? precoVenda : undefined,
        url_imagem: urlImagem || undefined,
        url_datasheet: urlDatasheet || undefined,
      })
      if ('erro' in r) { setErro(r.erro); return }
      router.refresh()
      onFechar()
    })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60" onClick={onFechar}>
      <div className="bg-noite border border-sol/25 rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/10 sticky top-0 bg-noite z-10">
          <div>
            <p className="text-white font-bold">Editar produto</p>
            <p className="text-white/40 text-xs mt-0.5">{produto.modelo}</p>
          </div>
          <button onClick={onFechar} className="text-white/50 hover:text-white text-xl">×</button>
        </div>

        <div className="p-5 space-y-4">
          {/* Anexos do produto — imagem + datasheet */}
          <Sec titulo="Anexos do produto">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <SlotAnexo
                titulo="Imagem do produto"
                emoji="📸"
                accept="image/png,image/jpeg,image/webp"
                url={urlImagem}
                enviando={uploadando}
                onArquivo={uploadImagem}
                onRemover={() => setUrlImagem('')}
                mensagemVazio="Nenhuma imagem"
                cta="Anexar PNG/JPG"
                cor="sol"
                preview={urlImagem ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={urlImagem} alt="Produto" className="w-full h-full object-contain" />
                ) : null}
              />
              <SlotAnexo
                titulo="Datasheet PDF"
                emoji="📄"
                accept="application/pdf"
                url={urlDatasheet}
                enviando={uploadandoPdf || extraindoSpecs}
                onArquivo={uploadDatasheet}
                onRemover={() => setUrlDatasheet('')}
                mensagemVazio="Sem PDF"
                cta="Anexar PDF"
                cor="weg-azul"
                dica={extraindoSpecs
                  ? '🤖 IA lendo specs…'
                  : (avisoIa || 'A IA extrai as specs após o upload')}
                dicaCor={extraindoSpecs
                  ? 'sol'
                  : avisoIa?.startsWith('✓') ? 'verde' : avisoIa ? 'coral' : 'white/50'}
                preview={urlDatasheet ? <span className="text-3xl">📄</span> : null}
              />
            </div>
          </Sec>

          {/* Identificação */}
          <Sec titulo="Identificação">
            <div className="grid grid-cols-2 gap-3">
              <Field label="Categoria">
                <select value={categoria} onChange={(e) => setCategoria(e.target.value as CategoriaProduto)}
                  className="input">
                  {CATEGORIAS.map((c) => (
                    <option key={c} value={c} className="bg-noite">{c.replace(/_/g, ' ')}</option>
                  ))}
                </select>
              </Field>
              <Field label="Subcategoria">
                <input value={subcategoria} onChange={(e) => setSubcategoria(e.target.value)}
                  placeholder="Ex: bifacial, half-cell..." className="input" />
              </Field>
            </div>
            <Field label="Modelo *">
              <input value={modelo} onChange={(e) => setModelo(e.target.value)} className="input" />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Fabricante *">
                <input value={fabricante} onChange={(e) => setFabricante(e.target.value)} className="input" />
              </Field>
              <Field label="Código WEG (SKU)">
                <input value={codigoWeg} onChange={(e) => setCodigoWeg(e.target.value)} className="input" />
              </Field>
            </div>
            <Field label="Código interno SPIN">
              <input value={codigoSpin} onChange={(e) => setCodigoSpin(e.target.value)}
                placeholder="opcional — gerado automaticamente se em branco" className="input" />
            </Field>
          </Sec>

          {/* Descrição */}
          <Sec titulo="Descrição">
            <Field label="Descrição curta *">
              <input value={descCurta} onChange={(e) => setDescCurta(e.target.value)}
                placeholder="Ex: Placa 625Wp JA Solar Bifacial" className="input" />
            </Field>
            <Field label="Descrição técnica (opcional)">
              <textarea value={descTec} onChange={(e) => setDescTec(e.target.value)} rows={2} className="input" />
            </Field>
          </Sec>

          {/* Specs por categoria */}
          {categoria === 'placa' && (
            <Sec titulo="Specs — Placa">
              <div className="grid grid-cols-2 gap-3">
                <Field label="Potência (Wp)">
                  <input type="number" step={1} value={potenciaWp || ''} onChange={(e) => setPotenciaWp(Number(e.target.value))} className="input" />
                </Field>
                <Field label="Área (m²)">
                  <input type="number" step={0.01} value={areaM2 || ''} onChange={(e) => setAreaM2(Number(e.target.value))} className="input" />
                </Field>
                <Field label="Largura (mm)">
                  <input type="number" step={1} value={larguraMm || ''} onChange={(e) => setLarguraMm(Number(e.target.value))} className="input" />
                </Field>
                <Field label="Tipo de célula">
                  <input value={tipoCelula} onChange={(e) => setTipoCelula(e.target.value)}
                    placeholder="n-TYPE, PERC, TOPCon..." className="input" />
                </Field>
              </div>
            </Sec>
          )}

          {categoria === 'inversor' && (
            <Sec titulo="Specs — Inversor">
              <div className="grid grid-cols-2 gap-3">
                <Field label="Potência (kW)">
                  <input type="number" step={0.1} value={potenciaKw || ''} onChange={(e) => setPotenciaKw(Number(e.target.value))} className="input" />
                </Field>
                <Field label="Tensão / fases">
                  <input value={tensaoDesc} onChange={(e) => setTensaoDesc(e.target.value)}
                    placeholder="Monofásico 220V, Trifásico 380V..." className="input" />
                </Field>
                <Field label="Disjuntor equivalente">
                  <input value={disjuntor} onChange={(e) => setDisjuntor(e.target.value)}
                    placeholder="MDWP-C50-2..." className="input" />
                </Field>
                <Field label="Entradas MPPT">
                  <input type="number" step={1} value={entradasMppt || ''} onChange={(e) => setEntradasMppt(Number(e.target.value))} className="input" />
                </Field>
              </div>
            </Sec>
          )}

          {categoria === 'bateria' && (
            <Sec titulo="Specs — Bateria">
              <div className="grid grid-cols-2 gap-3">
                <Field label="Capacidade (kWh)">
                  <input type="number" step={0.1} value={capacidadeKwh || ''} onChange={(e) => setCapacidadeKwh(Number(e.target.value))} className="input" />
                </Field>
                <Field label="Potência (kW)">
                  <input type="number" step={0.1} value={potenciaKw || ''} onChange={(e) => setPotenciaKw(Number(e.target.value))} className="input" />
                </Field>
                <Field label="Tensão">
                  <input value={tensaoDesc} onChange={(e) => setTensaoDesc(e.target.value)} className="input" />
                </Field>
              </div>
            </Sec>
          )}

          {/* Preço */}
          <Sec titulo="Preço">
            <Field label={`Preço de venda (R$) — atual: ${(produto.preco_venda_atual || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}`}>
              <input type="number" step={0.01} value={precoVenda || ''} onChange={(e) => setPrecoVenda(Number(e.target.value))}
                placeholder="Deixe vazio pra manter o preço atual"
                className="input" />
              <p className="text-[11px] text-white/40 mt-1">
                Preço novo cria linha nova em precos_produtos (histórico preservado — SCD tipo 2). O anterior fica com vigente_ate = hoje.
              </p>
            </Field>
          </Sec>

          {/* Status */}
          <Sec titulo="Status">
            <div className="grid grid-cols-2 gap-2">
              <label className="flex items-center gap-2 p-2 bg-white/5 border border-white/10 rounded cursor-pointer text-sm text-white/80">
                <input type="checkbox" checked={ativo} onChange={(e) => setAtivo(e.target.checked)} className="accent-sol" />
                Ativo (aparece na escolha de kit)
              </label>
              <label className="flex items-center gap-2 p-2 bg-white/5 border border-white/10 rounded cursor-pointer text-sm text-white/80">
                <input type="checkbox" checked={disponivel} onChange={(e) => setDisponivel(e.target.checked)} className="accent-sol" />
                Disponível em estoque
              </label>
            </div>
          </Sec>

          {erro && <p className="text-sm text-coral">{erro}</p>}
        </div>

        <div className="px-5 py-3 border-t border-white/10 flex justify-end gap-2 sticky bottom-0 bg-noite">
          <button onClick={onFechar} className="px-3 py-2 text-sm text-white/60 hover:text-white">Cancelar</button>
          <button onClick={salvar} disabled={isPending}
            className="px-4 py-2 bg-sol text-noite-0 font-bold text-sm rounded-lg hover:bg-sol-claro disabled:opacity-50">
            {isPending ? 'Salvando...' : 'Salvar alterações'}
          </button>
        </div>

        <style jsx>{`
          .input {
            width: 100%;
            padding: 0.5rem 0.75rem;
            background: rgba(255,255,255,0.05);
            border: 1px solid rgba(255,255,255,0.15);
            border-radius: 0.5rem;
            color: white;
            font-size: 0.875rem;
          }
        `}</style>
      </div>
    </div>
  )
}

function Sec({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <div className="p-3 bg-white/[0.02] border border-white/10 rounded-lg space-y-3">
      <p className="text-[10px] uppercase tracking-wider font-bold text-sol">{titulo}</p>
      {children}
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs text-white/60 mb-1">{label}</label>
      {children}
    </div>
  )
}

/**
 * Slot de anexo unificado — thumbnail em cima, botão custom embaixo,
 * sem o texto nativo feio 'Nenhum arquivo escolhido'. Kalebe 2026-08-31.
 */
function SlotAnexo({
  titulo, emoji, accept, url, enviando, onArquivo, onRemover, mensagemVazio,
  cta, cor, preview, dica, dicaCor,
}: {
  titulo: string
  emoji: string
  accept: string
  url: string
  enviando: boolean
  onArquivo: (f: File) => void | Promise<void>
  onRemover: () => void
  mensagemVazio: string
  cta: string
  cor: 'sol' | 'weg-azul'
  preview: React.ReactNode
  dica?: string | null
  dicaCor?: string
}) {
  const corBtn = cor === 'sol'
    ? 'bg-sol/15 border-sol/40 text-sol hover:bg-sol/25'
    : 'bg-weg-azul/15 border-weg-azul/40 text-weg-azul hover:bg-weg-azul/25'
  const corDica = dicaCor === 'sol' ? 'text-sol'
    : dicaCor === 'verde' ? 'text-verde'
    : dicaCor === 'coral' ? 'text-coral'
    : 'text-white/50'

  return (
    <div className="p-3 bg-white/[0.02] border border-white/10 rounded-lg">
      <p className="text-[11px] uppercase font-bold text-white/60 mb-3">{emoji} {titulo}</p>
      <div className="flex items-start gap-3">
        <div className="w-20 h-20 shrink-0 bg-white/5 border border-white/15 rounded-lg overflow-hidden flex items-center justify-center">
          {preview || <span className="text-white/30 text-[10px] text-center px-1">{mensagemVazio}</span>}
        </div>
        <div className="flex-1 min-w-0 space-y-2">
          <label className={`inline-flex items-center gap-1.5 cursor-pointer px-3 py-1.5 rounded border text-[11px] font-bold transition ${corBtn} ${enviando ? 'opacity-40 cursor-wait' : ''}`}>
            {enviando ? '⏳ Enviando…' : `+ ${cta}`}
            <input type="file" accept={accept} disabled={enviando}
              onChange={(e) => { const f = e.target.files?.[0]; if (f) onArquivo(f); e.currentTarget.value = '' }}
              className="hidden" />
          </label>
          {url && (
            <div className="flex gap-3 items-center text-[10px]">
              <a href={url} target="_blank" rel="noreferrer" className="text-sol hover:underline">
                📥 abrir
              </a>
              <button type="button" onClick={onRemover} className="text-coral hover:underline">
                ✕ remover
              </button>
            </div>
          )}
          {dica && !enviando && (
            <p className={`text-[10px] ${corDica}`}>{dica}</p>
          )}
        </div>
      </div>
    </div>
  )
}
