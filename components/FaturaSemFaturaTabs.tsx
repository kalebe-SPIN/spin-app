'use client'

import { useState } from 'react'
import { FaturaForm } from '@/components/FaturaForm'
import { SemFaturaForm } from '@/components/SemFaturaForm'

type Aba = 'fatura' | 'sem_fatura'

export function FaturaSemFaturaTabs({
  projetoId,
  analiseSalva,
  beneficiariasSalvas,
  origemAtual,
  hspInicial,
  hspLabel,
}: {
  projetoId: string
  analiseSalva: any
  beneficiariasSalvas: any[]
  origemAtual?: string | null
  hspInicial?: number
  hspLabel?: string
}) {
  // Se já foi salvo sem fatura, começa nessa aba
  const inicial: Aba = origemAtual && origemAtual !== 'fatura' ? 'sem_fatura' : 'fatura'
  const [aba, setAba] = useState<Aba>(inicial)

  return (
    <div className="space-y-6">
      {/* Toggle */}
      <div className="grid grid-cols-2 gap-1 p-1 bg-white/[0.03] border border-white/10 rounded-lg">
        <button
          type="button"
          onClick={() => setAba('fatura')}
          className={`px-3 py-2.5 rounded text-sm font-bold transition ${
            aba === 'fatura'
              ? 'bg-weg-azul/20 border border-weg-azul/40 text-weg-azul'
              : 'text-white/60 hover:bg-white/5'
          }`}
        >
          📄 Com fatura (upload PDF)
        </button>
        <button
          type="button"
          onClick={() => setAba('sem_fatura')}
          className={`px-3 py-2.5 rounded text-sm font-bold transition ${
            aba === 'sem_fatura'
              ? 'bg-sol/20 border border-sol/40 text-sol'
              : 'text-white/60 hover:bg-white/5'
          }`}
        >
          ⚡ Sem fatura (modo rápido)
        </button>
      </div>

      {/* Conteúdo */}
      {aba === 'fatura' ? (
        <>
          <div className="bg-weg-azul/10 border border-weg-azul/30 rounded-xl p-4">
            <p className="text-sm text-white/80">
              A análise identifica automaticamente: <strong className="text-white">consumo médio</strong>,
              geração existente, demanda contratada, grupo tarifário (A/B), tipo de ligação (mono/tri) e observações
              do titular. Esses dados alimentam o dimensionamento nos próximos passos.
            </p>
          </div>
          <div className="bg-white/[0.03] border border-white/10 rounded-xl p-6 md:p-8">
            <FaturaForm
              projetoId={projetoId}
              analiseSalva={analiseSalva}
              beneficiariasSalvas={beneficiariasSalvas}
            />
          </div>
        </>
      ) : (
        <div className="bg-white/[0.03] border border-white/10 rounded-xl p-6 md:p-8">
          <SemFaturaForm
            projetoId={projetoId}
            hspInicial={hspInicial}
            hspLabel={hspLabel}
          />
        </div>
      )}
    </div>
  )
}
