'use client'

import { useState, useRef, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { salvarAnaliseFaturaAction } from '@/app/projetos/[id]/fatura/actions'

type Props = {
  projetoId: string
  analiseSalva: any
}

export function FaturaForm({ projetoId, analiseSalva }: Props) {
  const router = useRouter()
  const inputRef = useRef<HTMLInputElement>(null)
  const [isPending, startTransition] = useTransition()
  const [arquivo, setArquivo] = useState<File | null>(null)
  const [analisando, setAnalisando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [analise, setAnalise] = useState<any>(analiseSalva || null)

  async function processarFatura(file: File) {
    setErro(null)
    setAnalisando(true)
    try {
      const formData = new FormData()
      formData.append('arquivo', file)

      const res = await fetch('/api/analisar-fatura', {
        method: 'POST',
        body: formData,
      })

      const json = await res.json()
      if (!res.ok) {
        throw new Error(json.error || json.erro || 'Erro ao analisar')
      }
      const dados = json.dados || json
      setAnalise(dados)
    } catch (e: any) {
      setErro(e.message || 'Erro ao processar fatura')
    } finally {
      setAnalisando(false)
    }
  }

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setArquivo(file)
    processarFatura(file)
  }

  function handleConfirmar() {
    if (!analise) {
      setErro('Analise a fatura primeiro.')
      return
    }
    startTransition(async () => {
      const result = await salvarAnaliseFaturaAction(projetoId, analise)
      if (result.sucesso) {
        router.push(`/projetos/${projetoId}`)
      } else {
        setErro(result.erro || 'Erro ao salvar')
      }
    })
  }

  const alertaEndereco = analise?.endereco || analise?.logradouro
    ? '⚠️ Endereço da CELESC vem abreviado. Confira com o cliente.'
    : null

  return (
    <div className="space-y-6">
      {/* Upload */}
      {!arquivo && !analise && (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="w-full p-8 border-2 border-dashed border-white/20 rounded-lg text-center hover:border-sol/40 hover:bg-white/[0.02] transition"
        >
          <p className="text-lg font-bold text-white mb-1">📤 Anexar fatura CELESC</p>
          <p className="text-sm text-white/60">PDF ou imagem — a IA analisa em ~15s</p>
        </button>
      )}

      <input
        ref={inputRef}
        type="file"
        accept="application/pdf,image/*"
        className="hidden"
        onChange={handleFileSelect}
      />

      {/* Progresso */}
      {analisando && (
        <div className="bg-sol/10 border border-sol/30 rounded-lg p-4">
          <p className="text-sm text-sol">⏳ Analisando fatura com IA... aguarde ~15s</p>
        </div>
      )}

      {/* Arquivo carregado */}
      {arquivo && !analisando && (
        <div className="bg-white/[0.03] border border-white/10 rounded-lg p-4 flex items-center justify-between">
          <div>
            <p className="text-sm font-bold text-white">{arquivo.name}</p>
            <p className="text-xs text-white/40">{(arquivo.size / 1024).toFixed(0)} KB</p>
          </div>
          <button
            type="button"
            onClick={() => { setArquivo(null); setAnalise(null); if (inputRef.current) inputRef.current.value = '' }}
            className="text-xs text-coral hover:text-coral/80"
          >
            Remover
          </button>
        </div>
      )}

      {/* Resultado da análise */}
      {analise && !analisando && (
        <div className="space-y-4">
          <div className="bg-verde/10 border border-verde/30 rounded-lg p-4">
            <p className="text-sm text-verde font-bold mb-2">✅ Análise concluída</p>
            {alertaEndereco && <p className="text-xs text-sol">{alertaEndereco}</p>}
          </div>

          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            <Info label="Titular" value={analise.titular || analise.cliente_razao_social || '—'} />
            <Info label="Grupo tarifário" value={analise.grupo_tarifario || analise.grupo || '—'} />
            <Info label="Tipo ligação" value={analise.tipo_ligacao || '—'} />
            <Info label="Consumo médio" value={analise.consumo_medio_kwh ? `${analise.consumo_medio_kwh.toFixed(0)} kWh/mês` : '—'} highlight />
            <Info label="Demanda contratada" value={analise.demanda_contratada_kw ? `${analise.demanda_contratada_kw} kW` : '—'} />
            <Info label="Geração atual" value={analise.geracao_media_kwh ? `${analise.geracao_media_kwh.toFixed(0)} kWh/mês` : 'Não tem'} />
            <Info label="UC" value={analise.uc || analise.unidade_consumidora || '—'} />
            <Info label="Cidade/UF" value={`${analise.cidade || '—'}${analise.uf ? '/' + analise.uf : ''}`} />
          </div>

          {analise.observacoes && (
            <div className="bg-white/[0.02] border border-white/10 rounded-lg p-4">
              <p className="text-xs text-white/50 mb-1 uppercase font-bold">Observações da IA</p>
              <p className="text-sm text-white/80">{analise.observacoes}</p>
            </div>
          )}
        </div>
      )}

      {/* Erro */}
      {erro && (
        <div className="bg-coral/10 border border-coral/30 rounded-lg p-4 text-sm text-coral">
          ❌ {erro}
        </div>
      )}

      {/* Submit */}
      {analise && (
        <div className="flex items-center justify-end gap-3 pt-4 border-t border-white/10">
          <button
            type="button"
            onClick={handleConfirmar}
            disabled={isPending}
            className="px-6 py-3 bg-sol text-noite font-bold text-sm rounded-lg disabled:opacity-40"
          >
            {isPending ? 'Salvando...' : 'Confirmar análise → Passo 3 Telhado'}
          </button>
        </div>
      )}
    </div>
  )
}

function Info({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className={`p-3 rounded-lg border ${highlight ? 'bg-sol/10 border-sol/30' : 'bg-white/[0.02] border-white/10'}`}>
      <p className="text-[10px] uppercase tracking-wider text-white/50 mb-1">{label}</p>
      <p className={`text-sm font-bold ${highlight ? 'text-sol' : 'text-white'}`}>{value}</p>
    </div>
  )
}
