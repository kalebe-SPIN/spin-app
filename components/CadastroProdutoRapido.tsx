'use client'

/**
 * Modal de cadastro rápido de produto — Kalebe 2026-09-01.
 *
 * Usado na tela /admin/catalogo/diagnostico: cada linha com problema
 * (categoria vazia ou sem preço) ganha botão que abre este modal com
 * a categoria pré-preenchida. Salvar cria produto novo + preço vigente.
 */

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { criarProdutoManualAction } from '@/app/admin/catalogo/actions'

type Props = {
  categoria: string
  labelCategoria: string
  contemEsperado: string
}

export function CadastroProdutoRapido({ categoria, labelCategoria, contemEsperado }: Props) {
  const [aberto, setAberto] = useState(false)
  const [modelo, setModelo] = useState('')
  const [fabricante, setFabricante] = useState('WEG')
  const [codigoWeg, setCodigoWeg] = useState('')
  const [potenciaKw, setPotenciaKw] = useState('')
  const [precoVenda, setPrecoVenda] = useState('')
  const [erro, setErro] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const router = useRouter()

  function salvar() {
    setErro(null)
    if (!modelo.trim()) { setErro('Modelo obrigatório'); return }
    if (!Number(precoVenda) || Number(precoVenda) <= 0) { setErro('Preço obrigatório'); return }
    startTransition(async () => {
      const r = await criarProdutoManualAction({
        categoria: categoria as any,
        modelo: modelo.trim(),
        fabricante: fabricante.trim() || 'WEG',
        codigo_weg: codigoWeg.trim() || undefined,
        descricao_curta: modelo.trim(),
        potencia_kw: Number(potenciaKw) || undefined,
        preco_venda: Number(precoVenda),
        ativo: true,
        disponivel_estoque: true,
      })
      if ('erro' in r) {
        setErro(r.erro)
      } else {
        setAberto(false)
        setModelo(''); setCodigoWeg(''); setPotenciaKw(''); setPrecoVenda('')
        router.refresh()
      }
    })
  }

  return (
    <>
      <button type="button" onClick={() => setAberto(true)}
        className="text-[10px] font-bold px-2 py-0.5 rounded bg-verde/20 border border-verde/40 text-verde hover:bg-verde/30">
        + Cadastrar rápido
      </button>

      {aberto && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4"
          onClick={() => setAberto(false)}>
          <div className="bg-noite border border-white/15 rounded-xl w-full max-w-lg p-5 space-y-3"
            onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between">
              <div>
                <p className="text-sm font-bold text-white">Cadastro rápido</p>
                <p className="text-[11px] text-white/50">
                  Categoria: <span className="font-mono text-sol">{categoria}</span> — {labelCategoria}
                </p>
                <p className="text-[10px] text-white/40 mt-0.5">Esperado: {contemEsperado}</p>
              </div>
              <button onClick={() => setAberto(false)} className="text-white/50 hover:text-white text-xl">×</button>
            </div>

            {erro && (
              <p className="text-[11px] px-2 py-1 bg-coral/10 border border-coral/30 rounded text-coral">
                ⚠ {erro}
              </p>
            )}

            <div className="space-y-2">
              <Field label="Modelo *" required>
                <input value={modelo} onChange={(e) => setModelo(e.target.value)}
                  placeholder={`Ex: ${contemEsperado.split('/')[0] || 'Modelo do produto'}`}
                  className="w-full px-3 py-2 bg-noite/40 border border-white/10 rounded text-xs text-white" />
              </Field>
              <div className="grid grid-cols-2 gap-2">
                <Field label="Fabricante">
                  <input value={fabricante} onChange={(e) => setFabricante(e.target.value)}
                    className="w-full px-3 py-2 bg-noite/40 border border-white/10 rounded text-xs text-white" />
                </Field>
                <Field label="Código WEG (opcional)">
                  <input value={codigoWeg} onChange={(e) => setCodigoWeg(e.target.value)}
                    placeholder="SKU"
                    className="w-full px-3 py-2 bg-noite/40 border border-white/10 rounded text-xs text-white" />
                </Field>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <Field label="Potência (kW) — opcional">
                  <input type="number" step="0.1" value={potenciaKw}
                    onChange={(e) => setPotenciaKw(e.target.value)}
                    placeholder="Ex: 10"
                    className="w-full px-3 py-2 bg-noite/40 border border-white/10 rounded text-xs text-white" />
                </Field>
                <Field label="Preço venda (R$) *" required>
                  <input type="number" step="0.01" value={precoVenda}
                    onChange={(e) => setPrecoVenda(e.target.value)}
                    placeholder="0,00"
                    className="w-full px-3 py-2 bg-sol/5 border border-sol/40 rounded text-xs text-white font-bold" />
                </Field>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button type="button" onClick={() => setAberto(false)}
                className="px-3 py-1.5 text-xs text-white/60 hover:text-white">
                Cancelar
              </button>
              <button type="button" onClick={salvar} disabled={isPending}
                className="px-4 py-1.5 bg-sol text-noite font-bold text-xs rounded hover:bg-sol/90 disabled:opacity-40">
                {isPending ? '⏳ Salvando…' : '✓ Cadastrar'}
              </button>
            </div>

            <p className="text-[10px] text-white/40">
              💡 Cadastro rápido cria produto ativo com 1 preço vigente. Pra especs completas (datasheet, imagem, subcategoria), edite depois em <span className="text-sol">/admin/catalogo</span>.
            </p>
          </div>
        </div>
      )}
    </>
  )
}

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-[10px] uppercase tracking-wider text-white/40 block mb-1">
        {label}{required && <span className="text-coral"> *</span>}
      </span>
      {children}
    </label>
  )
}
